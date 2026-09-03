/* ===========================================================
   ELAS — Delivery Service
   ===========================================================
   Generates secure temporary download tokens for verified sales.
   Token expires after configurable period (default 24h).
   =========================================================== */

const admin = require('firebase-admin');
const db = admin.firestore();
const crypto = require('crypto');

const TOKEN_EXPIRY_HOURS = parseInt(process.env.DELIVERY_TOKEN_EXPIRY_HOURS) || 24;

async function generateDeliveryToken(saleId) {
  try {
    // 1. Verify sale exists and is paid
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

    // 2. Generate secure token
    const tokenId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // 3. Store token
    await db.collection('delivery_tokens').doc(tokenId).set({
      id: tokenId,
      saleId: saleId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      singleUse: true,
      used: false
    });

    // 4. Update sale delivery status
    await saleQuery.docs[0].ref.update({
      deliveryStatus: 'authorized',
      deliveryTokenId: tokenId
    });

    console.log(`[Delivery] Generated token for sale ${saleId}, expires ${expiresAt.toISOString()}`);
    return {
      success: true,
      token: tokenId,
      expiresAt: expiresAt.toISOString()
    };

  } catch (err) {
    console.error('[Delivery] Token generation error:', err);
    return { success: false, error: err.message };
  }
}

async function validateDeliveryToken(tokenId) {
  try {
    const tokenDoc = await db.collection('delivery_tokens').doc(tokenId).get();

    if (!tokenDoc.exists) {
      return { valid: false, error: 'Invalid token' };
    }

    const token = tokenDoc.data();

    // Check expiry
    if (token.expiresAt && token.expiresAt.toMillis() < Date.now()) {
      return { valid: false, error: 'Token expired' };
    }

    // Check if used (if single-use)
    if (token.singleUse && token.used) {
      return { valid: false, error: 'Token already used' };
    }

    // Verify associated sale is paid
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

    return {
      valid: true,
      saleId: token.saleId,
      expiresAt: token.expiresAt.toDate()
    };

  } catch (err) {
    console.error('[Delivery] Token validation error:', err);
    return { valid: false, error: err.message };
  }
}

async function getProductDownloadUrl(saleId) {
  try {
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

    // TODO: Generate signed storage URL when cloud storage is configured
    // const signedUrl = await generateSignedStorageUrl(product.zipUrl);
    // return { success: true, downloadUrl: signedUrl, password: product.zipPassword };

    // Fallback: return existing zipUrl (replace with signed URL later)
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

module.exports = {
  generateDeliveryToken,
  validateDeliveryToken,
  getProductDownloadUrl
};