# ELAS Phase 2 — Security Test Plan
## Real Firebase Auth + Firestore Security Hardening

**Date:** 2026-09-02
**Phase:** Phase 2 (Real Firebase Auth + Security Hardening)
**Status:** Pending — Execute after deploying Cloud Functions + Firestore rules

---

## Test Environment Setup

1. **Deploy Cloud Functions:**
   ```bash
   firebase deploy --only functions
   ```

2. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

3. **Bootstrap the initial admin:**
   ```bash
   # Via Firebase Functions shell or an HTTP client:
   curl -X POST https://us-central1-elithnic.cloudfunctions.net/bootstrapAdmin \
     -H "Content-Type: application/json" \
     -d '{"secret":"<your-bootstrap-secret>", "loginId":"admin", "password":"<secure-password>", "name":"Admin"}'
   ```

4. **Bootstrap secret:** Set via `firebase functions:config:set elas.bootstrap_secret="<random-secret>"`

---

## Test Matrix — Browser-Based Security Tests

Run each test in the browser DevTools console (`/app`).

---

### TEST 1: Anonymous User Cannot Read Sensitive Collections

**Purpose:** Verify unauthenticated browser sessions are blocked from reading sensitive data.

```javascript
// Run in an incognito window with no session
const testCollections = [
  'users', 'system', 'commissionLedger', 'commission_locks',
  'webhook_events', 'delivery_tokens', 'payments'
];
const results = [];
for (const coll of testCollections) {
  try {
    await fsdb.collection(coll).limit(1).get();
    results.push({ coll, allowed: true });
  } catch (e) {
    results.push({ coll, allowed: false, error: e.message });
  }
}
console.table(results);
```

**Expected:** All should show `allowed: false` (permission-denied).

---

### TEST 2: Authenticated User Cannot Read Full Users Collection

**Purpose:** Browser never downloads all users; only own doc via callable.

```javascript
// Login as any user, then:
const snap = await fsdb.collection('users').limit(5).get();
console.log('users count readable from browser:', snap.size);
// Expected: 0 (read is blocked by rules)
```

**Expected:** `snap.size === 0` or permission-denied error.

---

### TEST 3: Non-Admin Cannot Create User Accounts

**Purpose:** Only admins can create Firebase Auth accounts.

```javascript
// Log in as PM (productmanager role), then try:
const fn = firebase.functions().httpsCallable('createUserAccount');
try {
  await fn({ loginId: 'HACKER01', password: 'test123', name: 'Hacker', role: 'admin' });
  console.log('FAIL: non-admin was able to create user');
} catch (e) {
  console.log('PASS:', e.code, e.message);
}
```

**Expected:** `permission-denied` error.

---

### TEST 4: Non-Admin Cannot Reset Another User's Password

```javascript
// Log in as PM, then try to reset admin password:
const fn = firebase.functions().httpsCallable('resetUserPassword');
try {
  await fn({ targetLoginId: 'ADMIN' });
  console.log('FAIL: PM was able to reset admin password');
} catch (e) {
  console.log('PASS:', e.code, e.message);
}
```

**Expected:** `permission-denied` error.

---

### TEST 5: Non-Admin Cannot Delete User Accounts

```javascript
// Log in as PM, try to delete a closer account:
const fn = firebase.functions().httpsCallable('deleteUserAccount');
const targetUserId = 'closer_<some-id>'; // any non-admin user id
try {
  await fn({ userId: targetUserId });
  console.log('FAIL: non-admin deleted user');
} catch (e) {
  console.log('PASS:', e.code, e.message);
}
```

**Expected:** `permission-denied` error.

---

### TEST 6: Admin Cannot Delete Admin Accounts

```javascript
// Log in as admin, try to delete own account:
const fn = firebase.functions().httpsCallable('deleteUserAccount');
try {
  await fn({ userId: firebase.auth().currentUser.uid });
  console.log('FAIL: admin deleted own account');
} catch (e) {
  console.log('PASS:', e.code, e.message);
}
```

**Expected:** `failed-precondition` (admin cannot delete admin).

---

### TEST 7: Non-Admin Cannot Modify Another User's Role/Hierarchy

