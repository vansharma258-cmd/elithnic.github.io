/* ===========================================================
   ELAS — Shared Firestore Helpers
   ===========================================================
   Helper functions used by all route modules.
   =========================================================== */

const admin = require('firebase-admin');

function getAdminDb() {
  return admin.firestore();
}

/**
 * Look up a Firestore user document by loginId.
 * Returns null if not found.
 */
async function getFirestoreUserByLoginId(loginId) {
  const db = getAdminDb();
  const q = await db.collection('users')
    .where('loginId', '==', String(loginId).trim().toUpperCase())
    .limit(1)
    .get();

  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Look up a Firestore user document by Firebase Auth UID.
 * Returns null if not found.
 */
async function getFirestoreUserByAuthUid(authUid) {
  if (!authUid) return null;
  const db = getAdminDb();
  const doc = await db.collection('users').doc(authUid).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Build custom claims for a Firestore user document.
 * These are embedded in the Firebase Auth token.
 */
function buildCustomClaims(firestoreUser) {
  const claims = {
    role: firestoreUser.role || 'client',
    loginId: firestoreUser.loginId || '',
  };
  if (firestoreUser.entityId) {
    claims.entityId = firestoreUser.entityId;
  }
  if (firestoreUser.seniorManagerId) {
    claims.seniorManagerId = firestoreUser.seniorManagerId;
  }
  if (firestoreUser.managerId) {
    claims.managerId = firestoreUser.managerId;
  }
  return claims;
}

/**
 * Sanitize user object for client response.
 * Removes all sensitive fields.
 */
function sanitizeUserForClient(user) {
  if (!user) return null;
  const { passwordHash, authUid, authEmail, migratedAt, ...safeUser } = user;
  return safeUser;
}

module.exports = {
  getAdminDb,
  getFirestoreUserByLoginId,
  getFirestoreUserByAuthUid,
  buildCustomClaims,
  sanitizeUserForClient,
};
