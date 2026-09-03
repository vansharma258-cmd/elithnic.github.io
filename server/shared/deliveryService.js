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

/**
 * Generate a short-lived delivery claim for a verified sale.
 * The claim token is 32 random bytes (64 hex chars), stored server-side,
 * and atomically consumed on first use.
 *
 * @param {string} saleId - The verified sale ID
 * @returns {Promise<{success, claimToken, expiresAt}|{success:false, error}>}
 */
async function generateDeliveryClaim(saleId) {
  try {
    const db = admin.firestore();

    // Verify the sale exists and is verified
    const saleSnap = await db.collection('sales')
      .where('saleId', '==', saleId)
      .limit(1).get();

    if (saleSnap.empty) {
      return { success: false, error: 'Sale not found' };
    }

    const sale = saleSnap.docs[0].data();
    const isVerified = sale.status === 'verified' || sale.paymentStatus === 'verified';
    if (!isVerified) {
      return { success: false, error: 'Sale not verified' };
    }

    // Generate cryptographically random claim token (32 bytes = 256 bits)
    const claimToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.collection('delivery_claims').doc(claimToken).create({
      claimToken,
      saleId,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[Delivery] Generated claim for sale ${saleId}, expires ${expiresAt.toISOString()}`);
    return { success: true, claimToken, expiresAt: expiresAt.toISOString() };

  } catch (err) {
    // ALREADY_EXISTS means a claim for this saleId already exists (should not happen
    // in normal flow since /thanks/ is a single session, but defensively handle it)
    if (err.code === 6) { // ALREADY_EXISTS
      // Fetch the existing claim
      const db = admin.firestore();
      const existing = await db.collection('delivery_claims')
        .where('saleId', '==', saleId)
        .where('used', '==', false)
        .limit(1).get();
      if (!existing.empty) {
        const d = existing.docs[0].data();
        const isExpired = d.expiresAt && d.expiresAt.toMillis() < Date.now();
        if (!isExpired) {
          return { success: true, claimToken: d.claimToken, expiresAt: d.expiresAt.toDate().toISOString() };
        }
      }
    }
    console.error('[Delivery] Claim generation error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Atomically consume a delivery claim and the underlying delivery token.
 *
 * Both writes (claim.used=true AND delivery_token.used=true) commit together
 * inside a single Firestore transaction. If the delivery token does not exist,
 * is already used, or has expired, the transaction aborts WITHOUT consuming
 * the claim — the customer can retry later.
 *
 * Pure reads only happen inside the transaction (no HTTP, no random
 * generation, no independent commits). After the transaction commits, a
 * read-only product lookup is performed to build the existing authorized
 * download response. No second token is consumed.
 *
 * @param {string} claimToken
 * @returns {Promise<{success, downloadUrl, accessPassword, productName}|{success:false, error}>}
 */
async function consumeDeliveryClaim(claimToken) {
  try {
    const db = admin.firestore();

    const result = await db.runTransaction(async (tx) => {
      // 1. Read the claim
      const claimRef = db.collection('delivery_claims').doc(claimToken);
      const claimSnap = await tx.get(claimRef);

      if (!claimSnap.exists) {
        return { valid: false, error: 'Invalid or expired download link' };
      }

      const claim = claimSnap.data();

      // 2. Validate claim: not used, not expired
      if (claim.used) {
        return { valid: false, error: 'Invalid or expired download link' };
      }
      if (claim.expiresAt && claim.expiresAt.toMillis() < Date.now()) {
        return { valid: false, error: 'Invalid or expired download link' };
      }

      // 3. Read the sale referenced by the claim (server-bound, not browser-supplied)
      const saleQuery = await tx.get(
        db.collection('sales').where('saleId', '==', claim.saleId).limit(1)
      );
      if (saleQuery.empty) {
        return { valid: false, error: 'Invalid or expired download link' };
      }
      const sale = saleQuery.docs[0].data();

      // 4. Verify the sale is actually verified
      if (sale.status !== 'verified') {
        return { valid: false, error: 'Invalid or expired download link' };
      }

      // 5. Read the matching unused delivery token for this sale
      const tokenQuery = await tx.get(
        db.collection('delivery_tokens')
          .where('saleId', '==', claim.saleId)
          .where('used', '==', false)
          .limit(1)
      );

      if (tokenQuery.empty) {
        // No usable delivery token — ABORT. Claim is NOT marked used.
        return { valid: false, error: 'Download not available' };
      }

      const tokenDoc = tokenQuery.docs[0];
      const token = tokenDoc.data();

      // 6. Validate the delivery token: not expired, not used
      if (token.expiresAt && token.expiresAt.toMillis() < Date.now()) {
        return { valid: false, error: 'Download not available' };
      }
      if (token.singleUse && token.used) {
        return { valid: false, error: 'Download not available' };
      }

      // 7. Read the product for the response payload (read-only, no side effect)
      const productDoc = await tx.get(db.collection('products').doc(sale.productId));
      if (!productDoc.exists) {
        return { valid: false, error: 'Download not available' };
      }
      const product = productDoc.data();

      // 8. Atomically commit BOTH state changes together.
      //    If either write fails, the transaction retries; on conflict,
      //    the second concurrent request will see claim.used=true or
      //    token.used=true and abort.
      tx.update(claimRef, { used: true });
      tx.update(tokenDoc.ref, { used: true });

      return {
        valid: true,
        saleId: claim.saleId,
        productId: sale.productId,
        downloadUrl: product.zipUrl || null,
        accessPassword: product.zipPassword || null,
        productName: product.name,
      };
    });

    if (!result.valid) {
      return { success: false, error: result.error };
    }

    // Transaction committed. The product data was captured inside the
    // transaction (consistent read). No second consumeDeliveryToken() call
    // is performed — the token is already marked used atomically.
    return {
      success: true,
      downloadUrl: result.downloadUrl,
      accessPassword: result.accessPassword,
      productName: result.productName,
    };

  } catch (err) {
    console.error('[Delivery] Consume claim error:', err.message);
    return { success: false, error: 'Download failed. Please try again.' };
  }
}

module.exports = {
  generateDeliveryToken,
  validateDeliveryToken,
  getProductDownloadUrl,
  consumeDeliveryToken,
  generateDeliveryClaim,
  consumeDeliveryClaim,
};
