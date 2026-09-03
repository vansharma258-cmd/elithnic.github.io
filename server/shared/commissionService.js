/* ===========================================================
   ELAS — Commission Service (Render Backend)
   ===========================================================
   Adapted from functions/commissionService.js for Express/Render.
   Immutable attribution: Closer ₹30,000 / PM ₹5,000 / SM ₹5,000 / Admin ₹0.
   Idempotent via commission_locks.
   =========================================================== */

const admin = require('firebase-admin');

function getCommissionRates() {
  return {
    closer: 30000,
    productManager: 5000,
    seniorManager: 5000,
    currency: 'INR'
  };
}

async function generateCommissionLedger(saleId, transactionId, sale) {
  try {
    if (sale.status !== 'verified' && sale.paymentStatus !== 'verified') {
      return { success: false, error: 'Sale not verified' };
    }

    const closerId = sale.closerId;
    if (!closerId) {
      return { success: false, error: 'Sale missing closerId' };
    }

    const db = admin.firestore();

    const closerDoc = await db.collection('closers').doc(closerId).get();
    if (!closerDoc.exists) {
      return { success: false, error: 'Closer not found' };
    }
    const closer = closerDoc.data();
    const productManagerId = closer.assignedManagerId || closer.managerId;
    if (!productManagerId) {
      return { success: false, error: 'Closer missing managerId (Product Manager)' };
    }

    const pmDoc = await db.collection('managers').doc(productManagerId).get();
    if (!pmDoc.exists) {
      return { success: false, error: 'Product Manager not found' };
    }
    const pm = pmDoc.data();
    const seniorManagerId = pm.seniorManagerId;
    if (!seniorManagerId) {
      return { success: false, error: 'Product Manager missing seniorManagerId' };
    }

    const rates = getCommissionRates();

    const lockRef = db.collection('commission_locks').doc(saleId);
    const ledgerId = `ledger_${saleId}`;

    const txResult = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists) {
        return { alreadyExists: true, lockData: lockSnap.data() };
      }

      tx.set(lockRef, {
        saleId,
        transactionId,
        reservedAt: admin.firestore.FieldValue.serverTimestamp(),
        ledgerId
      });

      const ledgerRef = db.collection('commissionLedger').doc(ledgerId);
      tx.set(ledgerRef, {
        id: ledgerId,
        saleId: sale.saleId,
        transactionId,
        closerId,
        productManagerId,
        seniorManagerId,
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
      console.log(`[Commission] Ledger already exists for ${saleId}`);
      return { success: true, alreadyExists: true, ledgerId: txResult.lockData.ledgerId };
    }

    await sendCommissionNotifications(saleId, closerId, productManagerId, seniorManagerId, rates);

    console.log(`[Commission] Generated ledger for ${saleId}: closer=₹${rates.closer}, pm=₹${rates.productManager}, sm=₹${rates.seniorManager}`);
    return { success: true, ledgerId: txResult.ledgerId, amounts: rates };

  } catch (err) {
    console.error('[Commission] Generation error:', err);
    return { success: false, error: err.message };
  }
}

async function sendCommissionNotifications(saleId, closerId, pmId, smId, rates) {
  const db = admin.firestore();
  const batch = db.batch();

  const closerUserQuery = await db.collection('users').where('entityId', '==', closerId).where('role', '==', 'closer').limit(1).get();
  if (!closerUserQuery.empty) {
    const closerUser = closerUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.closer.toLocaleString('en-IN')} commission added to your wallet`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: closerUser, saleId
    });
  }

  const pmUserQuery = await db.collection('users').where('entityId', '==', pmId).where('role', '==', 'productmanager').limit(1).get();
  if (!pmUserQuery.empty) {
    const pmUser = pmUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.productManager.toLocaleString('en-IN')} manager commission credited`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: pmUser, saleId
    });
  }

  const smUserQuery = await db.collection('users').where('entityId', '==', smId).where('role', '==', 'senior_manager').limit(1).get();
  if (!smUserQuery.empty) {
    const smUser = smUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.seniorManager.toLocaleString('en-IN')} senior manager commission credited`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: smUser, saleId
    });
  }

  await batch.commit();
}

module.exports = { generateCommissionLedger, getCommissionRates };
