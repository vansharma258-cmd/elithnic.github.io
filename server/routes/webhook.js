/* ===========================================================
   ELAS — Webhook Routes
   ===========================================================
   PayU server-to-server reverse callback.
   MUST verify SHA-512 hash before processing.
   MUST be idempotent (use webhook_events).
   =========================================================== */

const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();

const payu = require('../shared/paymentService');
const { generateCommissionLedger } = require('../shared/commissionService');
const { generateDeliveryToken } = require('../shared/deliveryService');

// ============================================================
// POST /webhook/payu
// PayU server-to-server reverse callback
// ============================================================
router.post('/payu', async (req, res) => {
  // PayU sends application/x-www-form-urlencoded.
  // We use express.raw() to get the body as a Buffer.
  // Then parse it manually to verify the hash.
  let body = req.body;
  if (Buffer.isBuffer(body)) {
    body = body.toString('utf8');
  }
  if (typeof body !== 'string') {
    // express.urlencoded() may have already parsed it
    return res.status(400).json({ error: 'Invalid body' });
  }

  // Parse URL-encoded form data
  const params = new URLSearchParams(body);
  const callbackBody = {};
  for (const [k, v] of params.entries()) {
    callbackBody[k] = v;
  }

  // 1. Verify PayU SHA-512 hash signature
  if (!payu.verifyWebhookCallbackHash(callbackBody)) {
    console.error('[PayU Webhook] Invalid hash received');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 2. Parse the webhook
  const parsed = payu.parseWebhook(callbackBody);
  if (!parsed.saleId || !parsed.status) {
    console.error('[PayU Webhook] Missing required webhook fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const db = admin.firestore();
  const eventId = parsed.transactionId + ':' + parsed.gatewayEventId;

  // 3. Idempotency lock — atomic create-once.
  // create() fails with ALREADY_EXISTS if a concurrent webhook already wrote
  // the lock. This prevents duplicate commission and duplicate delivery token
  // when PayU sends overlapping callbacks. If the create throws any other
  // error (transient), we fall through and let the side-effect idempotency
  // (commission_locks, used:true) act as a second line of defense.
  const eventRef = db.collection('webhook_events').doc(eventId);
  let idempotencyLocked = false;
  try {
    await eventRef.create({
      id: eventId,
      saleId: parsed.saleId,
      transactionId: parsed.transactionId,
      status: parsed.status,
      amount: parsed.amount,
      gatewayEventId: parsed.gatewayEventId,
      mode: parsed.mode,
      bankRefNum: parsed.bankRefNum,
      receivedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    idempotencyLocked = true;
  } catch (lockErr) {
    if (lockErr && lockErr.code === 6) { // ALREADY_EXISTS
      console.log(`[PayU Webhook] Duplicate event ${eventId} — skipping side effects`);
      return res.status(200).json({ success: true, idempotent: true });
    }
    // Transient error — log and continue. Side-effect idempotency still applies.
    console.warn(`[PayU Webhook] Idempotency lock write failed: ${lockErr.message}`);
  }

  // 4. Find the sale
  const saleSnap = await db.collection('sales')
    .where('saleId', '==', parsed.saleId)
    .limit(1).get();

  if (saleSnap.empty) {
    console.error(`[PayU Webhook] Sale ${parsed.saleId} not found`);
    return res.status(404).json({ error: 'Sale not found' });
  }

  const saleDoc = saleSnap.docs[0];
  const sale = saleDoc.data();

  // 5. Process the payment outcome
  const isSuccess = parsed.status === payu.PAYU_STATUS_SUCCESS;

  // Note: event audit record + idempotency lock already written at step 3.

  if (!isSuccess) {
    console.log(`[PayU Webhook] Non-success status: ${parsed.status} for sale ${parsed.saleId}`);
    await saleDoc.ref.update({
      paymentStatus: parsed.status, // 'failure' | 'pending'
      lastWebhookAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.json({ success: true, status: parsed.status });
  }

  // 6. Payment SUCCESS — validate amount before marking verified
  const expectedAmount = Number(sale.amount);
  const paidAmount = Number(parsed.amount);
  // Compare as paisa to avoid floating-point issues
  if (Math.abs(Math.round(expectedAmount * 100) - Math.round(paidAmount * 100)) !== 0) {
    console.error(`[PayU Webhook] Amount mismatch for sale ${parsed.saleId}: expected=${expectedAmount}, received=${paidAmount}`);
    await saleDoc.ref.update({
      paymentStatus: 'amount_mismatch',
      lastWebhookAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(400).json({ error: 'Payment amount mismatch' });
  }

  // 7. Amount verified — mark sale verified and generate commission + delivery token
  await saleDoc.ref.update({
    status: 'verified',
    paymentStatus: 'verified',
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
    gatewayTransactionId: parsed.transactionId,
    paymentMode: parsed.mode,
    lastWebhookAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 8. Generate commission (idempotent via commission_locks)
  const commResult = await generateCommissionLedger(parsed.saleId, parsed.transactionId, {
    ...sale, status: 'verified', paymentStatus: 'verified'
  });
  console.log(`[PayU Webhook] Commission result:`, JSON.stringify(commResult));

  // 9. Generate delivery token
  const delivResult = await generateDeliveryToken(parsed.saleId);
  console.log(`[PayU Webhook] Delivery result:`, JSON.stringify(delivResult));

  return res.json({ success: true, status: 'verified' });
});

module.exports = router;
