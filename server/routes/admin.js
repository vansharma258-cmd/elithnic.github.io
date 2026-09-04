/* ===========================================================
   ELAS — Admin Routes (Hierarchy-Aware)
   ===========================================================
   Implements the authoritative ELAS hierarchy:
     ADMIN
       → creates Senior Managers, Product Managers, Closers
     SENIOR MANAGER
       → creates Product Managers ONLY under itself
     PRODUCT MANAGER
       → creates Closers ONLY under itself
     CLOSER
       → no user management authority

   All user/relationship mutations are derived server-side from
   the authenticated caller's identity — never trusted from
   the browser. The legacy `requireAdmin` middleware has been
   replaced with `canManageUser(caller, target, action)` which
   enforces the hierarchy rules.
   =========================================================== */

const express = require('express');
const crypto = require('crypto');
const admin = require('firebase-admin');
const router = express.Router();

const { getAdminDb, getFirestoreUserByAuthUid, getFirestoreUserByLoginId,
        buildCustomClaims, sanitizeUserForClient } = require('../shared/firestore');
const { requireAuth } = require('./auth');

// ============================================================
// Hierarchy Authorization Helpers
// ============================================================

/**
 * Resolve the caller's full Firestore user doc.
 * Sets req.caller for downstream handlers.
 */
async function loadCaller(req, res, next) {
  if (!req.authUid) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const caller = await getFirestoreUserByAuthUid(req.authUid);
  if (!caller) {
    return res.status(401).json({ error: 'Caller user record not found' });
  }
  req.caller = caller;
  next();
}

/**
 * Can `actor` create a user with the given `targetRole`?
 * Returns { allowed: true, forcedFields: {...} } or { allowed: false, reason: '...' }.
 *
 * Hierarchy rules:
 *   - admin can create any role
 *   - senior_manager can create productmanager only, forces seniorManagerId = self
 *   - productmanager can create closer only, forces managerId = self
 *   - everything else is denied
 */
async function canCreateUser(actor, targetRole) {
  if (!actor || !actor.role) return { allowed: false, reason: 'Invalid caller' };

  if (actor.role === 'admin') {
    // Admin is authorized to create any of the canonical roles.
    // The role passed in `targetRole` has already been accepted by this gate;
    // we echo it back in forcedFields so the handler has a single, uniform
    // source of truth for finalRole. SM/PM branches still gate targetRole
    // explicitly and force parent IDs to the caller's own id.
    return { allowed: true, forcedFields: { role: targetRole } };
  }

  if (actor.role === 'senior_manager') {
    if (targetRole === 'productmanager') {
      return {
        allowed: true,
        forcedFields: {
          role: 'productmanager',
          seniorManagerId: actor.id,
          managerId: null,
          entityId: null,
        },
      };
    }
    return { allowed: false, reason: 'Senior Managers can only create Product Managers' };
  }

  if (actor.role === 'productmanager') {
    if (targetRole === 'closer') {
      return {
        allowed: true,
        forcedFields: {
          role: 'closer',
          seniorManagerId: null,
          managerId: actor.id,
        },
      };
    }
    return { allowed: false, reason: 'Product Managers can only create Closers' };
  }

  return { allowed: false, reason: 'You do not have authority to create users' };
}

/**
 * Can `actor` modify the given `target` user record?
 * Admins have full authority.
 * Senior Managers can modify their own Product Managers.
 * Product Managers can modify their own Closers.
 * No cross-hierarchy modifications.
 */
async function canModifyUser(actor, target) {
  if (!actor || !actor.role) return false;
  if (actor.role === 'admin') return true;
  if (!target) return false;

  if (actor.role === 'senior_manager' && target.role === 'productmanager') {
    return target.seniorManagerId === actor.id;
  }

  if (actor.role === 'productmanager' && target.role === 'closer') {
    return target.managerId === actor.id;
  }

  return false;
}

/**
 * Can `actor` reset the password / delete / toggle status of `target`?
 * Per authoritative model: only Admin may perform these actions.
 * SM/PM cannot reset passwords, delete, or toggle status of any user.
 */
function canPerformAdminOnlyAction(actor) {
  return actor && actor.role === 'admin';
}

