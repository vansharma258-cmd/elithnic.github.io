/* ===========================================================
   ELAS — Pay Routes (Public Checkout)
   ===========================================================
   All routes are public (no auth required) unless noted.
   =========================================================== */

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const router = express.Router();

const payu = require('../shared/paymentService');
const { generateCommissionLedger } = require('../shared/commissionService');
const { generateDeliveryToken } = require('../shared/deliveryService');
const { requireAuth } = require('./auth');

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
// ============================================================
router.post('/verify', async (req, res, next) => {
  try {
    const { saleId, transactionId } = req.body || {};
    const db = admin.firestore();

    if (!saleId && !transactionId) {
      return res.json({ sale: null, error: 'saleId or transactionId is required' });
    }

    let saleData = null;
    let saleDocRef = null;

    if (saleId) {
      const snap = await db.collection('sales').where('saleId', '==', saleId).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0];
        saleData = { id: d.id, ...d.data() };
        saleDocRef = d.ref;
      }
    }

    if (!saleData && transactionId) {
      const snap = await db.collection('sales').where('gatewaySessionId', '==', transactionId).limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0];
        saleData = { id: d.id, ...d.data() };
        saleDocRef = d.ref;
      }
    }

    if (!saleData) {
      return res.json({ sale: null, error: 'No payment found with this reference. Contact getelasos@gmail.com if this is unexpected.' });
    }

    let verified = saleData.status === 'verified' || saleData.paymentStatus === 'verified';

    // If pending, do a server-side check with PayU
    if (!verified) {
      try {
        const payuResult = await payu.verifyPaymentServerSide({ txnid: saleData.gatewaySessionId });
        // PayU verify response format: { status: 1, ... }
        if (payuResult && payuResult.status === '1') {
          // Server confirmed payment — update the sale
          await saleDocRef.update({
            status: 'verified',
            paymentStatus: 'verified',
            paidAt: admin.firestore.FieldValue.serverTimestamp()
          });
          // Generate commission (idempotent via commission_locks)
          await generateCommissionLedger(saleData.saleId, saleData.gatewaySessionId, { ...saleData, status: 'verified' });
          verified = true;
          saleData = { ...saleData, status: 'verified', paymentStatus: 'verified' };
        }
      } catch (e) {
        console.warn('[verifyPayUPayment] PayU API error:', e.message);
        // Don't fail — return the current state
      }
    }

    // Return ONLY customer-facing fields — never hierarchy IDs, commission data, or secrets
    return res.json({
      sale: {
        saleId: saleData.saleId,
        productName: saleData.productName,
        amount: saleData.amount,
        currency: saleData.currency,
        status: saleData.status,
        verified,
        paymentStatus: saleData.paymentStatus,
        deliveryStatus: saleData.deliveryStatus,
        customerName: saleData.customerName,
      },
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
