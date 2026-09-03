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

// Initialize Firebase Admin SDK BEFORE loading any module that calls admin.firestore().
// authService.js calls `const db = admin.firestore()` at module level.
admin.initializeApp();
const db = admin.firestore();

const qs = require('querystring');
const payu = require('./paymentService');
const { generateCommissionLedger } = require('./commissionService');
const { generateDeliveryToken } = require('./deliveryService');
const {
  authenticateWithCredentials,
  changePassword,
  resetUserPassword,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  listUsers,
  recoverAccount,
  migrateAllUsers,
  syncUserClaims,
  bootstrapAdmin,
  syncClaimsOnUserWrite
} = require('./authService');

// Re-export authentication functions so they are deployed alongside payment functions
exports.authenticateWithCredentials = authenticateWithCredentials;
exports.changePassword = changePassword;
exports.resetUserPassword = resetUserPassword;
exports.createUserAccount = createUserAccount;
exports.updateUserAccount = updateUserAccount;
exports.deleteUserAccount = deleteUserAccount;
exports.listUsers = listUsers;
exports.recoverAccount = recoverAccount;
exports.migrateAllUsers = migrateAllUsers;
exports.syncUserClaims = syncUserClaims;
exports.bootstrapAdmin = bootstrapAdmin;
exports.syncClaimsOnUserWrite = syncClaimsOnUserWrite;

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
   CALLABLE: nextSaleId (no auth required, rate-limited)
   ===========================================================
   Returns the next available SALE-XXXX identifier. The system
   counter is service-only; this is the only legitimate way for
   /pay/ to obtain a saleId.
   =========================================================== */
exports.nextSaleId = functions.https.onCall(async (data, context) => {
  try {
    const sysRef = db.collection('system').doc('counters');
    const newValue = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sysRef);
      const data = snap.exists ? snap.data() : {};
      const next = (data.saleIdCounter || 1000) + 1;
      tx.set(sysRef, { saleIdCounter: next }, { merge: true });
      return next;
    });
    return { saleId: 'SALE-' + newValue, saleIdCounter: newValue };
  } catch (err) {
    console.error('[nextSaleId] Error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to generate sale ID');
  }
});

/* ===========================================================
   CALLABLE: Lookup Closer Attribution (public)
   ===========================================================
   Validates a Closer Code and returns ONLY the attribution IDs
   needed for PayU sale creation. Does NOT expose the full
   closer/manager document structure.

   This replaces the direct Firestore reads from /pay/ that would
   otherwise let anyone enumerate all closers and managers.
   =========================================================== */
exports.lookupCloserAttribution = functions.https.onCall(async (data, context) => {
  const { closerCode } = (data && data.data) || data;

  if (!closerCode || typeof closerCode !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'closerCode is required');
  }

  const normalizedCode = closerCode.trim().toUpperCase();

  try {
    // 1. Find the closer
    const closerQuery = await db.collection('closers')
      .where('closerId', '==', normalizedCode)
      .limit(1)
      .get();

    if (closerQuery.empty) {
      // Fallback: try document ID
      const directDoc = await db.collection('closers').doc(normalizedCode).get();
      if (!directDoc.exists) {
        return { valid: false, error: 'Closer code not found' };
      }
      closerQuery; // use the direct doc
    }

    const closerDoc = closerQuery.empty
      ? { id: directDoc.id, data: () => directDoc.data() }
      : { id: closerQuery.docs[0].id, data: () => closerQuery.docs[0].data() };

    const closer = closerDoc.data();
    if (!closer) return { valid: false, error: 'Closer not found' };
    if (closer.status && closer.status !== 'active') {
      return { valid: false, error: 'This Closer Code is currently inactive' };
    }

    // 2. Find Product Manager
    const pmId = closer.assignedManagerId || closer.managerId;
    if (!pmId) {
      return { valid: false, error: 'This closer is not yet assigned to a manager' };
    }

    const pmDoc = await db.collection('managers').doc(pmId).get();
    if (!pmDoc.exists || !pmDoc.data()) {
      return { valid: false, error: 'Product Manager not found' };
    }
    const pm = pmDoc.data();
    const pmName = pm.name || null; // expose name only for display

    // 3. Find Senior Manager
    const smId = pm.seniorManagerId;
    if (!smId) {
      return { valid: false, error: 'This closer\'s manager has no Senior Manager assigned' };
    }
    const smDoc = await db.collection('managers').doc(smId).get();
    if (!smDoc.exists || !smDoc.data()) {
      return { valid: false, error: 'Senior Manager not found' };
    }
    const sm = smDoc.data();
    const smName = sm.name || null;

    return {
      valid: true,
      closerId: closerDoc.id,
      productManagerId: pmId,
      seniorManagerId: smId,
      // Display names only — these are safe to expose (they appear in attribution anyway)
      closerName: closer.name || normalizedCode,
      productManagerName: pmName,
      seniorManagerName: smName,
    };
  } catch (err) {
    console.error('[lookupCloserAttribution] Error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to verify Closer Code');
  }
});