```javascript
// Log in as PM, try to update a closer's seniorManagerId:
const fn = firebase.functions().httpsCallable('updateUserAccount');
const closerUserId = 'closer_<some-id>';
try {
  await fn({ userId: closerUserId, updates: { role: 'admin' } });
  console.log('FAIL: PM escalated role');
} catch (e) {
  console.log('PASS (role change):', e.code);
}
try {
  await fn({ userId: closerUserId, updates: { seniorManagerId: 'fake-sm-id' } });
  console.log('FAIL: PM changed SM hierarchy');
} catch (e) {
  console.log('PASS (hierarchy change):', e.code);
}
```

**Expected:** `permission-denied` for both attempts.

---

### TEST 8: Client Cannot Mark Own Sale as Verified

**Purpose:** Only server can transition sale status.

```javascript
// Log in as authenticated user, find a pending sale:
const snap = await fsdb.collection('sales').where('status','==','pending').limit(1).get();
if (snap.empty) { console.log('No pending sales to test'); return; }
const saleId = snap.docs[0].id;
// Try to mark it as verified directly:
try {
  await fsdb.collection('sales').doc(saleId).update({
    status: 'verified',
    paymentStatus: 'verified'
  });
  console.log('FAIL: client was able to mark sale verified');
} catch (e) {
  console.log('PASS: client blocked from updating sale status');
}
```

**Expected:** Permission-denied error.

---

### TEST 9: Client Cannot Modify Commission Fields

```javascript
// As any authenticated user (non-admin, non-service):
const snap = await fsdb.collection('productSales').limit(1).get();
if (snap.empty) { console.log('No productSales to test'); return; }
const psId = snap.docs[0].id;
try {
  await fsdb.collection('productSales').doc(psId).update({
    closerCommission: 999999,
    commissionPaid: true
  });
  console.log('FAIL: client modified commission fields');
} catch (e) {
  console.log('PASS: client blocked from modifying commission');
}
```

**Expected:** Permission-denied error.

---

### TEST 10: PM/SM Cannot View Other Teams' Closers

**Purpose:** Role-based data scoping enforced server-side.

```javascript
// Login as PM-A, get list of closers:
const fn1 = firebase.functions().httpsCallable('listUsers');
const res1 = await fn1();
const pmAClosers = res1.data.users.filter(u => u.role === 'closer').map(u => u.id);
console.log('PM-A sees', pmAClosers.length, 'closers');

// Login as PM-B (different team), get list:
const res2 = await fn2(); // signed in as PM-B
const pmBClosers = res2.data.users.filter(u => u.role === 'closer').map(u => u.id);

// Verify no overlap (or only shared view if SM):
console.log('Overlap:', pmAClosers.filter(id => pmBClosers.includes(id)).length);
```

**Expected:** PM-A and PM-B see different closer sets (no or minimal overlap).

---

### TEST 11: Password Hash Never Exposed to Browser

**Purpose:** Ensure sensitive fields are never returned to the client.

```javascript
// Login and get user document:
const uid = firebase.auth().currentUser.uid;
const doc = await fsdb.collection('users').doc(uid).get();
const data = doc.data();
const forbidden = ['passwordHash', 'authEmail', 'authUid', 'recoveryKeyHash']
  .filter(f => f in data);
console.log('Forbidden fields in user doc:', forbidden);
// Also check the authenticateWithCredentials response
const fn = firebase.functions().httpsCallable('authenticateWithCredentials');
// (Already logged in, so this won't work — check the token claims instead)
const claims = await firebase.auth().currentUser.getIdTokenResult();
console.log('Claims contain passwordHash:', 'passwordHash' in claims.claims);
console.log('Claims contain authUid:', 'authUid' in claims.accounts);
```

**Expected:** Forbidden fields are absent from Firestore doc and callable responses.

---

### TEST 12: /pay/ Cannot Enumerate Closers/Managers

**Purpose:** `lookupCloserAttribution` returns only attribution IDs.

