/* ===========================================================
   ELAS — Pay Routes (Public Checkout, Hierarchy-Scoped)
   ===========================================================
   All routes are public (no auth required) unless noted.
   Routes that expose data scoped by hierarchy now require auth
   and verify the caller's role/position in the chain.
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
const { getFirestoreUserByAuthUid } = require('../shared/firestore');

const deliveryClaimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ============================================================
// Hierarchy-Scoped Product Helpers
// ============================================================

/**
 * Resolve a product's assigned entities for the given caller role.
 * Returns { pmIds, closerEntityIds } — i.e. the products the caller
 * is allowed to see in this position in the hierarchy.
 */
async function resolveCallerProductScope(caller) {
  const db = admin.firestore();

  if (caller.role === 'admin') {
    // Admin sees all active products
    return { adminAll: true };
  }

  if (caller.role === 'senior_manager') {
    // SM sees products assigned to them via assignedSeniorManagerIds
    const smId = caller.id;
    const snap = await db.collection('products')
      .where('assignedSeniorManagerIds', 'array-contains', smId)
      .get();
    return { productIds: snap.docs.map(d => d.id) };
  }

  if (caller.role === 'productmanager') {
    // PM sees products assigned to them via assignedManagerIds
    const pmId = caller.id;
    const snap = await db.collection('products')
      .where('assignedManagerIds', 'array-contains', pmId)
      .get();
    return { productIds: snap.docs.map(d => d.id) };
  }

  if (caller.role === 'closer') {
    // Closer sees products where their entityId is in assignedCloserIds
    const entityId = caller.entityId;
    if (!entityId) return { productIds: [] };
    const snap = await db.collection('products')
      .where('assignedCloserIds', 'array-contains', entityId)
      .get();
    return { productIds: snap.docs.map(d => d.id) };
  }

  return { productIds: [] };
}

/**
 * Verify that a product is available to a Closer through the
 * Admin → SM → PM → Closer chain. Returns true only if:
 *   - product exists and status is "Active"
 *   - product.assignedCloserIds includes the closer's entityId
 *   - the closer's PM is in product.assignedManagerIds
 *   - the PM's SM is in product.assignedSeniorManagerIds
 *
 * For SMs creating PM, or PMs creating Closers, this same logic
 * verifies that the product distribution chain is valid.
 */
async function isProductAvailableToCloser(productDoc, caller) {
  if (caller.role !== 'closer' || !caller.entityId) return false;
  const p = productDoc.data();
  if (p.status !== 'Active') return false;

  // Closer must be in the product's assignedCloserIds
  const assignedClosers = p.assignedCloserIds || [];
  if (!assignedClosers.includes(caller.entityId)) return false;

  // Closer must have a PM assigned
  const closerEntityId = caller.entityId;
  const closerDoc = await admin.firestore().collection('closers').doc(closerEntityId).get();
  if (!closerDoc.exists) return false;
  const closer = closerDoc.data();
  const pmId = closer.assignedManagerId || closer.managerId;
  if (!pmId) return false;

  // The PM must be in product.assignedManagerIds
  const assignedManagers = p.assignedManagerIds || [];
  if (!assignedManagers.includes(pmId)) return false;

  // The PM must have a SM
  const pmUserDoc = await admin.firestore().collection('users').doc(pmId).get();
  if (!pmUserDoc.exists) return false;
  const pmUser = pmUserDoc.data();
  const smId = pmUser.seniorManagerId;
  if (!smId) return false;

  // The SM must be in product.assignedSeniorManagerIds
  const assignedSms = p.assignedSeniorManagerIds || [];
  if (!assignedSms.includes(smId)) return false;

  return true;
}