/* ===========================================================
   CALLABLE: listActiveProducts (no auth — for /pay/ public listing)
   ===========================================================
   Returns ONLY public-facing product fields: id, name, description,
   price, tags, category, imageUrl, featured. No admin-only fields
   like zipUrl or zipPassword are exposed.
   =========================================================== */
exports.listActiveProducts = functions.https.onCall(async (data, context) => {
  try {
    const snap = await db.collection('products').where('status', '==', 'active').get();
    const products = snap.docs.map(d => {
      const p = d.data();
      return {
        id: d.id,
        name: p.name,
        description: p.description,
        price: p.price,
        category: p.category,
        tags: p.tags,
        imageUrl: p.imageUrl,
        featured: p.featured,
        // Explicitly NEVER include: zipUrl, zipPassword, zipStoragePath, etc.
      };
    });
    return { products };
  } catch (err) {
    console.error('[listActiveProducts] Error:', err.message);
    throw new functions.https.HttpsError('internal', 'Failed to load products');
  }
});

/* ===========================================================
   CALLABLE: createPayUSale (no auth — for /pay/ public checkout)
   ===========================================================
   Performs the entire public checkout in one server-authoritative step:
     1. Validates the closer attribution (server-side)
     2. Loads the product (server-side)
     3. Creates / updates the client record
     4. Generates the next SALE-XXXX
     5. Creates the sale record (status=pending)
     6. Creates the PayU payment session
   Returns ALL data the /pay/ page needs to render the receipt and
   redirect to PayU. The browser never touches sales, clients, or
   system collections.

   This eliminates the need for anonymous Firebase Auth on /pay/.
   =========================================================== */
