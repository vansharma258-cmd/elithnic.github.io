/* ===========================================================
   ELAS — Bootstrap Admin Route
   ===========================================================
   One-time admin account provisioning.
   Protected by a bootstrap secret.
   =========================================================== */

const express = require('express');
const admin = require('firebase-admin');
const router = express.Router();

const { getFirestoreUserByLoginId, buildCustomClaims } = require('../shared/firestore');

// POST /bootstrap
router.post('/', async (req, res) => {
  const { secret, loginId, password, name } = req.body || {};

  const BOOTSTRAP_SECRET = process.env.ELAS_BOOTSTRAP_SECRET;
  if (!BOOTSTRAP_SECRET) {
    return res.status(500).json({ error: 'Bootstrap is not configured. Set ELAS_BOOTSTRAP_SECRET in environment.' });
  }
  if (secret !== BOOTSTRAP_SECRET) {
    return res.status(403).json({ error: 'Invalid bootstrap secret' });
  }

  const adminLoginId = loginId || 'admin';
  const adminPassword = password || 'ChangeMe123!';
  const adminName = name || 'Admin';

  try {
    const existingAdmin = await getFirestoreUserByLoginId(adminLoginId);
    if (existingAdmin && existingAdmin.authUid) {
      return res.json({ message: 'Admin already exists', userId: existingAdmin.id });
    }

    const userId = 'user_admin_main';
    const firebaseEmail = `${adminLoginId.toLowerCase()}@elithnic.app`;
    const userClaims = buildCustomClaims({ role: 'admin', loginId: adminLoginId });

    await admin.auth().createUser({
      uid: userId,
      email: firebaseEmail,
      password: adminPassword,
      displayName: adminName,
      disabled: false,
    });
    await admin.auth().setCustomUserClaims(userId, userClaims);

    const db = admin.firestore();
    await db.collection('users').doc(userId).set({
      id: userId,
      authUid: userId,
      authEmail: firebaseEmail,
      loginId: adminLoginId,
      name: adminName,
      role: 'admin',
      entityId: null,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      migratedToFirebaseAuth: true,
    });

    return res.json({
      success: true,
      userId,
      email: firebaseEmail,
      password: adminPassword,
      message: 'Save this password securely. Change it immediately after first login.',
    });
  } catch (err) {
    console.error('[bootstrapAdmin] Error:', err);
    if (err.code === 'auth/uid-already-exists') {
      return res.json({ message: 'Admin already exists', userId: 'user_admin_main' });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
