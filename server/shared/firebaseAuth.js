/* ===========================================================
   ELAS — Shared Firebase Auth Helpers
   ===========================================================
   Helper functions for Firebase Auth token verification.
   =========================================================== */

const admin = require('firebase-admin');

/**
 * Verify a Firebase ID token and return the decoded claims.
 * Throws if the token is invalid or expired.
 */
async function getFirebaseAuthToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { getFirebaseAuthToken };