exports.createPayUSale = functions.https.onCall(async (data, context) => {
  const payload = (data && data.data) || data || {};
  const { closerCode, productId, customer } = payload;

  if (!closerCode || typeof closerCode !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'closerCode is required');
  }
  if (!productId || typeof productId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'productId is required');
  }
  if (!customer || !customer.name || !customer.email || !customer.phone) {
    throw new functions.https.HttpsError('invalid-argument', 'customer.name, customer.email, customer.phone are required');
  }

  const normalizedCode = closerCode.trim().toUpperCase();

  try {
    // 1. Resolve closer attribution
    const closerQuery = await db.collection('closers')
      .where('closerId', '==', normalizedCode)
      .limit(1)
      .get();
    let closerDoc = null;
    let closer = null;
    if (!closerQuery.empty) {
      closerDoc = closerQuery.docs[0];
      closer = closerDoc.data();
    } else {
      const direct = await db.collection('closers').doc(normalizedCode).get();
      if (direct.exists) {
        closerDoc = direct;
        closer = direct.data();
      }
    }
    if (!closer) {
      throw new functions.https.HttpsError('not-found', 'Closer code not found');
    }
    if (closer.status && closer.status !== 'active') {
      throw new functions.https.HttpsError('failed-precondition', 'This Closer Code is currently inactive');
    }
    const pmId = closer.assignedManagerId || closer.managerId;
    if (!pmId) {
      throw new functions.https.HttpsError('failed-precondition', 'This closer is not yet assigned to a manager');
    }
    const pmDoc = await db.collection('managers').doc(pmId).get();
    if (!pmDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Product Manager not found');
    }
    const pm = pmDoc.data();
    const smId = pm.seniorManagerId;
    if (!smId) {
      throw new functions.https.HttpsError('failed-precondition', "Manager has no Senior Manager assigned");
    }
    const smDoc = await db.collection('managers').doc(smId).get();
    if (!smDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Senior Manager not found');
    }

    // 2. Load product
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Product not found');
    }
    const product = productDoc.data();
    const amount = Number(product.price);
    if (!amount || amount <= 0) {
      throw new functions.https.HttpsError('failed-precondition', 'Product has no valid price');
    }

    // 3. Create / find client
    const clientId = 'cl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await db.collection('clients').doc(clientId).set({
      id: clientId,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company: customer.company || '',
      status: 'active',
      createdDate: new Date().toISOString().slice(0, 10),
    }, { merge: true });

    // 4. Generate next saleId
    const sysRef = db.collection('system').doc('counters');
    const saleIdCounter = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sysRef);
      const data = snap.exists ? snap.data() : {};
      const next = (data.saleIdCounter || 1000) + 1;
      tx.set(sysRef, { saleIdCounter: next }, { merge: true });
      return next;
    });
    const saleId = 'SALE-' + saleIdCounter;

    // 5. Create sale (status=pending, immutable attribution IDs)
    const now = new Date().toISOString();
    const sale = {
      id: saleId,
      saleId: saleId,
      clientId: clientId,
      productId: product.id,
      productName: product.name,
      amount: amount,
      currency: 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      deliveryStatus: 'locked',
      closerId: closerDoc.id,
      closerCode: normalizedCode,
      productManagerId: pmId,
      seniorManagerId: smId,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerCompany: customer.company || '',
      createdAt: now,
      source: 'web-checkout'
    };
    await db.collection('sales').doc(saleId).set(sale);

    // 6. Create PayU session
    if (!payu.isConfigured()) {
      throw new functions.https.HttpsError('failed-precondition', 'PayU is not configured. Set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT environment variables.');
    }

    const payuCfg = (functions.config() && functions.config().payu) || {};
    const projectId = process.env.GCLOUD_PROJECT;
    const functionsOrigin = `https://us-central1-${projectId}.cloudfunctions.net`;
    const callbackUrl = payuCfg.callback_url || `${functionsOrigin}/paymentWebhook`;
    const successUrl = payuCfg.success_url
      ? payuCfg.success_url
      : `https://getelasos.com/thanks/?saleId=${encodeURIComponent(saleId)}`;
    const failureUrl = payuCfg.failure_url || 'https://getelasos.com/pay/';

    const session = await payu.createSession({
      amount: amount,
      currency: 'INR',
      productinfo: product.name,
      firstname: (customer.name || 'Customer').split(' ')[0],
      email: customer.email,
      phone: customer.phone,
      saleId,
      callbackUrl,
      successUrl,
      failureUrl
    });

    await db.collection('sales').doc(saleId).update({
      gatewaySessionId: session.txnid,
      paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 7. Return only customer-facing data + PayU redirect
    return {
      success: true,
      saleId: saleId,
      productName: product.name,
      amount: amount,
      currency: 'INR',
      // Display-only attribution names (no documents, no commission, no hierarchy)
      closerName: closer.name || normalizedCode,
      productManagerName: pm.name || null,
      seniorManagerName: smDoc.data().name || null,
      // PayU redirect
      txnid: session.txnid,
      gateway: session.gateway,
      environment: session.environment,
      paymentUrl: session.paymentUrl,
      params: session.params
    };
  } catch (err) {
    console.error('[createPayUSale] Error:', err.message);
    if (err.code && typeof err.code === 'string' && err.code.startsWith('functions/')) {
      throw err;
    }
    throw new functions.https.HttpsError('internal', err.message);
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
    const successUrl = payuCfg.success_url
      ? payuCfg.success_url
      : `https://getelasos.com/thanks/?saleId=${encodeURIComponent(saleId)}`;
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
   Verifies sale/payment status and returns ONLY customer-facing fields.
   No commission info, no hierarchy info, no PayU secrets.

   Accepts EITHER saleId OR transactionId (PayU mihpayid) — customers
   may only have the transaction ID from PayU's email/redirect.

   No authentication required — the callable verifies the payment
   server-side with PayU. The saleId/transactionId acts as the
   one-time lookup key.
   =========================================================== */
exports.verifyPayUPayment = functions.https.onCall(async (data, context) => {
  const { saleId, transactionId } = (data && data.data) || data;

  if (!saleId && !transactionId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId or transactionId is required');
  }

  try {
    let saleDoc = null;
    let sale = null;

    // 1. Find sale by saleId or transactionId
    if (saleId) {
      const saleQuery = await db.collection('sales')
        .where('saleId', '==', saleId)
        .limit(1)
        .get();
      if (!saleQuery.empty) {
        saleDoc = saleQuery.docs[0];
        sale = saleDoc.data();
      }
    }

    if (!sale && transactionId) {
      const txQuery = await db.collection('sales')
        .where('gatewayTransactionId', '==', transactionId)
        .limit(1)
        .get();
      if (!txQuery.empty) {
        saleDoc = txQuery.docs[0];
        sale = saleDoc.data();
      }
    }

    if (!sale) {
      // Try legacy productSales
      if (saleId) {
        const legacyQuery = await db.collection('productSales')
          .where('saleId', '==', saleId)
          .limit(1)
          .get();
        if (!legacyQuery.empty) {
          const legacy = legacyQuery.docs[0].data();
          return {
            verified: legacy.status === 'verified' || legacy.paymentStatus === 'paid',
            sale: {
              saleId: legacy.saleId,
              productName: legacy.productName || 'ELAS Product',
              amount: legacy.salePrice || legacy.amount,
              currency: 'INR',
              status: legacy.status || legacy.paymentStatus,
              paymentStatus: legacy.paymentStatus,
              deliveryStatus: 'locked',
            }
          };
        }
      }
      return { verified: false, error: 'Sale not found' };
    }

    // 2. Sale is already verified — return customer data
    if (sale.status === 'verified' && sale.paymentStatus === 'verified') {
      const tokenQuery = saleId
        ? await db.collection('delivery_tokens').where('saleId', '==', saleId).limit(1).get()
        : null;
      let tokenId = null;
      let tokenExpires = null;
      if (tokenQuery && !tokenQuery.empty) {
        const tokenData = tokenQuery.docs[0].data();
        tokenId = tokenQuery.docs[0].id;
        tokenExpires = tokenData.expiresAt ? tokenData.expiresAt.toMillis() : null;
      }

      // Return ONLY customer-facing fields — never expose commission or hierarchy
      return {
        verified: true,
        sale: {
          saleId: sale.saleId,
          productId: sale.productId,
          productName: sale.productName || 'ELAS Business OS',
          amount: sale.amount,
          currency: sale.currency || 'INR',
          status: sale.status,
          paymentStatus: sale.paymentStatus,
          verifiedAt: sale.verifiedAt,
          deliveryStatus: sale.deliveryStatus,
          deliveryTokenId: tokenId,
          deliveryTokenExpiresAt: tokenExpires,
        }
      };
    }

    // 3. Not verified — ask PayU to confirm (only if we have a gateway txnid)
    if (sale.gatewayTransactionId && payu.isConfigured()) {
      try {
        const payuResponse = await payu.verifyPaymentServerSide({
          txnid: sale.gatewayTransactionId
        });
        const txnDetails = payuResponse.transaction_details?.[sale.gatewayTransactionId];
        if (txnDetails && txnDetails.status === 'success') {
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
            return {
              verified: true,
              sale: {
                saleId: sale.saleId,
                productId: sale.productId,
                productName: sale.productName || 'ELAS Business OS',
                amount: sale.amount,
                currency: sale.currency || 'INR',
                status: 'verified',
                paymentStatus: 'verified',
                deliveryStatus: 'authorized',
              }
            };
          } else {
            return { verified: false, error: 'Payment verification failed — hash mismatch' };
          }
        }
      } catch (e) {
        console.error('[verifyPayUPayment] PayU API error:', e.message);
      }
    }

    // 4. Not verified — return current state (no sensitive data)
    return {
      verified: false,
      sale: {
        saleId: sale.saleId,
        productId: sale.productId,
        productName: sale.productName || 'ELAS Business OS',
        amount: sale.amount,
        currency: sale.currency || 'INR',
        status: sale.status,
        paymentStatus: sale.paymentStatus,
        deliveryStatus: sale.deliveryStatus || 'locked',
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