```javascript
// In /pay/ page (incognito, unauthenticated):
const fn = firebase.functions().httpsCallable('lookupCloserAttribution');
const res = await fn({ closerCode: 'CL01' });
console.log('Response keys:', Object.keys(res.data));
const hasFullCloserDoc = res.data.closer && res.data.closer.whatsapp;
const hasFullPmDoc = res.data.manager && res.data.manager.commissionRate;
console.log('Exposes full closer doc:', !!hasFullCloserDoc);
console.log('Exposes full manager doc:', !!hasFullPmDoc);
```

**Expected:** Response contains only `closerId`, `productManagerId`, `seniorManagerId`, `closerName`, `productManagerName`, `seniorManagerName` — no full documents.

---

### TEST 13: Recovery Key Hash Never in Browser Cache

**Purpose:** Verify `system` collection is never read by the browser.

```javascript
// In /app/:
try {
  await fsdb.collection('system').doc('config').get();
  console.log('FAIL: browser can read system collection');
} catch (e) {
  console.log('PASS: system collection blocked');
}

// Check localStorage:
const raw = localStorage.getItem('elithnic_db_v1');
if (raw) {
  const db = JSON.parse(raw);
  console.log('Local cache has system.auth:', !!db.auth);
  console.log('Local cache has recoveryKeyHash:', !!(db.auth && db.auth.recoveryKeyHash));
}
```

**Expected:** Firestore read blocked; local cache has no `auth` object.

---

### TEST 14: Self-Password Change Works, No Password Hash Exposure

```javascript
// Login as any user:
const fn = firebase.functions().httpsCallable('changePassword');
try {
  await fn({ currentPassword: 'wrongpassword', newPassword: 'newpass123' });
  console.log('FAIL: accepted wrong current password');
} catch (e) {
  console.log('PASS (wrong password rejected):', e.code, e.message);
}

// Now with correct password:
try {
  await fn({ currentPassword: 'correct-password', newPassword: 'newpass123' });
  console.log('PASS: password changed successfully');
} catch (e) {
  console.log('FAIL: correct password rejected:', e.message);
}
```

**Expected:** Wrong password rejected with `not-found`; correct password succeeds.

---

### TEST 15: Commission Ledger Only Written by Service Account

**Purpose:** Commission records cannot be created/modified by any browser.

```javascript
// As any authenticated user (including admin):
const testColl = async (coll, sampleId) => {
  try {
    await fsdb.collection(coll).doc('test-attempt').set({ test: true });
    console.log('FAIL: wrote to', coll);
  } catch (e) {
    console.log('PASS: blocked from writing to', coll, '-', e.code);
  }
};
await testColl('commissionLedger', null);
await testColl('commission_locks', null);
await testColl('webhook_events', null);
await testColl('delivery_tokens', null);
```

**Expected:** All blocked with `permission-denied`.

---

## Cloud Functions Security Tests

Run via Firebase Functions shell: `firebase functions:shell`

**Note on anonymous auth:** `/pay/` and `/thanks/` are fully unauthenticated. All payment and verification operations go through no-auth callables (`createPayUSale`, `verifyPayUPayment`, `listActiveProducts`, `lookupCloserAttribution`). No `signInAnonymously()` is used anywhere in production code.

---

### TEST 16: authenticateWithCredentials Rejects Bad Password

```javascript
functions.authenticateWithCredentials({ loginId: 'admin', password: 'wrongpass' })
  .then(r => console.log('FAIL: accepted wrong password'))
  .catch(e => console.log('PASS:', e.code, e.message));
```

**Expected:** `not-found` error.

---

### TEST 17: authenticateWithCredentials Rejects Inactive Account

```javascript
// First disable a user in Firestore, then:
functions.authenticateWithCredentials({ loginId: 'disabled-user', password: 'correct' })
  .then(r => console.log('FAIL: accepted disabled account'))
  .catch(e => console.log('PASS:', e.code, e.message));
```

**Expected:** `failed-precondition` (account disabled).

---

### TEST 18: createUserAccount Rejects Non-Admin

```javascript
// Authenticate as PM first, then:
functions.httpsCallable('createUserAccount')({
  loginId: 'TESTCL99', password: 'test1234', name: 'Test', role: 'closer'
}, { auth: { uid: 'pm-user-id' } })
  .then(r => console.log('FAIL: non-admin created user'))
  .catch(e => console.log('PASS:', e.code));
```

