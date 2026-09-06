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
const { generateCommissionLedger } = require('../shared/commissionService');

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
        closerId: normalizedLoginId,            // canonical closer code = loginId (for PATH B lookup)
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
          closerId: normalizedLoginId,            // canonical closer code = loginId
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

// ============================================================
// Product Distribution Endpoints
// (All use Firebase Admin SDK server-side; no Firestore rules change needed)
// ============================================================

/**
 * Helper: union-assign unique IDs to an array field.
 * Returns the merged array.
 */
function unionIds(existing, additions) {
  const set = new Set(Array.isArray(existing) ? existing : []);
  for (const id of (additions || [])) {
    if (typeof id === 'string' && id.length) set.add(id);
  }
  return Array.from(set);
}

/**
 * POST /admin/products/:productId/assign-senior-managers
 * ADMIN-only. Sets products/{productId}.assignedSeniorManagerIds.
 * Body: { seniorManagerIds: [smId, ...] }
 * Browser-supplied seniorManagerIds are replaced (after validation).
 */
router.post('/products/:productId/assign-senior-managers', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) return res.status(401).json({ error: 'Caller not found' });
    req.caller = caller;

    if (!canPerformAdminOnlyAction(caller)) {
      return res.status(403).json({ error: 'Only Admin can assign products to Senior Managers' });
    }

    const { productId } = req.params;
    const { seniorManagerIds } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!Array.isArray(seniorManagerIds)) {
      return res.status(400).json({ error: 'seniorManagerIds must be an array' });
    }

    const db = getAdminDb();
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });

    // Validate every ID — must exist and have role === 'senior_manager'
    const validated = [];
    for (const id of seniorManagerIds) {
      if (typeof id !== 'string' || !id.length) continue;
      const u = await db.collection('users').doc(id).get();
      if (!u.exists) {
        return res.status(400).json({ error: `User ${id} not found` });
      }
      if (u.data().role !== 'senior_manager') {
        return res.status(400).json({ error: `User ${id} is not a Senior Manager` });
      }
      validated.push(id);
    }

    // Atomic update: replace assignedSeniorManagerIds with the validated set.
    // Do NOT touch assignedManagerIds or assignedCloserIds — they belong to
    // SM/PM distribution, not Admin's job.
    await productRef.update({
      assignedSeniorManagerIds: Array.from(new Set(validated)),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.id,
    });

    console.log(`[admin] ${caller.loginId} assigned product ${productId} to SMs:`, validated);
    return res.json({ success: true, assignedSeniorManagerIds: validated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/products/:productId/assign-managers
 * SM-only. Adds PMs to products/{productId}.assignedManagerIds.
 * Server checks:
 *  - caller.role === 'senior_manager'
 *  - caller.id is already in product.assignedSeniorManagerIds
 *  - every target PM has role=productmanager AND seniorManagerId === caller.id
 */
router.post('/products/:productId/assign-managers', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) return res.status(401).json({ error: 'Caller not found' });
    req.caller = caller;

    if (caller.role !== 'senior_manager') {
      return res.status(403).json({ error: 'Only Senior Managers can distribute products to Product Managers' });
    }

    const { productId } = req.params;
    const { managerIds } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!Array.isArray(managerIds)) {
      return res.status(400).json({ error: 'managerIds must be an array' });
    }

    const db = getAdminDb();
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });
    const product = productSnap.data();

    // Caller must already be in assignedSeniorManagerIds
    const assignedSm = Array.isArray(product.assignedSeniorManagerIds) ? product.assignedSeniorManagerIds : [];
    if (!assignedSm.includes(caller.id)) {
      return res.status(403).json({ error: 'You are not authorized to distribute this product' });
    }

    // Validate every target PM
    const validated = [];
    for (const id of managerIds) {
      if (typeof id !== 'string' || !id.length) continue;
      const u = await db.collection('users').doc(id).get();
      if (!u.exists) {
        return res.status(400).json({ error: `User ${id} not found` });
      }
      const data = u.data();
      if (data.role !== 'productmanager') {
        return res.status(400).json({ error: `User ${id} is not a Product Manager` });
      }
      if (data.seniorManagerId !== caller.id) {
        return res.status(400).json({ error: `Product Manager ${id} is not under your authority` });
      }
      validated.push(id);
    }

    // Merge: preserve existing PMs from OTHER SMs (admins assigned to other SMs'
    // products), only add SM's own validated PMs.
    const existing = Array.isArray(product.assignedManagerIds) ? product.assignedManagerIds : [];
    const merged = unionIds(existing, validated);

    await productRef.update({
      assignedManagerIds: merged,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.id,
    });

    console.log(`[admin] SM ${caller.loginId} distributed product ${productId} to PMs:`, validated);
    return res.json({ success: true, added: validated, assignedManagerIds: merged });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin/products/:productId/assign-closers
 * PM-only. Adds Closer entity IDs to products/{productId}.assignedCloserIds.
 * Server checks:
 *  - caller.role === 'productmanager'
 *  - caller.id is already in product.assignedManagerIds
 *  - every target closer entity has managerId === caller.id
 *  - the corresponding user doc also has role=closer AND managerId === caller.id
 */
