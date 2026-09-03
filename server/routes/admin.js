/* ===========================================================
   ELAS — Admin Routes
   ===========================================================
   Admin-only routes: user CRUD, claim sync, list users.
   All routes require Bearer token auth and admin role.
   =========================================================== */

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const router = express.Router();

const { getAdminDb, getFirestoreUserByAuthUid, getFirestoreUserByLoginId,
        buildCustomClaims, sanitizeUserForClient } = require('../shared/firestore');
const { requireAuth } = require('./auth');

// ============================================================
// Middleware: requireAdmin
// ============================================================
async function requireAdmin(req, res, next) {
  if (!req.authUid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const user = await getFirestoreUserByAuthUid(req.authUid);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  req.caller = user;
  next();
}

// ============================================================
// GET /admin/users
// listUsers replacement
// ============================================================
router.get('/users', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(404).json({ error: 'Caller not found' });
    }

    const allowedRoles = ['admin', 'senior_manager', 'productmanager'];
    if (!allowedRoles.includes(caller.role)) {
      return res.status(403).json({ error: 'You cannot list users' });
    }

    const db = getAdminDb();
    const snapshot = await db.collection('users').get();
    const allUsers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    let visible;
    if (caller.role === 'admin') {
      visible = allUsers;
    } else if (caller.role === 'senior_manager') {
      const pms = allUsers.filter(u => u.role === 'productmanager' && u.seniorManagerId === caller.id);
      const pmIds = pms.map(p => p.id);
      const closers = allUsers.filter(u => u.role === 'closer' && pmIds.includes(u.managerId));
      visible = [caller, ...pms, ...closers];
    } else if (caller.role === 'productmanager') {
      const closers = allUsers.filter(u => u.role === 'closer' && u.managerId === caller.id);
      visible = [caller, ...closers];
    }

    const sanitized = visible.map(sanitizeUserForClient);
    return res.json({ users: sanitized });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /admin/users
// createUserAccount replacement
// ============================================================
router.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const caller = req.caller;
    const { loginId, password, name, role, entityId, seniorManagerId, managerId } = req.body;

    if (!loginId || !password || !name || !role) {
      return res.status(400).json({ error: 'loginId, password, name, and role are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const normalizedLoginId = String(loginId).trim().toUpperCase();

    // Check for existing user
    const existing = await getFirestoreUserByLoginId(normalizedLoginId);
    if (existing) {
      return res.status(409).json({ error: `Login ID ${normalizedLoginId} is already taken` });
    }

    // Generate stable Firestore doc ID
    const docIdHash = crypto.createHash('sha256').update(normalizedLoginId).digest('hex').slice(0, 16);
    const userId = `user_${docIdHash}`;

    const db = getAdminDb();
    const existingDoc = await db.collection('users').doc(userId).get();
    if (existingDoc.exists) {
      return res.status(409).json({ error: 'User ID collision. Please try a different loginId.' });
    }

    const firebaseEmail = `${normalizedLoginId.toLowerCase()}@elithnic.app`;
    const userClaims = buildCustomClaims({ role, entityId, seniorManagerId, managerId, loginId: normalizedLoginId });

    let firebaseUid;
    try {
      const firebaseUser = await admin.auth().createUser({
        uid: userId,
        email: firebaseEmail,
        password,
        displayName: name,
        disabled: false,
      });
      firebaseUid = firebaseUser.uid;
      await admin.auth().setCustomUserClaims(firebaseUid, userClaims);
    } catch (err) {
      if (err.code === 'auth/uid-already-exists') {
        const existingFirebaseUser = await admin.auth().getUserByEmail(firebaseEmail);
        firebaseUid = existingFirebaseUser.uid;
        await admin.auth().setCustomUserClaims(firebaseUid, userClaims);
      } else {
        console.error('[admin/users POST] Firebase Auth error:', err.message);
        return res.status(500).json({ error: 'Failed to create authentication account' });
      }
    }

    const userDoc = {
      id: userId,
      authUid: firebaseUid,
      authEmail: firebaseEmail,
      loginId: normalizedLoginId,
      name,
      role,
      entityId: entityId || null,
      seniorManagerId: seniorManagerId || null,
      managerId: managerId || null,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: caller.id,
      migratedToFirebaseAuth: true,
      passwordHash: admin.firestore.FieldValue.delete(),
    };

    await db.collection('users').doc(userId).set(userDoc);

    console.log(`[admin] ${caller.loginId} created user ${normalizedLoginId} (${userId})`);

    return res.json({
      success: true,
      userId,
      email: firebaseEmail,
      user: sanitizeUserForClient({ ...userDoc, id: userId }),
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /admin/users/:userId
// updateUserAccount replacement
// ============================================================
router.patch('/users/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const caller = req.caller;
    const { userId } = req.params;
    const updates = req.body;

    if (!userId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'userId and updates are required' });
    }

    const PROTECTED_FIELDS = ['authUid', 'authEmail', 'migratedToFirebaseAuth', 'passwordHash'];
    for (const field of PROTECTED_FIELDS) {
      if (field in updates) {
        return res.status(400).json({ error: `Field '${field}' cannot be changed via this endpoint` });
      }
    }

    const db = getAdminDb();

    // If role changed, update Firebase Auth custom claims
    if (updates.role) {
      const target = await getFirestoreUserByAuthUid(userId).catch(() => null) ||
        (await db.collection('users').doc(userId).get()).data();
      if (target && target.authUid) {
        const newClaims = buildCustomClaims({ ...target, ...updates });
        await admin.auth().setCustomUserClaims(target.authUid, newClaims);
      }
    }

    const sanitizedUpdates = { ...updates };
    delete sanitizedUpdates.id;
    delete sanitizedUpdates.authUid;
    delete sanitizedUpdates.authEmail;
    delete sanitizedUpdates.migratedToFirebaseAuth;
    delete sanitizedUpdates.passwordHash;

    await db.collection('users').doc(userId).update({
      ...sanitizedUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.id,
    });

    console.log(`[admin] ${caller.loginId} updated user ${userId}`);

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// DELETE /admin/users/:userId
// deleteUserAccount replacement
// ============================================================
router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const caller = req.caller;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const target = await getFirestoreUserByAuthUid(userId).catch(() => null) ||
      (await getAdminDb().collection('users').doc(userId).get()).exists ?
      { id: userId, ...(await getAdminDb().collection('users').doc(userId).get()).data() } : null;

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be deleted via this endpoint' });
    }

    if (target.authUid) {
      try {
        await admin.auth().deleteUser(target.authUid);
      } catch (err) {
        if (err.code !== 'auth/user-not-found') {
          console.error('[admin/users DELETE] Firebase Auth delete failed:', err.message);
          return res.status(500).json({ error: 'Failed to delete authentication account' });
        }
      }
    }

    await getAdminDb().collection('users').doc(userId).delete();

    console.log(`[admin] ${caller.loginId} deleted user ${userId} (${target.loginId})`);

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /admin/users/:userId/reset-password
// resetUserPassword replacement
// ============================================================
router.post('/users/:userId/reset-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const caller = req.caller;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Accept either userId or loginId in body
    const targetUserId = req.body.targetUserId || userId;
    const target = await getFirestoreUserByAuthUid(targetUserId).catch(() => null) ||
      (await getAdminDb().collection('users').doc(targetUserId).get()).exists ?
      { id: targetUserId, ...(await getAdminDb().collection('users').doc(targetUserId).get()).data() } : null;

    if (!target) {
      // Try by loginId
      const byLogin = await getFirestoreUserByLoginId(targetUserId);
      if (!byLogin) {
        return res.status(404).json({ error: 'User not found' });
      }
      // Use the byLogin user
      return await resetPassword(admin, getAdminDb(), caller, byLogin, res);
    }

    return await resetPassword(admin, getAdminDb(), caller, target, res);

  } catch (err) {
    next(err);
  }
});

async function resetPassword(admin, db, caller, target, res) {
  if (!target.authUid) {
    return res.status(403).json({ error: 'User is not yet migrated to Firebase Auth' });
  }

  const tempPassword = generateTempPassword();

  try {
    await admin.auth().updateUser(target.authUid, { password: tempPassword });
    await db.collection('users').doc(target.id).update({
      mustResetPassword: true,
      lastPasswordResetBy: caller.id,
      lastPasswordResetAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[admin] ${caller.loginId} reset password for ${target.loginId}`);

    return res.json({
      success: true,
      tempPassword,
      message: `Password reset for ${target.name || target.loginId}. Share this temporary password securely.`,
    });
  } catch (err) {
    console.error('[reset-password] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
}

// ============================================================
// POST /admin/users/:userId/sync-claims
// syncUserClaims replacement
// ============================================================
router.post('/users/:userId/sync-claims', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const caller = req.caller;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const userDoc = await getAdminDb().collection('users').doc(userId).get();
    const user = userDoc.exists ? userDoc.data() : null;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.authUid) {
      return res.status(403).json({ error: 'User is not migrated to Firebase Auth' });
    }

    const claims = buildCustomClaims(user);
    await admin.auth().setCustomUserClaims(user.authUid, claims);

    console.log(`[admin] ${caller.loginId} synced claims for ${userId}`);

    return res.json({ success: true, claims });

  } catch (err) {
    next(err);
  }
});

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = 'ELAS-TEMP-';
  const randomBytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}

module.exports = router;
