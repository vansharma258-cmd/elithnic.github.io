/* ===========================================================
   ELAS — Firebase Functions Entry Point (PayU Integration)
   ===========================================================
   Server-side: PayU payment creation, webhook verification,
   commission generation, and secure delivery token generation.

   All sensitive financial operations use Firebase Admin SDK.
   Gateway credentials are stored in environment variables:
     - PAYU_MERCHANT_KEY
     - PAYU_MERCHANT_SALT
     - PAYU_MERCHANT_SALT2 (optional, used for verify_payment API)
     - PAYU_ENV (test | production)
   =========================================================== */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const qs = require('querystring');
const payu = require('./paymentService');
const { generateCommissionLedger } = require('./commissionService');
const { generateDeliveryToken } = require('./deliveryService');

admin.initializeApp();
const db = admin.firestore();

/* ===========================================================
   WEBHOOK: PayU Server-to-Server Reverse Callback
   ===========================================================
   PayU POSTs application/x-www-form-urlencoded to the curl URL.
   MUST verify the SHA-512 hash using the merchant SALT.
   MUST be idempotent (webhook_events collection).
   =========================================================== */
exports.paymentWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // PayU POSTs form-urlencoded. Use rawBody if available, else body.
  let callbackBody = req.body;
  if (typeof callbackBody === 'string') {
    callbackBody = qs.parse(callbackBody);
  }
  if (!callbackBody || typeof callbackBody !== 'object') {
    return res.status(400).json({ error: 'Empty or invalid body' });
  }

  try {
    // 1. Verify PayU SHA-512 hash signature
    if (!payu.verifyWebhookCallbackHash(callbackBody)) {
      console.error('[PayU Webhook] Invalid hash. Received:', callbackBody);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // 2. Normalize the callback
    const parsed = payu.parseWebhook(callbackBody);
    const {
      saleId, transactionId, orderId, amount, currency, status,
      gatewayEventId, hash
    } = parsed;

    if (!saleId) {
      return res.status(400).json({ error: 'Missing saleId (udf1)' });
    }
    if (!transactionId) {
      return res.status(400).json({ error: 'Missing transactionId' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // 3. Idempotency check — first hit creates a lock, second hits return success
    const eventId = `payu_${gatewayEventId}_${saleId}_${status}`;
    const eventRef = db.collection('webhook_events').doc(eventId);
    const existingEvent = await eventRef.get();
    if (existingEvent.exists) {
      console.log(`[PayU Webhook] Duplicate event ignored: ${eventId}`);
      return res.status(200).json({ status: 'already_processed' });
    }

    // 4. Find the matching sale
    const saleQuery = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      // Try legacy productSales
      const legacyQuery = await db.collection('productSales')
        .where('saleId', '==', saleId)
        .limit(1)
        .get();
      if (legacyQuery.empty) {
        return res.status(404).json({ error: 'Sale not found' });
      }
      // Legacy sale — don't process, just log
      console.warn(`[PayU Webhook] Legacy productSales match for ${saleId}, skipping commission flow`);
      await eventRef.set({
        saleId, transactionId, status, processedAt: admin.firestore.FieldValue.serverTimestamp(),
        legacy: true
      });
      return res.status(200).json({ status: 'legacy_sale_ignored' });
    }

    const saleDoc = saleQuery.docs[0];
    const sale = saleDoc.data();

    // 5. Amount validation — must match the stored sale amount exactly
    // PayU sends amount as string e.g. "100000.00"
    const saleAmount = Number(sale.amount);
    if (Math.abs(saleAmount - amount) > 0.01) {
      console.error(`[PayU Webhook] Amount mismatch for ${saleId}: expected ${saleAmount}, got ${amount}`);
      return res.status(400).json({
        error: 'Amount mismatch',
        expected: saleAmount,
        received: amount
      });
    }

    // 6. Reject non-success statuses (failure, pending, cancelled)
    if (status !== 'success') {
      await eventRef.set({
        saleId, transactionId, status, amount,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        verified: false
      });
      // Update sale to failed
      await saleDoc.ref.update({
        status: 'failed',
        paymentStatus: status === 'failure' ? 'failed' : 'pending',
        gatewayTransactionId: transactionId,
        gateway: 'payu',
        gatewayResponse: { status, amount, mode: parsed.mode, error: parsed.error, errorMessage: parsed.errorMessage }
      });
      return res.status(200).json({ status: 'recorded', saleStatus: status });
    }

    // 7. Atomic operation: lock event + create payment + update sale
    await db.runTransaction(async (tx) => {
      // First, ensure no double-fire
      const fresh = await tx.get(eventRef);
      if (fresh.exists) return; // idempotent

      // Mark event as processed (idempotency lock)
      tx.set(eventRef, {
        saleId, transactionId, status, amount, currency,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        verified: true
      });

      // Create payment record
      const paymentRef = db.collection('payments').doc(transactionId);
      tx.set(paymentRef, {
        id: transactionId,
        saleId,
        gateway: 'payu',
        gatewayOrderId: orderId,
        gatewayTransactionId: transactionId,
        mihpayId: parsed.gatewayEventId,
        amount: amount,
        currency: currency,
        status: 'verified',
        rawEventId: eventId,
        mode: parsed.mode,
        bankRefNum: parsed.bankRefNum,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        webhookProcessed: true
      });

      // Update sale to verified
      tx.update(saleDoc.ref, {
        status: 'verified',
        paymentStatus: 'verified',
        gateway: 'payu',
        gatewayTransactionId: transactionId,
        gatewayOrderId: orderId,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        deliveryStatus: 'authorized'
      });
    });

    // 8. Generate commission ledger (separate operation, after transaction)
    const commissionResult = await generateCommissionLedger(saleId, transactionId, sale);
    if (!commissionResult.success) {
      console.error(`[PayU Webhook] Commission failed for ${saleId}:`, commissionResult.error);
    }

    // 9. Generate delivery token
    const deliveryResult = await generateDeliveryToken(saleId);
    if (!deliveryResult.success) {
      console.error(`[PayU Webhook] Delivery token failed for ${saleId}`);
    }

    return res.status(200).json({ status: 'verified', saleId, transactionId });

  } catch (err) {
    console.error('[PayU Webhook] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/* ===========================================================
   CALLABLE: Create PayU Payment Session
   ===========================================================
   Called from /pay (public) and from /app (closer creates link).
   No auth required — the only thing this function does is
   generate the PayU checkout params. The actual money movement
   is between PayU and the customer; PayU's webhook is the
   authority for payment confirmation. This function does NOT
   mark any sale as paid or generate commission.
   =========================================================== */
exports.createPayUPayment = functions.https.onCall(async (data, context) => {
  const { saleId } = (data && data.data) || data;
  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
  }
  if (typeof saleId !== 'string' || !/^SALE-\d{4,}$/.test(saleId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid saleId format');
  }

  try {
    // Look up the sale (only the new 'sales' collection — legacy productSales
    // are explicitly NOT supported for new PayU payments)
    const saleQuery = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      throw new functions.https.HttpsError('not-found', 'Sale not found');
    }
    const saleDoc = saleQuery.docs[0];
    const sale = saleDoc.data();

    // Guard: cannot create session for already-verified sale
    if (sale.status === 'verified' && sale.paymentStatus === 'verified') {
      throw new functions.https.HttpsError('failed-precondition', 'Sale already verified');
    }

    // Look up product for display
    const productDoc = await db.collection('products').doc(sale.productId).get();
    const product = productDoc.exists ? productDoc.data() : { name: 'ELAS Business OS Lite' };

    // Look up client for billing details
    let firstname = 'Customer';
    let email = '';
    let phone = '';
    if (sale.clientId) {
      const clientDoc = await db.collection('clients').doc(sale.clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        firstname = (client.name || 'Customer').split(' ')[0];
        email = client.email || '';
        phone = client.phone || '';
      }
    }

    // Server-side URLs (configurable via Firebase env / functions config)
    // firebase functions:config:set payu.callback_url="..." payu.success_url="..." payu.failure_url="..."
    const payuCfg = (functions.config() && functions.config().payu) || {};
    const projectId = process.env.GCLOUD_PROJECT;
    const functionsOrigin = `https://us-central1-${projectId}.cloudfunctions.net`;
    const callbackUrl = payuCfg.callback_url || `${functionsOrigin}/paymentWebhook`;
    const successUrl = payuCfg.success_url || 'https://getelasos.com/thanks/';
    const failureUrl = payuCfg.failure_url || 'https://getelasos.com/pay/';

    // Check PayU is configured
    if (!payu.isConfigured()) {
      throw new functions.https.HttpsError('failed-precondition', 'PayU is not configured. Set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT environment variables.');
    }

    // Create the PayU session
    const session = await payu.createSession({
      amount: sale.amount,
      currency: sale.currency || 'INR',
      productinfo: product.name,
      firstname,
      email,
      phone,
      saleId,
      callbackUrl,
      successUrl,
      failureUrl
    });

    // Store the session reference in the sale record
    await saleDoc.ref.update({
      gatewaySessionId: session.txnid,
      paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      txnid: session.txnid,
      gateway: session.gateway,
      environment: session.environment,
      paymentUrl: session.paymentUrl,
      // Return ALL params the frontend needs to POST
      params: session.params
    };
  } catch (err) {
    console.error('[createPayUPayment] Error:', err.message);
    if (err.code && typeof err.code === 'string' && err.code.startsWith('functions/')) {
      throw err; // re-throw HttpsError as-is
    }
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/* ===========================================================
   CALLABLE: Server-side Sale Verification (for /thanks)
   ===========================================================
   Re-verifies sale status by calling PayU's verify_payment API.
   Used by /thanks to safely show product access only after
   a verified payment exists.
   =========================================================== */
exports.verifyPayUPayment = functions.https.onCall(async (data, context) => {
  const { saleId } = (data && data.data) || data;
  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
  }

  try {
    // First check the local sale record
    const saleQuery = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      return { verified: false, error: 'Sale not found' };
    }

    const saleDoc = saleQuery.docs[0];
    const sale = saleDoc.data();

    // If sale is already verified locally, trust it
    if (sale.status === 'verified' && sale.paymentStatus === 'verified') {
      return {
        verified: true,
        sale: {
          saleId: sale.saleId,
          productId: sale.productId,
          amount: sale.amount,
          currency: sale.currency,
          status: sale.status,
          paymentStatus: sale.paymentStatus,
          verifiedAt: sale.verifiedAt,
          gatewayTransactionId: sale.gatewayTransactionId
        }
      };
    }

    // Otherwise, ask PayU to confirm (only if we have a gateway txnid)
    if (sale.gatewayTransactionId && payu.isConfigured()) {
      try {
        const payuResponse = await payu.verifyPaymentServerSide({
          txnid: sale.gatewayTransactionId
        });
        // PayU response is a transaction_details object keyed by txnid
        const txnDetails = payuResponse.transaction_details?.[sale.gatewayTransactionId];
        if (txnDetails && txnDetails.status === 'success') {
          // Verify response hash
          if (txnDetails.hash && payu.verifyVerifyPaymentResponseHash(txnDetails)) {
            // Update sale to verified
            await saleDoc.ref.update({
              status: 'verified',
              paymentStatus: 'verified',
              verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              deliveryStatus: 'authorized'
            });
            // Generate commission + delivery
            await generateCommissionLedger(saleId, sale.gatewayTransactionId, sale);
            await generateDeliveryToken(saleId);
            return { verified: true, sale: { ...sale, status: 'verified', paymentStatus: 'verified' } };
          } else {
            return { verified: false, error: 'PayU response hash invalid' };
          }
        }
      } catch (e) {
        console.error('[verifyPayUPayment] PayU API error:', e.message);
      }
    }

    return {
      verified: false,
      sale: {
        saleId: sale.saleId,
        productId: sale.productId,
        amount: sale.amount,
        status: sale.status,
        paymentStatus: sale.paymentStatus
      }
    };
  } catch (err) {
    console.error('[verifyPayUPayment] Error:', err);
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/* ===========================================================
   CALLABLE: Generate Delivery Token
   =========================================================== */
exports.generateDeliveryTokenFn = functions.https.onCall(async (data, context) => {
  // Callable SDK wraps input as { data: payload }, raw HTTP calls may send { data: {saleId} }
  const { saleId } = (data && data.data) || data;
  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
  }
  try {
    const result = await generateDeliveryToken(saleId);
    if (!result.success) {
      throw new functions.https.HttpsError('internal', result.error);
    }
    return { token: result.token, expiresAt: result.expiresAt };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

/* ===========================================================
   HTTP: Download Product (with token)
   =========================================================== */
exports.downloadProduct = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { deliveryToken } = req.body;
  if (!deliveryToken) {
    return res.status(400).json({ error: 'Missing deliveryToken' });
  }

  try {
    const tokenDoc = await db.collection('delivery_tokens').doc(deliveryToken).get();
    if (!tokenDoc.exists) {
      return res.status(404).json({ error: 'Invalid delivery token' });
    }
    const tokenData = tokenDoc.data();
    const now = admin.firestore.Timestamp.now();
    if (tokenData.expiresAt && tokenData.expiresAt.toMillis() < now.toMillis()) {
      return res.status(410).json({ error: 'Delivery token expired' });
    }
    if (tokenData.used && tokenData.singleUse) {
      return res.status(410).json({ error: 'Delivery token already used' });
    }

    const saleQuery = await db.collection('sales')
      .where('saleId', '==', tokenData.saleId)
      .limit(1)
      .get();
    if (saleQuery.empty) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    const sale = saleQuery.docs[0].data();
    if (sale.status !== 'verified' || sale.paymentStatus !== 'verified') {
      return res.status(403).json({ error: 'Sale not verified' });
    }

    const productDoc = await db.collection('products').doc(sale.productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const product = productDoc.data();

    // Mark token as used
    await tokenDoc.ref.update({ used: true, usedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Try Firebase Storage signed URL first
    let downloadUrl = product.zipUrl;
    if (product.zipStoragePath) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(product.zipStoragePath);
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 30 * 60 * 1000 // 30 minutes
        });
        downloadUrl = signedUrl;
      } catch (e) {
        console.warn('[downloadProduct] Signed URL generation failed, using raw URL:', e.message);
      }
    }

    return res.json({
      productName: product.name,
      productDescription: product.description,
      downloadUrl,
      accessPassword: product.zipPassword
    });
  } catch (err) {
    console.error('[downloadProduct] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