router.post('/products/:productId/assign-closers', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) return res.status(401).json({ error: 'Caller not found' });
    req.caller = caller;

    if (caller.role !== 'productmanager') {
      return res.status(403).json({ error: 'Only Product Managers can distribute products to Closers' });
    }

    const { productId } = req.params;
    const { closerIds } = req.body || {};
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!Array.isArray(closerIds)) {
      return res.status(400).json({ error: 'closerIds must be an array' });
    }

    const db = getAdminDb();
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });
    const product = productSnap.data();

    // Caller PM must already be in assignedManagerIds
    const assignedMgr = Array.isArray(product.assignedManagerIds) ? product.assignedManagerIds : [];
    if (!assignedMgr.includes(caller.id)) {
      return res.status(403).json({ error: 'You are not authorized to distribute this product' });
    }

    // Validate every target closer
    const validated = [];
    for (const id of closerIds) {
      if (typeof id !== 'string' || !id.length) continue;
      // closerId is the entity doc id in closers/ collection
      const closerEntity = await db.collection('closers').doc(id).get();
      if (!closerEntity.exists) {
        return res.status(400).json({ error: `Closer ${id} not found` });
      }
      const entity = closerEntity.data();
      if (entity.managerId !== caller.id) {
        return res.status(400).json({ error: `Closer ${id} is not under your authority` });
      }
      // Also verify the linked users/ doc is a closer under this PM
      const usersQuery = await db.collection('users')
        .where('entityId', '==', id)
        .where('role', '==', 'closer')
        .limit(1).get();
      if (usersQuery.empty) {
        return res.status(400).json({ error: `Closer ${id} has no matching user account` });
      }
      const userDoc = usersQuery.docs[0].data();
      if (userDoc.managerId !== caller.id) {
        return res.status(400).json({ error: `Closer ${id} user account is not under your authority` });
      }
      validated.push(id);
    }

    // Merge with existing closerIds (don't drop other PMs' assignments)
    const existing = Array.isArray(product.assignedCloserIds) ? product.assignedCloserIds : [];
    const merged = unionIds(existing, validated);

    await productRef.update({
      assignedCloserIds: merged,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.id,
    });

    console.log(`[admin] PM ${caller.loginId} distributed product ${productId} to closers:`, validated);
    return res.json({ success: true, added: validated, assignedCloserIds: merged });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin/products/:productId
 * Authenticated. Returns product detail with role-based ZIP field exclusion.
 * - admin: full document including zipUrl, zipPassword, zipStoragePath
 * - senior_manager, productmanager, closer: metadata only (no ZIP fields)
 * Hierarchy check: non-admin can only see products assigned to them.
 */