**Expected:** `permission-denied`.

---

### TEST 19: createUserAccount Cannot Create Admin

```javascript
// As admin, try to create another admin:
functions.httpsCallable('createUserAccount')({
  loginId: 'ADMIN02', password: 'test1234', name: 'Rogue Admin', role: 'admin'
}, { auth: { uid: 'admin-user-id' } })
  .then(r => console.log('User created:', JSON.stringify(r.data)))
  .catch(e => console.log('Error:', e.code, e.message));
```

**Expected:** The function succeeds (Phase 2 does not restrict creating additional admins — this is an operational policy choice). If you want to block additional admins, add the check in `createUserAccount`.

---

### TEST 20: Migrated User Login Returns No passwordHash

```javascript
// Login as a fully-migrated user:
functions.authenticateWithCredentials({ loginId: 'admin', password: 'correct' })
  .then(r => {
    const user = r.data.user;
    const hasHash = 'passwordHash' in user;
    const hasAuthUid = 'authUid' in user;
    console.log('Response has passwordHash:', hasHash);
    console.log('Response has authUid:', hasAuthUid);
    if (hasHash || hasAuthUid) {
      console.log('FAIL: sensitive fields exposed');
    } else {
      console.log('PASS: user object sanitized');
    }
  })
  .catch(e => console.log('Error:', e));
```

**Expected:** `passwordHash` and `authUid` absent from response.

---

### TEST 21: PayU Webhook Rejects Invalid Hash

```javascript
// Simulate invalid webhook callback:
fetch('https://us-central1-elithnic.cloudfunctions.net/paymentWebhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'status=success&mihpayid=123&txnid=TXN001&udf1=SALE-0001&amount=40000&hash=invalidhash'
})
  .then(r => r.json())
  .then(d => console.log('Response:', d))
  .catch(e => console.log('Error:', e));
```

**Expected:** `{ error: 'Invalid signature' }` or 401.

---

### TEST 22: lookupCloserAttribution Returns Only Attribution Data

```javascript
functions.lookupCloserAttribution({ closerCode: 'INVALID' })
  .then(r => console.log('Invalid code response:', JSON.stringify(r.data)))
  .catch(e => console.log('Error:', e.code));

functions.lookupCloserAttribution({ closerCode: 'CL01' })
  .then(r => {
    const keys = Object.keys(r.data);
    const allowedKeys = ['valid', 'closerId', 'productManagerId', 'seniorManagerId',
                         'closerName', 'productManagerName', 'seniorManagerName'];
    const extra = keys.filter(k => !allowedKeys.includes(k));
    console.log('Extra keys exposed:', extra);
    console.log('PASS:', extra.length === 0);
  })
  .catch(e => console.log('Error:', e));
```

**Expected:** No extra fields; no full documents.

---

### TEST 23: createPayUPayment Only Works for 'sales' Collection (Authed)

```javascript
// Try to create payment for a legacy productSales record:
functions.httpsCallable('createPayUPayment')({ saleId: 'LEGACY-001' })
  .then(r => console.log('Response:', r.data))
  .catch(e => console.log('Error (expected):', e.code, e.message));
```

**Expected:** `not-found` (legacy productSales not supported for new PayU flow).

---

### TEST 24: listActiveProducts Returns Only Public Product Fields

**Purpose:** `/pay/` loads products via callable. Sensitive fields must not be returned.

```javascript
functions.httpsCallable('listActiveProducts')({})
  .then(r => {
    const products = r.data.products || [];
    const forbidden = ['zipUrl', 'zipPassword', 'zipStoragePath', 'deliveryToken'];
    const violations = [];
    products.forEach(p => {
      forbidden.forEach(f => {
        if (f in p) violations.push(f + ' in product ' + p.id);
      });
    });
    if (violations.length) {
      console.log('FAIL: sensitive fields exposed:', violations);
    } else {
      console.log('PASS: no sensitive fields in product list');
    }
  })
  .catch(e => console.log('Error:', e));
```

