/* ===========================================================
   ELAS — Commission Service
   ===========================================================
   Generates commission ledger from verified sales.
   All commission calculations are server-side authoritative.
   Frontend display only — never authoritative.
   =========================================================== */

const admin = require('firebase-admin');
const db = admin.firestore();

/* ---------- Commission Rates (from config or defaults) ---------- */
function getCommissionRates() {
  // In production, fetch from system_config/commissionRates document
  // For now, use defaults
  return {
    closer: 30000,
    productManager: 5000,
    seniorManager: 5000,
    currency: 'INR'
  };
}

/* ---------- Generate Commission Ledger ----------
   Atomic via a per-sale lock document (`commission_locks/<saleId>`)
   read+created inside a single Firestore transaction. Two concurrent
   invocations for the same saleId cannot both pass: the second tx
   observes the lock exists and returns alreadyExists without writing.
   =========================================================== */
async function generateCommissionLedger(saleId, transactionId, sale) {
  try {
    // 1. Verify sale is in verified/paid state
    if (sale.status !== 'verified' && sale.paymentStatus !== 'verified') {
      return { success: false, error: 'Sale not verified' };
    }

    // 2. Resolve hierarchy outside the transaction (reads only)
    const closerId = sale.closerId;
    if (!closerId) {
      return { success: false, error: 'Sale missing closerId' };
    }

    const closerDoc = await db.collection('closers').doc(closerId).get();
    if (!closerDoc.exists) {
      return { success: false, error: 'Closer not found' };
    }
    const closer = closerDoc.data();
    const productManagerId = closer.managerId;
    if (!productManagerId) {
      return { success: false, error: 'Closer missing managerId (Product Manager)' };
    }

    const pmDoc = await db.collection('users').doc(productManagerId).get();
    if (!pmDoc.exists) {
      return { success: false, error: 'Product Manager not found' };
    }
    const pm = pmDoc.data();
    const seniorManagerId = pm.seniorManagerId;
    if (!seniorManagerId) {
      return { success: false, error: 'Product Manager missing seniorManagerId (Senior Manager)' };
    }

    // 3. Get commission rates
    const rates = getCommissionRates();

    // 4. Deterministic lock doc keyed by saleId.
    //    All concurrent invocations for the same saleId contend on
    //    this single document. First-writer wins.
    const lockRef = db.collection('commission_locks').doc(saleId);
    // Deterministic ledger id (no Date.now()) so repeated writes
    // would target the same document and still be blocked by the lock.
    const ledgerId = `ledger_${saleId}`;

    const txResult = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return { alreadyExists: true, lockData: lockSnap.data() };
      }

      // Reserve the lock first
      tx.set(lockRef, {
        saleId,
        transactionId,
        reservedAt: admin.firestore.FieldValue.serverTimestamp(),
        ledgerId
      });

      // Then create the ledger record (deterministic id)
      const ledgerRef = db.collection('commissionLedger').doc(ledgerId);
      tx.set(ledgerRef, {
        id: ledgerId,
        saleId: sale.saleId,
        transactionId: transactionId,
        closerId: closerId,
        productManagerId: productManagerId,
        seniorManagerId: seniorManagerId,
        closerAmount: rates.closer,
        productManagerAmount: rates.productManager,
        seniorManagerAmount: rates.seniorManager,
        currency: rates.currency,
        status: 'verified',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        payoutStatus: 'pending',
        attributionLocked: true
      });

      return { alreadyExists: false, ledgerId };
    });

    if (txResult.alreadyExists) {
      console.log(`[Commission] Ledger already exists for sale ${saleId} (lock present, ledgerId=${txResult.lockData.ledgerId})`);
      return { success: true, alreadyExists: true, ledgerId: txResult.lockData.ledgerId };
    }

    // 5. Notify relevant parties (outside the transaction — notifications
    //    are best-effort and idempotent at the UI level).
    await sendCommissionNotifications(saleId, closerId, productManagerId, seniorManagerId, rates);

    console.log(`[Commission] Generated ledger for sale ${saleId}: closer=₹${rates.closer}, pm=₹${rates.productManager}, sm=₹${rates.seniorManager}`);
    return { success: true, ledgerId: txResult.ledgerId, amounts: rates };

  } catch (err) {
    console.error('[Commission] Generation error:', err);
    return { success: false, error: err.message };
  }
}

/* ---------- Send Notifications ---------- */
async function sendCommissionNotifications(saleId, closerId, pmId, smId, rates) {
  const batch = db.batch();

  // Notify Closer
  const closerUserQuery = await db.collection('users').where('entityId', '==', closerId).where('role', '==', 'closer').limit(1).get();
  if (!closerUserQuery.empty) {
    const closerUser = closerUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.closer.toLocaleString('en-IN')} commission added to your wallet`,
      type: 'success',
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: closerUser,
      saleId: saleId
    });
  }

  // Notify Product Manager
  const pmUserQuery = await db.collection('users').where('entityId', '==', pmId).where('role', '==', 'productmanager').limit(1).get();
  if (!pmUserQuery.empty) {
    const pmUser = pmUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.productManager.toLocaleString('en-IN')} manager commission credited`,
      type: 'success',
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: pmUser,
      saleId: saleId
    });
  }

  // Notify Senior Manager
  const smUserQuery = await db.collection('users').where('entityId', '==', smId).where('role', '==', 'seniorManager').limit(1).get();
  if (!smUserQuery.empty) {
    const smUser = smUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.seniorManager.toLocaleString('en-IN')} senior manager commission credited`,
      type: 'success',
      read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: smUser,
      saleId: saleId
    });
  }

  await batch.commit();
}

/* ---------- Get Commission Ledger for Sale ---------- */
async function getCommissionLedger(saleId) {
  const query = await db.collection('commissionLedger')
    .where('saleId', '==', saleId)
    .limit(1)
    .get();

  if (query.empty) return null;
  return query.docs[0].data();
}

module.exports = {
  generateCommissionLedger,
  getCommissionLedger,
  getCommissionRates
};