router.get('/products/:productId', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) return res.status(401).json({ error: 'Caller not found' });
    req.caller = caller;

    const { productId } = req.params;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const db = getAdminDb();
    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) return res.status(404).json({ error: 'Product not found' });
    const product = { id: productSnap.id, ...productSnap.data() };

    const role = caller.role;
    let authorized = false;
    if (role === 'admin') {
      authorized = true;
    } else if (role === 'senior_manager') {
      const smIds = Array.isArray(product.assignedSeniorManagerIds) ? product.assignedSeniorManagerIds : [];
      authorized = smIds.includes(caller.id);
    } else if (role === 'productmanager') {
      const pmIds = Array.isArray(product.assignedManagerIds) ? product.assignedManagerIds : [];
      authorized = pmIds.includes(caller.id);
    } else if (role === 'closer') {
      const closerIds = Array.isArray(product.assignedCloserIds) ? product.assignedCloserIds : [];
      const entityId = caller.entityId;
      authorized = !!entityId && closerIds.includes(entityId);
    }

    if (!authorized) {
      return res.status(403).json({ error: 'You are not authorized to view this product' });
    }

    // Role-based field exposure
    const safe = {
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      tags: product.tags,
      imageUrl: product.imageUrl,
      featured: product.featured,
      purposeVideoUrl: product.purposeVideoUrl || null,
      setupVideoUrl: role === 'admin' ? (product.setupVideoUrl || null) : null,
      status: product.status,
      assignedSeniorManagerIds: role === 'admin' ? (product.assignedSeniorManagerIds || []) : undefined,
      assignedManagerIds: (role === 'admin' || role === 'senior_manager') ? (product.assignedManagerIds || []) : undefined,
      assignedCloserIds: (role === 'admin' || role === 'senior_manager' || role === 'productmanager') ? (product.assignedCloserIds || []) : undefined,
    };

    if (role === 'admin') {
      safe.zipUrl = product.zipUrl || null;
      safe.zipPassword = product.zipPassword || null;
      safe.zipStoragePath = product.zipStoragePath || null;
    }

    return res.json({ product: safe });
  } catch (err) {
    next(err);
  }
});

// GET /admin/sales
router.get('/sales', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(404).json({ error: 'Caller not found' });
    }
    if (caller.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const db = getAdminDb();
    // Prefer paymentVerificationStatus filter (manual flow). Fall back to status/paymentStatus
    // pending so prepare-sale records created before the field was written are still visible.
    let salesSnapshot;
    try {
      salesSnapshot = await db.collection('sales')
        .where('paymentVerificationStatus', '==', 'pending')
        .get();
    } catch (qErr) {
      console.warn('[admin/sales] paymentVerificationStatus query failed, falling back:', qErr.message);
      salesSnapshot = await db.collection('sales').where('status', '==', 'pending').get();
    }
    const sales = [];
    for (const doc of salesSnapshot.docs) {
      const sale = { id: doc.id, ...doc.data() };
      // Skip already-verified if we fell back to status query
      if (sale.paymentVerificationStatus === 'verified' || sale.paymentStatus === 'verified' || sale.status === 'verified') {
        continue;
      }
      let closerName = null;
      let productManagerName = null;
      let seniorManagerName = null;
      let clientName = sale.customerName || null;
      let clientEmail = sale.customerEmail || '';
      let clientPhone = sale.customerPhone || '';
      let clientCountry = '';
      let productName = sale.productName || '';
      if (sale.closerId) {
        const closerDoc = await db.collection('closers').doc(sale.closerId).get();
        if (closerDoc.exists) closerName = closerDoc.data().name;
      }
      if (sale.productManagerId) {
        const pmDoc = await db.collection('users').doc(sale.productManagerId).get();
        if (pmDoc.exists) productManagerName = pmDoc.data().name;
      }
      if (sale.seniorManagerId) {
        const smDoc = await db.collection('users').doc(sale.seniorManagerId).get();
        if (smDoc.exists) seniorManagerName = smDoc.data().name;
      }
      if (sale.clientId) {
        const clientDoc = await db.collection('clients').doc(sale.clientId).get();
        if (clientDoc.exists) {
          const client = clientDoc.data();
          clientName = client.name || clientName || '';
          clientEmail = client.email || clientEmail || '';
          clientPhone = client.phone || clientPhone || '';
        }
      }
      if (!productName && sale.productId) {
        const productDoc = await db.collection('products').doc(sale.productId).get();
        if (productDoc.exists) productName = productDoc.data().name;
      }
      sales.push({
        id: sale.id,
        saleId: sale.saleId,
        clientId: sale.clientId || null,
        clientName,
        clientEmail,
        clientPhone,
        clientCountry,
        productId: sale.productId || null,
        productName,
        amount: sale.amount,
        closerId: sale.closerId || null,
        closerName,
        productManagerId: sale.productManagerId || null,
        productManagerName,
        seniorManagerId: sale.seniorManagerId || null,
        seniorManagerName,
        createdAt: sale.createdAt,
        paymentVerificationStatus: sale.paymentVerificationStatus || 'pending',
        status: sale.status || 'pending',
        paymentStatus: sale.paymentStatus || 'pending',
      });
    }
    // Newest first (createdAt is ISO string)
    sales.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({ sales });
  } catch (err) {
    next(err);
  }
});