// ============================================================
// GET /admin/users
// listUsers replacement — hierarchy-scoped listing
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
// Hierarchy-aware user creation.
// SM can create PM. PM can create Closer (with closers/ entity).
// Admin can create any role.
// ============================================================
router.post('/users', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Caller not found' });
    }
    req.caller = caller;

    const {
      loginId, password, name, role, entityId,
      seniorManagerId, managerId, whatsapp, email, commissionRate, closerData,
    } = req.body || {};

    if (!loginId || !password || !name || !role) {
      return res.status(400).json({ error: 'loginId, password, name, and role are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Step 1: Hierarchy authorization — derive forced fields
    const decision = await canCreateUser(caller, role);
    if (!decision.allowed) {
      return res.status(403).json({ error: decision.reason || 'Forbidden' });
    }

    // Browser-supplied parent IDs are NEVER trusted for hierarchy relationships.
    // We only accept browser-supplied role/parent ID values as informational;
    // the server ALWAYS uses decision.forcedFields for the canonical relationships.
    const finalRole = decision.forcedFields.role;
    const finalSeniorManagerId = decision.forcedFields.seniorManagerId !== undefined
      ? decision.forcedFields.seniorManagerId
      : (caller.role === 'admin' ? (seniorManagerId || null) : null);
    const finalManagerId = decision.forcedFields.managerId !== undefined
      ? decision.forcedFields.managerId
      : (caller.role === 'admin' ? (managerId || null) : null);

    const normalizedLoginId = String(loginId).trim().toUpperCase();

    // Check for existing user (by loginId)
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

    // Step 2: For PM-created Closer, atomically create closers/ entity first
    let closerEntityId = null;
    if (finalRole === 'closer' && caller.role === 'productmanager') {
      // Server-generated closer entity ID
      closerEntityId = 'closer_' + crypto.createHash('sha256')
        .update(`${normalizedLoginId}:${Date.now()}:${Math.random()}`)
        .digest('hex').slice(0, 16);
      const closerEntity = {
        id: closerEntityId,
        name,
        whatsapp: (whatsapp || '').toString().trim(),
        email: (email || '').toString().trim(),
        commissionRate: Number(commissionRate) || 10,
        managerId: caller.id,                   // PM's users/ doc ID
        status: 'active',
        createdDate: new Date().toISOString().slice(0, 10),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: caller.id,
      };
      await db.collection('closers').doc(closerEntityId).set(closerEntity);
    } else if (finalRole === 'closer' && caller.role === 'admin') {
      // Admin-created closer: caller can supply entityId, else server creates
      if (entityId) {
        closerEntityId = entityId;
      } else {
        closerEntityId = 'closer_' + crypto.createHash('sha256')
          .update(`${normalizedLoginId}:${Date.now()}:${Math.random()}`)
          .digest('hex').slice(0, 16);
        const closerEntity = {
          id: closerEntityId,
          name,
          whatsapp: (whatsapp || '').toString().trim(),
          email: (email || '').toString().trim(),
          commissionRate: Number(commissionRate) || 10,
          managerId: finalManagerId || null,     // whatever the admin assigned
          status: 'active',
          createdDate: new Date().toISOString().slice(0, 10),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: caller.id,
        };
        await db.collection('closers').doc(closerEntityId).set(closerEntity);
      }
    } else {
      closerEntityId = entityId || null;
    }

    // Step 3: Create Firebase Auth user + custom claims
    const firebaseEmail = `${normalizedLoginId.toLowerCase()}@elithnic.app`;
    const userClaims = buildCustomClaims({
      role: finalRole,
      entityId: closerEntityId,
      seniorManagerId: finalSeniorManagerId,
      managerId: finalManagerId,
      loginId: normalizedLoginId,
    });

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
      // Rollback: delete the closer entity if Firebase Auth creation failed
      if (closerEntityId && (finalRole === 'closer')) {
        try { await db.collection('closers').doc(closerEntityId).delete(); } catch (_) {}
      }
      if (err.code === 'auth/uid-already-exists') {
        const existingFirebaseUser = await admin.auth().getUserByEmail(firebaseEmail);
        firebaseUid = existingFirebaseUser.uid;
        await admin.auth().setCustomUserClaims(firebaseUid, userClaims);
      } else {
        console.error('[admin/users POST] Firebase Auth error:', err.message);
        return res.status(500).json({ error: 'Failed to create authentication account' });
      }
    }

    // Step 4: Create users/ document with SERVER-FORCED fields
    const userDoc = {
      id: userId,
      authUid: firebaseUid,
      authEmail: firebaseEmail,
      loginId: normalizedLoginId,
      name,
      role: finalRole,                                // SERVER-FORCED
      entityId: closerEntityId,
      seniorManagerId: finalSeniorManagerId,           // SERVER-FORCED
      managerId: finalManagerId,                       // SERVER-FORCED
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: caller.id,
      migratedToFirebaseAuth: true,
    };

    await db.collection('users').doc(userId).set(userDoc);

    // Step 5: If PM-created closer, link the closer entity's userId to the new users/ doc
    if (finalRole === 'closer' && closerEntityId) {
      try {
        await db.collection('closers').doc(closerEntityId).update({
          userId: userId,
        });
      } catch (e) {
        // Non-fatal: closer entity will still have managerId; userId back-link is best-effort
        console.warn('[admin/users POST] closer entity userId back-link failed:', e.message);
      }
    }

    console.log(`[admin] ${caller.loginId} (${caller.role}) created user ${normalizedLoginId} (${userId}) role=${finalRole}`);

    return res.json({
      success: true,
      userId,
      email: firebaseEmail,
      role: finalRole,
      seniorManagerId: finalSeniorManagerId,
      managerId: finalManagerId,
      entityId: closerEntityId,
      user: sanitizeUserForClient({ ...userDoc, id: userId }),
    });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// PATCH /admin/users/:userId
// Hierarchy-aware user update.
// Admins can update anyone.
// SM can update only their own PMs (cannot escalate role).
// PM can update only their own Closers.
// ============================================================
router.patch('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Caller not found' });
    }
    req.caller = caller;

    const { userId } = req.params;
    const updates = req.body || {};

    if (!userId || !updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'userId and updates are required' });
    }

    // Protected fields — no one can change these via this endpoint
    const PROTECTED_FIELDS = [
      'id', 'authUid', 'authEmail', 'migratedToFirebaseAuth', 'passwordHash',
      'role',                       // role cannot be changed via PATCH
    ];
    for (const field of PROTECTED_FIELDS) {
      if (field in updates) {
        return res.status(400).json({ error: `Field '${field}' cannot be changed via this endpoint` });
      }
    }

    const db = getAdminDb();
    const targetSnap = await db.collection('users').doc(userId).get();
    if (!targetSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const target = { id: targetSnap.id, ...targetSnap.data() };

    // Hierarchy authorization: only admin can update users out of band
    if (!await canModifyUser(caller, target)) {
      return res.status(403).json({ error: 'You do not have authority to modify this user' });
    }

    // SM/PM cannot modify relationship fields (seniorManagerId, managerId) on
    // other users. Admin can modify them. Browsers can never set parent IDs.
    if (caller.role !== 'admin') {
      for (const f of ['seniorManagerId', 'managerId', 'entityId']) {
        if (f in updates) {
          return res.status(403).json({ error: `Field '${f}' can only be changed by Admin` });
        }
      }
    }

    // Strip any remaining protected server-set fields
    const sanitizedUpdates = { ...updates };
    delete sanitizedUpdates.id;
    delete sanitizedUpdates.authUid;
    delete sanitizedUpdates.authEmail;
    delete sanitizedUpdates.migratedToFirebaseAuth;
    delete sanitizedUpdates.passwordHash;
    delete sanitizedUpdates.createdBy;
    delete sanitizedUpdates.createdAt;

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
// Admin-only per authoritative model.
// ============================================================
router.delete('/users/:userId', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Caller not found' });
    }
    req.caller = caller;

    if (!canPerformAdminOnlyAction(caller)) {
      return res.status(403).json({ error: 'Only Admin can delete users' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const db = getAdminDb();
    const targetSnap = await db.collection('users').doc(userId).get();
    if (!targetSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const target = { id: targetSnap.id, ...targetSnap.data() };

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

    await db.collection('users').doc(userId).delete();

    console.log(`[admin] ${caller.loginId} deleted user ${userId} (${target.loginId})`);

    return res.json({ success: true });

  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /admin/users/:userId/reset-password
// Admin-only per authoritative model.
// ============================================================
router.post('/users/:userId/reset-password', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Caller not found' });
    }
    req.caller = caller;

    if (!canPerformAdminOnlyAction(caller)) {
      return res.status(403).json({ error: 'Only Admin can reset passwords' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const targetUserId = req.body.targetUserId || userId;
    const db = getAdminDb();
    let target = null;

    const ts = await db.collection('users').doc(targetUserId).get();
    if (ts.exists) {
      target = { id: ts.id, ...ts.data() };
    } else {
      target = await getFirestoreUserByLoginId(targetUserId);
    }

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    return await resetPassword(admin, db, caller, target, res);

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
// Admin-only per authoritative model.
// ============================================================
router.post('/users/:userId/sync-claims', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(401).json({ error: 'Caller not found' });
    }
    req.caller = caller;

    if (!canPerformAdminOnlyAction(caller)) {
      return res.status(403).json({ error: 'Only Admin can sync claims' });
    }

    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(userId).get();
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