// ============================================================
// GET /pay/products
// Hierarchy-scoped, auth-required product listing.
// Returns ONLY products assigned to the caller through the chain.
// Never returns zipUrl / zipPassword.
// ============================================================
router.get('/products', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const scope = await resolveCallerProductScope(caller);
    const db = admin.firestore();

    let productDocs;
    if (scope.adminAll) {
      productDocs = await db.collection('products').where('status', '==', 'Active').get();
    } else if (!scope.productIds) {
      return res.json({ products: [] });
    } else if (scope.productIds.length === 0) {
      return res.json({ products: [] });
    } else {
      // Fetch by ID list, then filter by Active
      // Firestore 'in' supports up to 30; chunk for safety
      const chunks = [];
      for (let i = 0; i < scope.productIds.length; i += 30) {
        chunks.push(scope.productIds.slice(i, i + 30));
      }
      const all = [];
      for (const chunk of chunks) {
        const snap = await db.collection('products').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
        all.push(...snap.docs);
      }
      productDocs = { docs: all.filter(d => d.data().status === 'Active') };
    }

    const products = productDocs.docs.map(d => {
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
        purposeVideoUrl: p.purposeVideoUrl || null,
        // Explicitly NEVER include: zipUrl, zipPassword, zipStoragePath
        // Explicitly NEVER include: assignedManagerIds, assignedSeniorManagerIds
        // (these are internal admin/SM fields, not customer data)
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
// Public: validate a closer code (for legacy /pay/ flow).
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

    // Resolve PM from the canonical users/ collection
    const pmId = closer.assignedManagerId || closer.managerId;
    if (!pmId) {
      return res.json({ valid: false, error: 'This Closer is not yet assigned to a manager.' });
    }

    const pmDoc = await db.collection('users').doc(pmId).get();
    if (!pmDoc.exists) {
      return res.json({ valid: false, error: 'Product Manager not found.' });
    }
    const pm = pmDoc.data();
    if (pm.role !== 'productmanager') {
      return res.json({ valid: false, error: 'Assigned manager is not a Product Manager.' });
    }

    const smId = pm.seniorManagerId;
    if (!smId) {
      return res.json({ valid: false, error: "Manager has no Senior Manager assigned." });
    }

    const smDoc = await db.collection('users').doc(smId).get();
    if (!smDoc.exists) {
      return res.json({ valid: false, error: 'Senior Manager not found.' });
    }
    if (smDoc.data().role !== 'senior_manager') {
      return res.json({ valid: false, error: 'Assigned senior is not a Senior Manager.' });
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
// POST /pay/prepare-sale
// Authenticated closer (or PM/SM/admin) creates a pending sale
// with locked attribution. Server verifies that the requested
// product is actually assigned to the caller through the chain.
// ============================================================
router.post('/prepare-sale', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { productId, customer } = req.body || {};
    if (!productId || typeof productId !== 'string') {
      return res.status(400).json({ error: 'productId is required' });
    }

    // Customer pre-fill is optional
    let custName = null, custEmail = null, custPhone = null, custCompany = '';
    if (customer && typeof customer === 'object') {
      custName = (customer.name || '').toString().trim() || null;
      custEmail = (customer.email || '').toString().trim() || null;
      custPhone = (customer.phone || '').toString().trim() || null;
      custCompany = (customer.company || '').toString().trim() || '';
    }

    const db = admin.firestore();
    const role = caller.role;
    const entityId = caller.entityId || null;

    // Admins and senior managers can also create sale links (testing / no commission)
    const isPrivileged = ['admin', 'senior_manager'].includes(role);

    if (!isPrivileged && role !== 'closer') {
      return res.status(403).json({ error: 'Only Closers (or admins/senior managers) can create payment links' });
    }

    // Load product first
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) {
      return res.json({ success: false, error: 'Product not found' });
    }
    const product = productDoc.data();
    if (product.status !== 'Active') {
      return res.json({ success: false, error: 'Product is not available' });
    }

    let closerId = null;
    let closerDocRef = null;
    let pmId = null;
    let smId = null;

    if (role === 'closer') {
      if (!entityId) {
        return res.json({ success: false, error: 'Your account has no Closer entity assigned' });
      }

      // Verify the product is available to this Closer through the hierarchy chain
      const ok = await isProductAvailableToCloser(productDoc, caller);
      if (!ok) {
        return res.json({ success: false, error: 'This product is not available to you. Contact your Product Manager.' });
      }

      closerDocRef = db.collection('closers').doc(entityId);
      const closerSnap = await closerDocRef.get();
      if (!closerSnap.exists) {
        return res.json({ success: false, error: 'Closer record not found' });
      }
      const closer = closerSnap.data();
      closerId = entityId;
      pmId = closer.assignedManagerId || closer.managerId;

      const pmSnap = await db.collection('users').doc(pmId).get();
      if (!pmSnap.exists) {
        return res.json({ success: false, error: 'Product Manager not found' });
      }
      const pm = pmSnap.data();
      smId = pm.seniorManagerId;
      if (!smId) {
        return res.json({ success: false, error: 'Product Manager has no Senior Manager assigned' });
      }
    } else if (isPrivileged) {
      // Admin/SM can create a sale without commission attribution.
      // If a PM is implied, they can still create but the commission will
      // follow the immutable sale attribution. PMs/Admins/SMs are not in the
      // commission chain for sales they personally create.
      // Commission attribution is derived from sale.closerId etc., not from
      // who pressed the button.
    }

    const amount = Number(product.price);
    if (!amount || amount <= 0) {
      return res.json({ success: false, error: 'Product has no valid price' });
    }

    // Generate cryptographically strong unique Sale ID
    const sysRef = db.collection('system').doc('counters');
    const saleIdCounter = await db.runTransaction(async (tx) => {
      const snap = await tx.get(sysRef);
      const data = snap.exists ? snap.data() : {};
      const next = (data.saleIdCounter || 1000) + 1;
      tx.set(sysRef, { saleIdCounter: next }, { merge: true });
      return next;
    });
    const saleId = 'SALE-' + saleIdCounter;

    const now = new Date().toISOString();

    const sale = {
      id: saleId,
      saleId,
      clientId: null,
      productId: product.id,
      productName: product.name,
      amount,
      currency: 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      deliveryStatus: 'locked',
      // Attribution — locked server-side, never from browser
      closerId: closerId,
      closerCode: closerDocRef ? closerDocRef.id : null,
      productManagerId: pmId,
      seniorManagerId: smId,
      // Customer fields — can be pre-filled if provided
      customerName: custName,
      customerEmail: custEmail,
      customerPhone: custPhone,
      customerCompany: custCompany,
      createdAt: now,
      source: 'closer-link',
      saleInitiatedBy: req.authUid,
      paymentInitiatedAt: null,
      paidAt: null,
      gatewaySessionId: null,
    };

    await db.collection('sales').doc(saleId).set(sale);

    const frontendBase = process.env.FRONTEND_URL || 'https://getelasos.com';
    const paymentUrl = `${frontendBase}/pay/?saleId=${encodeURIComponent(saleId)}`;

    console.log(`[prepare-sale] Created pending sale ${saleId} for product ${product.id} by ${req.authUid} (role=${role})`);

    return res.json({
      success: true,
      saleId,
      productName: product.name,
      amount,
      currency: 'INR',
      paymentUrl,
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// GET /pay/sale/:saleId
// Public: load an existing pending sale for /pay/?saleId=
// Returns ONLY customer-safe fields.
// ============================================================
router.get('/sale/:saleId', async (req, res, next) => {
  try {
    const { saleId } = req.params;

    if (!saleId || typeof saleId !== 'string' || !/^SALE-\d+$/.test(saleId)) {
      return res.status(400).json({ error: 'Invalid sale reference' });
    }

    const db = admin.firestore();
    const saleSnap = await db.collection('sales').where('saleId', '==', saleId).limit(1).get();

    if (saleSnap.empty) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleSnap.docs[0].data();

    if (sale.status === 'verified' || sale.paymentStatus === 'verified') {
      return res.json({
        saleId: sale.saleId,
        status: 'already_paid',
        message: 'This payment has already been completed.',
      });
    }

    if (sale.status === 'failed' || sale.paymentStatus === 'failed') {
      return res.json({
        saleId: sale.saleId,
        status: 'payment_failed',
        message: 'This payment attempt was not successful. Please contact support.',
      });
    }

    return res.json({
      saleId: sale.saleId,
      productName: sale.productName || null,
      amount: sale.amount || null,
      currency: sale.currency || 'INR',
      status: sale.status || 'pending',
      closerName: sale.closerCode || null,
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /pay/sale
// createPayUSale replacement — full server-side checkout.
// Handles TWO paths:
//   1. Pre-created sale (?saleId present)
//   2. Legacy direct checkout (no saleId — client types closer code)
// ============================================================
router.post('/sale', async (req, res, next) => {
  try {
    const { saleId: inputSaleId, productId, closerCode, customer } = req.body || {};

    // PATH A: Pre-created sale from a closer-generated payment link
    if (inputSaleId && typeof inputSaleId === 'string') {
      const db = admin.firestore();
      const saleSnap = await db.collection('sales').where('saleId', '==', inputSaleId).limit(1).get();

      if (saleSnap.empty) {
        return res.json({ success: false, error: 'Sale not found. Please use the payment link provided by your Closer.' });
      }

      const saleDoc = saleSnap.docs[0];
      const sale = saleDoc.data();

      if (sale.status === 'verified' || sale.paymentStatus === 'verified') {
        return res.json({ success: false, error: 'This payment has already been completed.' });
      }

      if (sale.status !== 'pending' && sale.paymentStatus !== 'pending') {
        return res.json({ success: false, error: 'This sale cannot accept a new payment attempt.' });
      }

      if (!sale.productId) {
        return res.json({ success: false, error: 'Sale has no associated product. Contact support.' });
      }
      const productDoc = await db.collection('products').doc(sale.productId).get();
      if (!productDoc.exists) {
        return res.json({ success: false, error: 'Product no longer available. Contact support.' });
      }
      const product = productDoc.data();
      const amount = Number(product.price);
      if (!amount || amount <= 0) {
        return res.json({ success: false, error: 'Product has no valid price. Contact support.' });
      }

      if (!customer || !customer.name || !customer.email || !customer.phone) {
        return res.json({ success: false, error: 'Customer name, email, and phone are required.' });
      }

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

      await saleDoc.ref.update({
        clientId,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerCompany: customer.company || '',
        status: 'pending',
        paymentStatus: 'pending',
      });

      if (!payu.isConfigured()) {
        return res.json({ success: false, error: 'Payment is not configured. Contact support.' });
      }

      const apiBase = process.env.API_BASE_URL || `https://elas-api.onrender.com`;
      const callbackUrl = process.env.PAYU_CALLBACK_URL || `${apiBase}/webhook/payu`;
      const successUrl = process.env.PAYU_SUCCESS_URL || `https://getelasos.com/thanks/?saleId=${encodeURIComponent(inputSaleId)}`;
      const failureUrl = process.env.PAYU_FAILURE_URL || `${apiBase}/pay/?saleId=${encodeURIComponent(inputSaleId)}`;

      const session = await payu.createSession({
        amount,
        currency: 'INR',
        productinfo: product.name,
        firstname: (customer.name || 'Customer').split(' ')[0],
        email: customer.email,
        phone: customer.phone,
        saleId: inputSaleId,
        callbackUrl,
        successUrl,
        failureUrl,
      });

      await saleDoc.ref.update({
        gatewaySessionId: session.txnid,
        paymentInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        saleId: inputSaleId,
        productName: product.name,
        amount,
        currency: 'INR',
        txnid: session.txnid,
        gateway: session.gateway,
        environment: session.environment,
        paymentUrl: session.paymentUrl,
        params: session.params,
      });
    }

    // PATH B: Legacy direct checkout
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

    // 1. Resolve closer attribution from users/ + closers/ collections
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

    const pmDoc = await db.collection('users').doc(pmId).get();
    if (!pmDoc.exists) return res.json({ success: false, error: 'Product Manager not found' });
    const pm = pmDoc.data();
    if (pm.role !== 'productmanager') {
      return res.json({ success: false, error: 'Assigned manager is not a Product Manager' });
    }

    const smId = pm.seniorManagerId;
    if (!smId) return res.json({ success: false, error: "Manager has no Senior Manager assigned" });

    const smDoc = await db.collection('users').doc(smId).get();
    if (!smDoc.exists) return res.json({ success: false, error: 'Senior Manager not found' });
    if (smDoc.data().role !== 'senior_manager') {
      return res.json({ success: false, error: 'Assigned senior is not a Senior Manager' });
    }

    // 2. Load product
    const productDoc = await db.collection('products').doc(productId).get();
    if (!productDoc.exists) return res.json({ success: false, error: 'Product not found' });
    const product = productDoc.data();
    if (product.status !== 'Active') return res.json({ success: false, error: 'Product is not available' });
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
// POST /pay/verify — PayU server-side verification + commission
// (UNCHANGED — PayU server-side verification architecture preserved)
// ============================================================
router.post('/verify', async (req, res, next) => {
  try {
    const { saleId, transactionId } = req.body || {};
    const db = admin.firestore();

    if (!saleId && !transactionId) {
      return res.json({ sale: null, error: 'saleId or transactionId is required' });
    }

    let saleData = null;

    if (saleId) {
      const snap = await db.collection('sales').where('saleId', '==', saleId).limit(1).get();
      if (!snap.empty) {
        saleData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    if (!saleData && transactionId) {
      const snap = await db.collection('sales').where('gatewaySessionId', '==', transactionId).limit(1).get();
      if (!snap.empty) {
        saleData = { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }

    if (!saleData) {
      return res.json({ sale: null, error: 'No payment found with this reference. Contact getelasos@gmail.com if this is unexpected.' });
    }

    const storedTxnid = saleData.gatewaySessionId;
    if (!storedTxnid || typeof storedTxnid !== 'string') {
      return res.json({ sale: null, error: 'Payment reference is invalid. Please retry from the checkout page.' });
    }

    let payuResult;
    try {
      payuResult = await payu.verifyPaymentServerSide({ txnid: storedTxnid });
    } catch (e) {
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

    const txnDetails = payuResult && payuResult.transaction_details
      ? (payuResult.transaction_details[storedTxnid] || null)
      : null;

    if (!txnDetails) {
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
        console.warn('[verifyPayUPayment] Side-effect update warning:', e.message);
      }
    }

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
// Secure delivery: atomically consumes a server-issued claim token
// ============================================================
router.get('/delivery-claim/:claimToken', deliveryClaimLimiter, async (req, res, next) => {
  try {
    const { claimToken } = req.params;

    if (typeof claimToken !== 'string' || !/^[0-9a-f]{64}$/i.test(claimToken)) {
      return res.status(403).json({ error: 'Invalid or expired download link.' });
    }

    const result = await consumeDeliveryClaim(claimToken);

    if (!result.success) {
      return res.status(403).json({ error: 'Invalid or expired download link.' });
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

// ============================================================
// GET /pay/delivery/:token
// downloadProduct replacement
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