// GET /admin/sales/:saleId
router.get('/sales/:saleId', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(404).json({ error: 'Caller not found' });
    }
    if (caller.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { saleId } = req.params;
    if (!saleId || typeof saleId !== 'string' || !/^SALE-\d+$/.test(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID' });
    }
    const db = getAdminDb();
    const saleDoc = await db.collection('sales').doc(saleId).get();
    if (!saleDoc.exists) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    const sale = { id: saleDoc.id, ...saleDoc.data() };
    // Fetch related names
    let closerName = null;
    let productManagerName = null;
    let seniorManagerName = null;
    let clientName = null;
    let clientEmail = '';
    let clientPhone = '';
    let clientCountry = '';
    let productName = '';
    if (sale.closerId) {
      const closerDoc = await db.collection('closers').doc(sale.closerId).get();
      if (closerDoc.exists) closerName = closerDoc.data().name;
    }
    if (sale.productManagerId) {
      const pmDoc = await db.collection('users').doc(sale.productManagerId).get();
      if (pmDoc.exists) productManagerName = pmDoc.data().name;
    }
    if (sale.seniorManagerId) {
      const smDoc = await db.collection('users').doc(sale.seniorManagerId).get();
      if (smDoc.exists) seniorManagerName = smDoc.data().name;
    }
    if (sale.clientId) {
      const clientDoc = await db.collection('clients').doc(sale.clientId).get();
      if (clientDoc.exists) {
        const client = clientDoc.data();
        clientName = client.name || '';
        clientEmail = client.email || '';
        clientPhone = client.phone || '';
        // Note: No country field in client schema; leave blank
      }
    }
    if (sale.productId) {
      const productDoc = await db.collection('products').doc(sale.productId).get();
      if (productDoc.exists) productName = productDoc.data().name;
    }
    // Prefer linked client, fall back to sale.customer* fields written at create time
    if (!clientName) clientName = sale.customerName || null;
    if (!clientEmail) clientEmail = sale.customerEmail || '';
    if (!clientPhone) clientPhone = sale.customerPhone || '';
    if (!productName) productName = sale.productName || '';

    const saleInfo = {
      id: sale.id,
      saleId: sale.saleId,
      clientId: sale.clientId || null,
      clientName,
      clientEmail,
      clientPhone,
      clientCountry,
      productId: sale.productId || null,
      productName,
      amount: sale.amount,
      closerId: sale.closerId || null,
      closerName,
      productManagerId: sale.productManagerId || null,
      productManagerName,
      seniorManagerId: sale.seniorManagerId || null,
      seniorManagerName,
      createdAt: sale.createdAt,
      paymentVerificationStatus: sale.paymentVerificationStatus || 'pending',
      verifiedAt: sale.verifiedAt,
      verifiedBy: sale.verifiedBy,
      paymentMethod: sale.paymentMethod,
      paymentReference: sale.paymentReference,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      deliveryStatus: sale.deliveryStatus,
      source: sale.source,
      customerCompany: sale.customerCompany || '',
    };
    return res.json({ sale: saleInfo });
  } catch (err) {
    next(err);
  }
});

