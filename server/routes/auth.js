/* ===========================================================
   ELAS — Auth Routes
   ===========================================================
   Replaces Firebase Cloud Functions callable auth endpoints.
   Uses Firebase Auth REST API to verify passwords server-side
   for migrated users (bypasses the original bug where migrated
   users got a custom token without password verification).

   All routes require Firebase Admin SDK (server-side only).
   =========================================================== */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// ============================================================
// Helpers (imported from shared)
// ============================================================
const { getFirestoreUserByLoginId, getFirestoreUserByAuthUid,
        buildCustomClaims, sanitizeUserForClient, getAdminDb } = require('../shared/firestore');
const { getFirebaseAuthToken } = require('../shared/firebaseAuth');

// ============================================================
// Rate Limiter — per-IP, shared across auth routes
// ============================================================
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login attempts per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
});

// Apply rate limiter to auth routes
router.use(authLimiter);

// ============================================================
// POST /auth/login
// authenticateWithCredentials replacement
// ============================================================
router.post('/login', async (req, res, next) => {
  try {
    const { loginId, password } = req.body;

    if (!loginId || !password) {
      return res.status(400).json({ error: 'loginId and password are required' });
    }

    const normalizedLoginId = String(loginId).trim().toUpperCase();
    const user = await getFirestoreUserByLoginId(normalizedLoginId);

    if (!user) {
      return res.status(404).json({ error: 'Invalid login credentials' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'This account has been disabled' });
    }

    const db = getAdminDb();

    // ============================================================
    // CRITICAL FIX: Verify password BEFORE issuing custom token
    // ============================================================
    if (user.authUid && user.migratedToFirebaseAuth) {
      // Migrated user — verify password via Firebase Auth REST API
      // (Firebase Admin SDK doesn't expose password verification directly)
      const firebaseEmail = `${normalizedLoginId.toLowerCase()}@elithnic.app`;
      const firebaseUid = user.authUid;

      // Verify the password against Firebase Auth using the REST API.
      // This requires an API key from the Firebase project.
      const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
      if (!firebaseApiKey) {
        console.error('[auth/login] FIREBASE_WEB_API_KEY not set — cannot verify migrated user password');
        return res.status(500).json({ error: 'Authentication service misconfigured' });
      }

      let tokenResult;
      try {
        const verifyResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: firebaseEmail,
              password: password,
              returnSecureToken: true,
            }),
          }
        );
        const verifyData = await verifyResp.json();

        if (verifyData.error) {
          // Firebase Auth rejected the password
          const errorCode = verifyData.error.errors?.[0]?.message || verifyData.error.message;
          console.warn(`[auth/login] Password verification failed for ${normalizedLoginId}: ${errorCode}`);
          return res.status(401).json({ error: 'Invalid login credentials' });
        }

        // Password verified — get the Firebase UID from the response
        tokenResult = verifyData;
      } catch (fetchErr) {
        console.error('[auth/login] Firebase Auth REST API error:', fetchErr.message);
        return res.status(500).json({ error: 'Authentication service unavailable' });
      }

      // Verify the Firebase Auth UID matches our record
      if (tokenResult.localId !== firebaseUid) {
        console.error('[auth/login] Firebase UID mismatch for', normalizedLoginId);
        return res.status(500).json({ error: 'Account mismatch — contact support' });
      }

      // Password verified. Generate custom token.
      const admin = require('firebase-admin');
      const customToken = await admin.auth().createCustomToken(firebaseUid, buildCustomClaims(user));

      return res.json({
        success: true,
        token: customToken,
        migrated: true,
        user: sanitizeUserForClient(user),
      });

    } else if (user.passwordHash) {
      // Legacy non-migrated user — verify against SHA-256 hash
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== user.passwordHash) {
        return res.status(401).json({ error: 'Invalid login credentials' });
      }

      // Password verified. Migrate to Firebase Auth now.
      const admin = require('firebase-admin');
      const firebaseEmail = `${normalizedLoginId.toLowerCase()}@elithnic.app`;
      const tempPassword = generateTempPassword();

      let firebaseUid;
      try {
        const firebaseUser = await admin.auth().createUser({
          uid: user.id,
          email: firebaseEmail,
          password: tempPassword,
          displayName: user.name || normalizedLoginId,
          disabled: false,
        });
        firebaseUid = firebaseUser.uid;

        // Set custom claims
        await admin.auth().setCustomUserClaims(firebaseUid, buildCustomClaims(user));

        // Link authUid in Firestore and clear passwordHash
        await db.collection('users').doc(user.id).update({
          authUid: firebaseUid,
          authEmail: firebaseEmail,
          passwordHash: require('firebase-admin').firestore.FieldValue.delete(),
          migratedToFirebaseAuth: true,
          migratedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[auth/login] Migrated user ${normalizedLoginId} to Firebase Auth`);
      } catch (err) {
        if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
          const existing = await admin.auth().getUserByEmail(firebaseEmail);
          firebaseUid = existing.uid;
          await admin.auth().setCustomUserClaims(firebaseUid, buildCustomClaims(user));
          await db.collection('users').doc(user.id).update({
            authUid: firebaseUid,
            authEmail: firebaseEmail,
            passwordHash: require('firebase-admin').firestore.FieldValue.delete(),
            migratedToFirebaseAuth: true,
          });
        } else {
          console.error('[auth/login] Migration failed for', normalizedLoginId, err.code, err.message);
          return res.status(500).json({
            error: 'Account migration failed. Please contact support.',
            diagnosticCode: err.code || 'NO_ERROR_CODE',
            diagnosticMessage: err.message || 'NO_ERROR_MESSAGE'
          });
        }
      }

      const customToken = await admin.auth().createCustomToken(firebaseUid, buildCustomClaims({
        ...user, authUid: firebaseUid,
      }));

      return res.json({
        success: true,
        token: customToken,
        migrated: true,
        mustResetPassword: true,
        user: sanitizeUserForClient(user),
      });

    } else {
      // Edge case: no authUid and no passwordHash
      return res.status(500).json({ error: 'Account is in an inconsistent state. Please contact support.' });
    }

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /auth/change-password
// changePassword replacement
// ============================================================
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const authUid = req.authUid;
    const user = await getFirestoreUserByAuthUid(authUid);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    const admin = require('firebase-admin');

    // Verify current password via Firebase Auth REST API (for migrated users)
    if (user.migratedToFirebaseAuth) {
      const firebaseApiKey = process.env.FIREBASE_WEB_API_KEY;
      if (firebaseApiKey) {
        const firebaseEmail = `${(user.loginId || '').toLowerCase()}@elithnic.app`;
        const verifyResp = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: firebaseEmail,
              password: currentPassword,
              returnSecureToken: false,
            }),
          }
        );
        const verifyData = await verifyResp.json();
        if (verifyData.error) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
      }
      // Fall through if FIREBASE_WEB_API_KEY not set — custom-token session proves identity
    } else if (user.passwordHash) {
      // Legacy: verify against SHA-256
      const hash = crypto.createHash('sha256').update(currentPassword).digest('hex');
      if (hash !== user.passwordHash) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    // Update Firebase Auth password
    try {
      await admin.auth().updateUser(authUid, { password: newPassword });
    } catch (err) {
      console.error('[auth/change-password] Firebase Auth update failed:', err.message);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Clear mustResetPassword flag if set
    if (user.mustResetPassword) {
      const db = getAdminDb();
      await db.collection('users').doc(user.id).update({
        mustResetPassword: false,
        passwordResetAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`[auth] Password changed for user ${user.id} (${user.loginId})`);
    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /auth/recover
// recoverAccount replacement (rate-limited separately)
// ============================================================
const recoverLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 recovery attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recovery attempts. Please try again in an hour.' },
});

router.post('/recover', recoverLimiter, async (req, res, next) => {
  try {
    const { recoveryKey, loginId } = req.body;

    if (!recoveryKey || !loginId) {
      return res.status(400).json({ error: 'recoveryKey and loginId are required' });
    }

    const normalizedLoginId = String(loginId).trim().toUpperCase();
    const user = await getFirestoreUserByLoginId(normalizedLoginId);

    if (!user) {
      return res.status(404).json({ error: 'Invalid credentials' });
    }

    if (!user.recoveryKeyHash) {
      return res.status(403).json({ error: 'No recovery key is set for this account. Contact support.' });
    }

    // Verify recovery key
    const hash = crypto.createHash('sha256').update(recoveryKey).digest('hex');
    if (hash !== user.recoveryKeyHash) {
      return res.status(401).json({ error: 'Invalid recovery key' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'This account has been disabled' });
    }

    if (!user.authUid) {
      return res.status(403).json({ error: 'This account has not been migrated. Please contact support.' });
    }

    // Generate custom token for immediate login
    const admin = require('firebase-admin');
    const customToken = await admin.auth().createCustomToken(user.authUid, buildCustomClaims(user));

    return res.json({
      success: true,
      token: customToken,
      user: sanitizeUserForClient(user),
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// Middleware: requireAuth
// Validates the Firebase ID token from the Authorization header.
// ============================================================
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const idToken = authHeader.slice(7);

  const admin = require('firebase-admin');
  admin.auth().verifyIdToken(idToken)
    .then(decoded => {
      req.authUid = decoded.uid;
      req.authToken = decoded;
      next();
    })
    .catch(err => {
      console.warn('[requireAuth] Token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired token' });
    });
}

module.exports = router;
module.exports.requireAuth = requireAuth;

// ============================================================
// Local Helpers
// ============================================================
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = 'ELAS-TEMP-';
  const randomBytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}
