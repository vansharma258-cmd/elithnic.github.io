/* ===========================================================
   ELAS — Commission Service (Render Backend)
   ===========================================================
   Immutable attribution: Closer ₹30,000 / PM ₹5,000 / SM ₹5,000 / Admin ₹0.
   Idempotent via commission_locks.

   Canonical data model:
     users/{smId}     role=senior_manager
     users/{pmId}      role=productmanager, seniorManagerId=smId
     users/{closerId} role=closer, entityId=closerEntityId, managerId=pmId
     closers/{closerEntityId} managerId=pmId

   PMs and SMs live in the users/ collection — NOT managers/.
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

    // Attribution must come from the immutable sale document, not current hierarchy
    const closerId = sale.closerId;
    if (!closerId) {
      return { success: false, error: 'Sale missing closerId' };
    }

    const db = admin.firestore();

    // Step 1: Load the closer entity record
    const closerDoc = await db.collection('closers').doc(closerId).get();
    if (!closerDoc.exists) {
      return { success: false, error: 'Closer entity not found' };
    }
    const closer = closerDoc.data();
    // Resolve PM from the closer entity's managerId field
    // (both assignedManagerId and managerId may be set; prefer assignedManagerId)
    const productManagerId = closer.assignedManagerId || closer.managerId;
    if (!productManagerId) {
      return { success: false, error: 'Closer has no assigned Product Manager' };
    }

    // Step 2: Load the PM user record from the canonical users/ collection
    // PMs are stored in users/ with role=productmanager — NOT managers/ collection
    const pmDoc = await db.collection('users').doc(productManagerId).get();
    if (!pmDoc.exists) {
      return { success: false, error: 'Product Manager user not found in users/ collection' };
    }
    const pm = pmDoc.data();
    if (pm.role !== 'productmanager') {
      return { success: false, error: `User ${productManagerId} is not a Product Manager (role=${pm.role})` };
    }
    const seniorManagerId = pm.seniorManagerId;
    if (!seniorManagerId) {
      return { success: false, error: 'Product Manager has no Senior Manager assigned' };
    }

    // Step 3: Verify the SM user record exists in users/ collection
    const smDoc = await db.collection('users').doc(seniorManagerId).get();
    if (!smDoc.exists) {
      return { success: false, error: 'Senior Manager user not found in users/ collection' };
    }
    const sm = smDoc.data();
    if (sm.role !== 'senior_manager') {
      return { success: false, error: `User ${seniorManagerId} is not a Senior Manager (role=${sm.role})` };
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

    console.log(`[Commission] Generated ledger for ${saleId}: closer=₹${rates.closer} (${closerId}), pm=₹${rates.productManager} (${productManagerId}), sm=₹${rates.seniorManager} (${seniorManagerId})`);
    return { success: true, ledgerId: txResult.ledgerId, amounts: rates };

  } catch (err) {
    console.error('[Commission] Generation error:', err);
    return { success: false, error: err.message };
  }
}

async function sendCommissionNotifications(saleId, closerId, pmId, smId, rates) {
  const db = admin.firestore();
  const batch = db.batch();

  // Notify closer — look up by entityId match in users/ collection
  const closerUserQuery = await db.collection('users')
    .where('entityId', '==', closerId)
    .where('role', '==', 'closer')
    .limit(1)
    .get();
  if (!closerUserQuery.empty) {
    const closerUserId = closerUserQuery.docs[0].id;
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.closer.toLocaleString('en-IN')} commission added to your wallet`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: closerUserId, saleId
    });
  }

  // Notify PM — look up by users/ doc ID directly (pmId IS the users/ doc ID)
  const pmDoc = await db.collection('users').doc(pmId).get();
  if (pmDoc.exists) {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.productManager.toLocaleString('en-IN')} manager commission credited`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: pmId, saleId
    });
  }

  // Notify SM — look up by users/ doc ID directly (smId IS the users/ doc ID)
  const smDoc = await db.collection('users').doc(smId).get();
  if (smDoc.exists) {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      id: notifRef.id,
      message: `Sale ${saleId} verified — ₹${rates.seniorManager.toLocaleString('en-IN')} senior manager commission credited`,
      type: 'success', read: false,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      targetUserId: smId, saleId
    });
  }

  await batch.commit();
}

module.exports = { generateCommissionLedger, getCommissionRates };