// POST /admin/sales/:saleId/verify
router.post('/sales/:saleId/verify', requireAuth, async (req, res, next) => {
  try {
    const caller = await getFirestoreUserByAuthUid(req.authUid);
    if (!caller) {
      return res.status(404).json({ error: 'Caller not found' });
    }
    if (caller.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { saleId } = req.params;
    if (!saleId || typeof saleId !== 'string' || !/^SALE-\d+$/.test(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID' });
    }
    const { paymentMethod, paymentReference } = req.body || {};
    const db = getAdminDb();
    const saleRef = db.collection('sales').doc(saleId);
    // First, read the sale to see if it's already verified
    const saleSnap = await saleRef.get();
    if (!saleSnap.exists) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    const sale = { id: saleSnap.id, ...saleSnap.data() };
    let needsVerification = false;
    // Treat missing paymentVerificationStatus + pending status as pending (older prepare-sale records)
    const pvs = sale.paymentVerificationStatus
      || ((sale.status === 'pending' || sale.paymentStatus === 'pending') ? 'pending' : sale.paymentVerificationStatus);
    if (pvs === 'pending') {
      needsVerification = true;
    } else if (pvs !== 'verified') {
      return res.status(400).json({ error: `Sale cannot be verified from status: ${pvs}` });
    }
    // If pending, run transaction to mark as verified
    if (needsVerification) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(saleRef);
        if (!snap.exists) {
          throw new Error('Sale not found');
        }
        const current = { id: snap.id, ...snap.data() };
        const curPvs = current.paymentVerificationStatus
          || ((current.status === 'pending' || current.paymentStatus === 'pending') ? 'pending' : current.paymentVerificationStatus);
        if (curPvs !== 'pending') {
          throw new Error('Sale is no longer pending verification');
        }
        const updateData = {
          status: 'verified',
          paymentStatus: 'verified',
          paymentVerificationStatus: 'verified',
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedBy: caller.id
        };
        if (paymentMethod !== undefined && paymentMethod !== null) {
          updateData.paymentMethod = paymentMethod;
        }
        if (paymentReference !== undefined && paymentReference !== null) {
          updateData.paymentReference = paymentReference;
        }
        tx.update(saleRef, updateData);
      });
      // After transaction, update our local sale object to reflect verified state
      sale.status = 'verified';
      sale.paymentStatus = 'verified';
      sale.paymentVerificationStatus = 'verified';
      // Note: verifiedAt and verifiedBy are set by server; we'll read again later
    }
    // Now, ensure we have the latest sale data (after transaction if any)
    const updatedSnap = await saleRef.get();
    const updatedSale = { id: updatedSnap.id, ...updatedSnap.data() };
    // Generate commission ledger (idempotent)
    const commissionResult = await generateCommissionLedger(
      updatedSale.id,
      `manual_${updatedSale.id}`,
      updatedSale
    );
    if (!commissionResult.success) {
      // Commission generation failed, but sale is verified.
      // We return an error but do not change the sale state.
      return res.status(500).json({
        error: `Failed to generate commission ledger: ${commissionResult.error}`,
        saleId: updatedSale.id
      });
    }
    return res.json({
      success: true,
      saleId: updatedSale.id,
      commissionLedgerId: commissionResult.ledgerId
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
