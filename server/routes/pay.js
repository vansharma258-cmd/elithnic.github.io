/* ===========================================================
   ELAS — Pay Routes (Public Checkout)
   ===========================================================
   All routes are public (no auth required) unless noted.
   =========================================================== */

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const payu = require('../shared/paymentService');
const { generateCommissionLedger } = require('../shared/commissionService');
const { generateDeliveryToken, generateDeliveryClaim, consumeDeliveryClaim } = require('../shared/deliveryService');
const { requireAuth } = require('./auth');

const deliveryClaimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ============================================================
// GET /pay/products
// listActiveProducts replacement
// ============================================================
router.get('/products', async (req, res, next) => {
  try {
    const db = admin.firestore();
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
        // Explicitly NEVER include: zipUrl, zipPassword, zipStoragePath
      };
    });
    return res.json({ products });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /pay/closer
// lookupCloserAttribution replacement
// ============================================================
router.post('/closer', async (req, res, next) => {
  try {
    const { closerCode } = req.body || {};
    if (!closerCode || typeof closerCode !== 'string') {
      return res.status(400).json({ valid: false, error: 'closerCode is required' });
    }

    const normalizedCode = closerCode.trim().toUpperCase();
    const db = admin.firestore();

    // Try query by closerId field first
    let closerQuery = await db.collection('closers')
      .where('closerId', '==', normalizedCode)
      .limit(1)
      .get();

    let closerDoc = null;
    let closer = null;
    if (!closerQuery.empty) {
      closerDoc = closerQuery.docs[0];
      closer = closerDoc.data();
    } else {
      // Try direct doc lookup
      const direct = await db.collection('closers').doc(normalizedCode).get();
      if (direct.exists) {
        closerDoc = direct;
        closer = direct.data();
      }
    }

    if (!closer) {
      return res.json({ valid: false, error: `Closer ID "${normalizedCode}" not found. Check with the person who referred you.` });
    }

    if (closer.status && closer.status !== 'active') {
      return res.json({ valid: false, error: 'This Closer ID is currently inactive.' });
    }

    const pmId = closer.assignedManagerId || closer.managerId;
    if (!pmId) {
      return res.json({ valid: false, error: 'This Closer is not yet assigned to a manager.' });
    }

    const pmDoc = await db.collection('managers').doc(pmId).get();
    if (!pmDoc.exists) {
      return res.json({ valid: false, error: 'Product Manager not found.' });
    }
    const pm = pmDoc.data();

    const smId = pm.seniorManagerId;
    if (!smId) {
      return res.json({ valid: false, error: "Manager has no Senior Manager assigned." });
    }

    const smDoc = await db.collection('managers').doc(smId).get();
    if (!smDoc.exists) {
      return res.json({ valid: false, error: 'Senior Manager not found.' });
    }

    return res.json({
      valid: true,
      closerId: closerDoc.id,
      productManagerId: pmId,
      seniorManagerId: smId,
      closerName: closer.name || normalizedCode,
      productManagerName: pm.name || null,
      seniorManagerName: smDoc.data().name || null,
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /pay/sale
// createPayUSale replacement — full server-side checkout
// ============================================================
router.post('/sale', async (req, res, next) => {
  try {
    const { productId, closerCode, customer } = req.body || {};

    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'productId is required' });
    }
    if (!closerCode || typeof closerCode !== 'string') {
      return res.status(400).json({ error: 'closerCode is required' });
    }
    if (!customer || !customer.name || !customer.email || !customer.phone) {
      return res.status(400).json({ error: 'customer.name, customer.email, customer.phone are required' });
    }

    const normalizedCode = closerCode.trim().toUpperCase();
    const db = admin.firestore();

    // 1. Resolve closer attribution
    let closerQuery = await db.collection('closers')
      .where('closerId', '==', normalizedCode)
      .limit(1).get();

    let closerDoc = null, closer = null;
    if (!closerQuery.empty) {
      closerDoc = closerQuery.docs[0]; closer = closerDoc.data();
    } else {
      const direct = await db.collection('closers').doc(normalizedCode).get();
      if (direct.exists) { closerDoc = direct; closer = direct.data(); }
    }

    if (!closer) {
      return res.json({ success: false, error: 'Closer code not found' });
    }
    if (closer.status && closer.status !== 'active') {
      return res.json({ success: false, error: 'This Closer Code is currently inactive' });
    }

    const pmId = closer.assignedManagerId || closer.managerId;
    if (!pmId) {
      return res.json({ success: false, error: 'Closer not assigned to a manager' });
    }

    const pmDoc = await db.collection('managers').doc(pmId).get();
    if (!pmDoc.exists) return res.json({ success: false, error: 'Product Manager not found' });
    const pm = pmDoc.data();

    const smId = pm.seniorManagerId;
    if (!smId) return res.json({ success: false, error: "Manager has no Senior Manager assigned" });

    const smDoc = await db.collection('managers').doc(smId).get();
    if (!smDoc.exists) return res.json({ success: false, error: 'Senior Manager not found' });

    // 2. Load product
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) return res.json({ success: false, error: 'Product not found' });
    const product = productDoc.data();
    const amount = Number(product.price);
    if (!amount || amount <= 0) return res.json({ success: false, error: 'Product has no valid price' });

    // 3. Create/find client
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

    // 4. Generate next saleId atomically
    const sysRef = db.collection('system').doc('counters');
    const saleIdCounter = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sysRef);
      const data = snap.exists ? snap.data() : {};
      const next = (data.saleIdCounter || 1000) + 1;
      tx.set(sysRef, { saleIdCounter: next }, { merge: true });
      return next;
    });
    const saleId = 'SALE-' + saleIdCounter;

    // 5. Create sale record
    const now = new Date().toISOString();
    const sale = {
      id: saleId, saleId,
      clientId, productId: product.id,
      productName: product.name,
      amount, currency: 'INR',
      status: 'pending', paymentStatus: 'pending',
      deliveryStatus: 'locked',
      closerId: closerDoc.id, closerCode: normalizedCode,
      productManagerId: pmId, seniorManagerId: smId,
      customerName: customer.name, customerEmail: customer.email,
      customerPhone: customer.phone, customerCompany: customer.company || '',
      createdAt: now, source: 'web-checkout'
    };
    await db.collection('sales').doc(saleId).set(sale);

    // 6. Create PayU session
    if (!payu.isConfigured()) {
      return res.json({ success: false, error: 'PayU is not configured. Contact support.' });
    }

    const projectId = process.env.GCLOUD_PROJECT || 'elithnic';
    const apiBase = process.env.API_BASE_URL || `https://elas-api.onrender.com`;
    const callbackUrl = process.env.PAYU_CALLBACK_URL || `${apiBase}/webhook/payu`;
    const successUrl = process.env.PAYU_SUCCESS_URL || `https://getelasos.com/thanks/?saleId=${encodeURIComponent(saleId)}`;
    const failureUrl = process.env.PAYU_FAILURE_URL || 'https://getelasos.com/pay/';

    const session = await payu.createSession({
      amount, currency: 'INR',
      productinfo: product.name,
      firstname: (customer.name || 'Customer').split(' ')[0],
      email: customer.email,
      phone: customer.phone,
      saleId, callbackUrl, successUrl, failureUrl
    });

    await db.collection('sales').doc(saleId).update({
      gatewaySessionId: session.txnid,
      paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 7. Return only customer-facing data
    return res.json({
      success: true,
      saleId,
      productName: product.name,
      amount,
      currency: 'INR',
      closerName: closer.name || normalizedCode,
      productManagerName: pm.name || null,
      seniorManagerName: smDoc.data().name || null,
      txnid: session.txnid,
      gateway: session.gateway,
      environment: session.environment,
      paymentUrl: session.paymentUrl,
      params: session.params
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /pay/verify
// verifyPayUPayment replacement
//
// SECURITY: A claim is issued ONLY after a successful server-side
// PayU verify_payment API call for the SERVER-STORED gatewaySessionId.
// The browser-supplied saleId/transactionId is used ONLY for sale lookup.
// Firestore sale.status === "verified" is NOT trusted as requester
// authorization — it is server-side payment state from a prior flow.
// ============================================================
router.post('/verify', async (req, res, next) => {
  try {
    const { saleId, transactionId } = req.body || {};
    const db = admin.firestore();

    if (!saleId && !transactionId) {
      return res.json({ sale: null, error: 'saleId or transactionId is required' });
    }

    // Step 1: Look up the sale by saleId, or by the server-stored
    // gatewaySessionId (which is what the browser may call "transactionId").
    // The browser-supplied transactionId is used ONLY as a lookup key into
    // our own Firestore; it is NEVER the txnid sent to PayU.
    let saleData = null;

    if (saleId) {
      const snap = await db.collection('sales').where('saleId', '==', saleId).limit(1).get();
      if (!snap.empty) {
        saleData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    if (!saleData && transactionId) {
      // Look up by stored gatewaySessionId — this confirms the
      // transactionId the browser supplied is one that THIS server
      // previously sent to PayU for THIS sale. It does not prove
      // payment on its own.
      const snap = await db.collection('sales').where('gatewaySessionId', '==', transactionId).limit(1).get();
      if (!snap.empty) {
        saleData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    if (!saleData) {
      return res.json({ sale: null, error: 'No payment found with this reference. Contact getelasos@gmail.com if this is unexpected.' });
    }

    // Step 2: Require a server-stored gatewaySessionId. Without it we
    // cannot call PayU's verify_payment API. A sale that has no
    // gatewaySessionId was never sent to PayU by this server.
    const storedTxnid = saleData.gatewaySessionId;
    if (!storedTxnid || typeof storedTxnid !== 'string') {
      return res.json({ sale: null, error: 'Payment reference is invalid. Please retry from the checkout page.' });
    }

    // Step 3: ALWAYS call PayU's verify_payment API. Use ONLY the
    // server-stored gatewaySessionId. The result is the only thing
    // that can authorize a delivery claim.
    let payuResult;
    try {
      payuResult = await payu.verifyPaymentServerSide({ txnid: storedTxnid });
    } catch (e) {
      // Network error, timeout, or invalid response from PayU.
      // Do NOT fall back to Firestore status. Do NOT issue a claim.
      console.warn('[verifyPayUPayment] PayU verify_payment API error:', e.message);
      return res.json({
        sale: {
          saleId: saleData.saleId,
          status: saleData.status,
          paymentStatus: saleData.paymentStatus,
        },
        verified: false,
        claimToken: null,
        claimExpiresAt: null,
        error: 'Payment verification is temporarily unavailable. Please try again in a moment.',
      });
    }

    // Step 4: Validate the PayU response corresponds to THIS sale's
    // stored transaction, with a successful payment, and a matching amount.
    const txnDetails = payuResult && payuResult.transaction_details
      ? (payuResult.transaction_details[storedTxnid] || null)
      : null;

    if (!txnDetails) {
      // PayU did not return a record for the txnid we asked about.
      return res.json({
        sale: {
          saleId: saleData.saleId,
          status: saleData.status,
          paymentStatus: saleData.paymentStatus,
        },
        verified: false,
        claimToken: null,
        claimExpiresAt: null,
        error: 'No payment found. Please retry from the checkout page.',
      });
    }

    // PayU success semantics: status field of the per-transaction record
    // is the string "success" for a successful payment. This matches the
    // webhook's existing validation (`parsed.status === payu.PAYU_STATUS_SUCCESS`).
    if (txnDetails.status !== 'success') {
      return res.json({
        sale: {
          saleId: saleData.saleId,
          status: saleData.status,
          paymentStatus: saleData.paymentStatus,
        },
        verified: false,
        claimToken: null,
        claimExpiresAt: null,
        error: 'Payment has not been completed successfully. Please retry from the checkout page.',
      });
    }

    // Defense in depth: the txnid PayU echoes back must match the one
    // we asked about. (transaction_details is keyed by txnid, but check anyway.)
    if (txnDetails.txnid && String(txnDetails.txnid) !== storedTxnid) {
      console.error(`[verifyPayUPayment] PayU txnid mismatch: asked=${storedTxnid}, got=${txnDetails.txnid}`);
      return res.json({
        sale: { saleId: saleData.saleId },
        verified: false,
        claimToken: null,
        claimExpiresAt: null,
        error: 'Payment verification failed. Please contact support.',
      });
    }

    // Amount check (paisa, same pattern as webhook.js:118).
    // PayU returns amount as a string; saleData.amount is a number.
    const expectedAmount = Number(saleData.amount);
    const paidAmount = Number(txnDetails.amount);
    if (!Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount) ||
        Math.abs(Math.round(expectedAmount * 100) - Math.round(paidAmount * 100)) !== 0) {
      console.error(`[verifyPayUPayment] Amount mismatch for sale ${saleData.saleId}: expected=${expectedAmount}, paid=${paidAmount}`);
      return res.json({
        sale: { saleId: saleData.saleId },
        verified: false,
        claimToken: null,
        claimExpiresAt: null,
        error: 'Payment verification failed. Please contact support.',
      });
    }

    // Step 5: All PayU checks passed. This request has proven that the
    // exact stored transaction was a successful payment for the exact
    // stored amount. We may now issue a delivery claim.
    //
    // Side effect: if the sale has not been marked verified by the
    // webhook yet (e.g. webhook is slow), promote it now. This is the
    // same flow the /pay/verify route already had for the pending case,
    // and is idempotent.
    if (saleData.status !== 'verified' || saleData.paymentStatus !== 'verified') {
      try {
        await db.collection('sales').doc(saleData.id).update({
          status: 'verified',
          paymentStatus: 'verified',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          gatewayTransactionId: storedTxnid,
        });
        await generateCommissionLedger(saleData.saleId, storedTxnid, {
          ...saleData, status: 'verified', paymentStatus: 'verified'
        });
        saleData = { ...saleData, status: 'verified', paymentStatus: 'verified' };
      } catch (e) {
        // The webhook may have raced us. Idempotent fields + commission_locks
        // mean this is safe to ignore. Continue to claim issuance.
        console.warn('[verifyPayUPayment] Side-effect update warning:', e.message);
      }
    }

    // Step 6: Issue a short-lived delivery claim so the customer can
    // download via /pay/delivery-claim/:claimToken. The claim is bound
    // server-side to this saleId.
    let claimToken = null;
    let claimExpiresAt = null;
    try {
      const claimResult = await generateDeliveryClaim(saleData.saleId);
      if (claimResult.success) {
        claimToken = claimResult.claimToken;
        claimExpiresAt = claimResult.expiresAt;
      } else {
        console.warn('[verifyPayUPayment] Claim generation failed:', claimResult.error);
      }
    } catch (e) {
      console.warn('[verifyPayUPayment] Claim generation error:', e.message);
    }

    return res.json({
      sale: {
        saleId: saleData.saleId,
        productName: saleData.productName,
        amount: saleData.amount,
        currency: saleData.currency,
        status: saleData.status,
        verified: true,
        paymentStatus: saleData.paymentStatus,
        deliveryStatus: saleData.deliveryStatus,
        customerName: saleData.customerName,
      },
      claimToken,
      claimExpiresAt,
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /pay/delivery-token
// generateDeliveryToken replacement (authed)
// ============================================================
router.post('/delivery-token', requireAuth, async (req, res, next) => {
  try {
    const { saleId } = req.body || {};
    if (!saleId) return res.status(400).json({ error: 'saleId is required' });

    const result = await generateDeliveryToken(saleId);
    if (!result.success) {
      return res.status(403).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /pay/delivery-claim/:claimToken
// Secure delivery: atomically consumes a server-issued claim token and
// returns the product download. The claim is 32 random bytes (256-bit),
// bound to one saleId, single-use, and expires in 30 minutes.
// Sale ID alone is NEVER sufficient to authorize delivery.
// ============================================================
router.get('/delivery-claim/:claimToken', deliveryClaimLimiter, async (req, res, next) => {
  try {
    const { claimToken } = req.params;

    // Basic format guard: must be a non-empty string of hex characters,
    // length 64 (32 bytes). Reject obviously malformed inputs cheaply.
    if (typeof claimToken !== 'string' || !/^[0-9a-f]{64}$/i.test(claimToken)) {
      return res.status(403).json({ error: 'Invalid or expired download link.' });
    }

    const result = await consumeDeliveryClaim(claimToken);

    if (!result.success) {
      // Generic error — never reveal internal state
      return res.status(403).json({ error: 'Invalid or expired download link.' });
    }

    // Delivery succeeded. Return the authorized product download.
    return res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      accessPassword: result.accessPassword,
      productName: result.productName,
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /pay/delivery/:token
// downloadProduct replacement — token-gated, single-use enforced atomically
// ============================================================
router.get('/delivery/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const { consumeDeliveryToken } = require('../shared/deliveryService');
    const result = await consumeDeliveryToken(token);

    if (!result.valid) {
      return res.status(403).json({ error: result.error || 'Invalid or expired token' });
    }

    return res.json({
      success: true,
      downloadUrl: result.downloadUrl,
      accessPassword: result.accessPassword,
      productName: result.productName,
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
