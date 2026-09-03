/* ===========================================================
   ELAS — Delivery Service (Render Backend)
   ===========================================================
   Generates and validates secure temporary download tokens.
   Token expires after configurable period (default 24h).
   =========================================================== */

const admin = require('firebase-admin');
const crypto = require('crypto');

const TOKEN_EXPIRY_HOURS = parseInt(process.env.DELIVERY_TOKEN_EXPIRY_HOURS) || 24;

async function generateDeliveryToken(saleId) {
  try {
    const db = admin.firestore();

    const saleQuery = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      return { success: false, error: 'Sale not found' };
    }

    const sale = saleQuery.docs[0].data();

    if (sale.status !== 'verified' && sale.paymentStatus !== 'verified') {
      return { success: false, error: 'Sale not verified — delivery not authorized' };
    }

    const tokenId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    await db.collection('delivery_tokens').doc(tokenId).set({
      id: tokenId,
      saleId: saleId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      singleUse: true,
      used: false
    });

    await saleQuery.docs[0].ref.update({
      deliveryStatus: 'authorized',
      deliveryTokenId: tokenId
    });

    console.log(`[Delivery] Generated token for sale ${saleId}, expires ${expiresAt.toISOString()}`);
    return { success: true, token: tokenId, expiresAt: expiresAt.toISOString() };

  } catch (err) {
    console.error('[Delivery] Token generation error:', err);
    return { success: false, error: err.message };
  }
}

async function validateDeliveryToken(tokenId) {
  try {
    const db = admin.firestore();
    const tokenDoc = await db.collection('delivery_tokens').doc(tokenId).get();

    if (!tokenDoc.exists) {
      return { valid: false, error: 'Invalid token' };
    }

    const token = tokenDoc.data();

    if (token.expiresAt && token.expiresAt.toMillis() < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }

    if (token.singleUse && token.used) {
      return { valid: false, error: 'Token already used' };
    }

    const saleQuery = await db.collection('sales')
      .where('saleId', '==', token.saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      return { valid: false, error: 'Associated sale not found' };
    }

    const sale = saleQuery.docs[0].data();
    if (sale.status !== 'verified') {
      return { valid: false, error: 'Sale not verified' };
    }

    return { valid: true, saleId: token.saleId, expiresAt: token.expiresAt.toDate() };

  } catch (err) {
    console.error('[Delivery] Token validation error:', err);
    return { valid: false, error: err.message };
  }
}

async function getProductDownloadUrl(saleId) {
  try {
    const db = admin.firestore();

    const saleQuery = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1)
      .get();

    if (saleQuery.empty) {
      return { success: false, error: 'Sale not found' };
    }

    const sale = saleQuery.docs[0].data();

    if (sale.status !== 'verified') {
      return { success: false, error: 'Sale not verified' };
    }

    const productDoc = await db.collection('products').doc(sale.productId).get();
    if (!productDoc.exists) {
      return { success: false, error: 'Product not found' };
    }

    const product = productDoc.data();

    return {
      success: true,
      downloadUrl: product.zipUrl || null,
      accessPassword: product.zipPassword || null,
      productName: product.name,
      note: 'Replace with signed URL when cloud storage is configured'
    };

  } catch (err) {
    console.error('[Delivery] Get download URL error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Atomically consume a single-use delivery token and return the download URL.
 * Uses a Firestore transaction to ensure two simultaneous requests cannot both
 * consume the same token.
 *
 * @param {string} tokenId - The delivery token ID
 * @returns {Promise<{valid, error, downloadUrl, accessPassword, productName}>}
 */
async function consumeDeliveryToken(tokenId) {
  try {
    const db = admin.firestore();

    const result = await db.runTransaction(async (tx) => {
      const tokenDoc = await tx.get(db.collection('delivery_tokens').doc(tokenId));

      if (!tokenDoc.exists) {
        return { valid: false, error: 'Invalid token' };
      }

      const token = tokenDoc.data();

      if (token.expiresAt && token.expiresAt.toMillis() < Date.now()) {
        return { valid: false, error: 'Token expired' };
      }

      if (token.singleUse && token.used) {
        return { valid: false, error: 'Token already used' };
      }

      // Load the associated sale
      const saleQuery = await tx.get(
        db.collection('sales').where('saleId', '==', token.saleId).limit(1)
      );

      if (saleQuery.empty) {
        return { valid: false, error: 'Associated sale not found' };
      }

      const sale = saleQuery.docs[0].data();

      if (sale.status !== 'verified') {
        return { valid: false, error: 'Sale not verified' };
      }

      // Mark token as used atomically within this transaction
      tx.update(tokenDoc.ref, { used: true });

      // Load product for download URL
      const productDoc = await tx.get(
        db.collection('products').doc(sale.productId)
      );

      if (!productDoc.exists) {
        return { valid: false, error: 'Product not found' };
      }

      const product = productDoc.data();

      return {
        valid: true,
        saleId: token.saleId,
        downloadUrl: product.zipUrl || null,
        accessPassword: product.zipPassword || null,
        productName: product.name,
      };
    });

    return result;

  } catch (err) {
    console.error('[Delivery] Consume token error:', err.message);
    return { valid: false, error: err.message };
  }
}

module.exports = { generateDeliveryToken, validateDeliveryToken, getProductDownloadUrl, consumeDeliveryToken };