**Expected:** No `zipUrl`, `zipPassword`, `zipStoragePath`, or `deliveryToken` in any returned product.

---

### TEST 25: verifyPayUPayment Returns Only Customer-Facing Fields (No Auth)

**Purpose:** `/thanks/` verifies payment unauthenticated. The response must not expose hierarchy or secrets.

```javascript
// As unauthenticated (no Firebase Auth):
functions.httpsCallable('verifyPayUPayment')({ saleId: 'SALE-0001' })
  .then(r => {
    const data = r.data;
    const forbidden = [
      'closerId', 'productManagerId', 'seniorManagerId',
      'passwordHash', 'authUid', 'authEmail', 'recoveryKeyHash',
      'zipUrl', 'zipPassword', 'deliveryToken', 'commissionLedger'
    ];
    const violations = forbidden.filter(k => k in (data || {}));
    const sale = data && data.sale;
    const saleViolations = forbidden.filter(k => k in (sale || {}));
    console.log('Top-level forbidden:', violations);
    console.log('sale object forbidden:', saleViolations);
    const allowed = ['saleId', 'productName', 'amount', 'status', 'verified',
                     'paymentStatus', 'deliveryStatus', 'customerName', 'error'];
    console.log('Expected keys present:', allowed.filter(k => k in (sale || data || {})).length);
    console.log(violations.length + saleViolations.length === 0 ? 'PASS' : 'FAIL');
  })
  .catch(e => console.log('Error:', e.code, e.message));
```

**Expected:** No forbidden fields. Customer-facing fields (`saleId`, `productName`, `amount`, etc.) are present.

---

### TEST 26: createPayUSale Requires Valid Closer Attribution (No Auth Bypass)

**Purpose:** `/pay/` creates sales unauthenticated. The server must validate closer attribution server-side — browser cannot inject arbitrary IDs.

```javascript
functions.httpsCallable('createPayUSale')({
  productId: 'SOME-PRODUCT-ID',
  closerCode: 'INVALID_CODE_999',
  customer: { name: 'Test', email: 'test@test.com', phone: '9999999999', company: '' }
})
  .then(r => {
    if (r.data.success) {
      console.log('FAIL: sale created with invalid closer code');
    } else {
      console.log('PASS: invalid closer code rejected:', r.data.error);
    }
  })
  .catch(e => console.log('PASS: callable rejected invalid closer:', e.code));
```

**Expected:** `success: false` or permission-denied error.

---

### TEST 27: createPayUSale Cannot Be Used to Create Arbitrary Sale IDs

**Purpose:** Browser cannot pre-select a sale ID or inject server-side-only fields.

```javascript
functions.httpsCallable('createPayUSale')({
  productId: 'SOME-PRODUCT-ID',
  closerCode: 'CL01',
  customer: { name: 'Test', email: 'test@test.com', phone: '9999999999', company: '' },
  // Attempt to inject server-side fields:
  saleId: 'HACK-SALE-999',
  status: 'verified',
  deliveryStatus: 'authorized'
})
  .then(r => {
    const data = r.data;
    // Check the returned sale doesn't have the injected values
    if (data && data.saleId && data.saleId.startsWith('SALE-') && data.saleId !== 'HACK-SALE-999') {
      console.log('PASS: injected saleId was ignored, server assigned:', data.saleId);
    } else {
      console.log('FAIL: server accepted injected saleId or returned unexpected:', data);
    }
  })
  .catch(e => console.log('Error:', e.code));
```

**Expected:** Server ignores injected `saleId` and `status` fields; assigns its own `SALE-XXXX` id and `pending` status.

---

## Rollback Checklist

If any test fails:

1. **Firestore rules failing:** Roll back to previous rules version:
   ```bash
   firebase deploy --only firestore:rules  # with previous rules
   ```

2. **Cloud Functions failing:** Functions are versioned in GCP; redeploy previous version if needed.

3. **Users locked out:** Use `bootstrapAdmin` HTTP endpoint to provision a recovery admin.

4. **All tests pass (27 total):** Phase 2 is complete. Proceed to Phase 3 only when explicitly authorized.

---

*Generated: 2026-09-02 — ELAS Phase 2*
