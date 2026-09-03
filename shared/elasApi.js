/* ===========================================================
   ELAS API Client (shared)
   ===========================================================
   Replaces firebase.functions().httpsCallable() with fetch
   calls to the Render backend.

   Add this to any HTML file before other JS that uses it:
   <script src="/shared/elasApi.js"></script>
   =========================================================== */

(function (global) {
  'use strict';

  // Set this in your HTML before loading this script:
  //   <script>window.ELAS_API_BASE = 'https://your-app.onrender.com';</script>
  // Or set it in your hosting config.
  const API_BASE = global.ELAS_API_BASE || 'https://elas-api.onrender.com';

  /**
   * Call a Render API endpoint.
   * @param {string} path  - e.g. '/auth/login'
   * @param {object} data  - request body (will be wrapped in { data: ... } for compatibility)
   * @param {object} options - { auth: 'idToken', method: 'GET' | 'POST' | 'PATCH' | 'DELETE' }
   * @returns {Promise<object>}
   */
  async function callApi(path, data, options) {
    options = options || {};
    const method = options.method || 'POST';
    const useAuth = options.auth;

    const headers = { 'Content-Type': 'application/json' };

    if (useAuth && global.firebase && global.firebase.auth && global.firebase.auth().currentUser) {
      try {
        const token = await global.firebase.auth().currentUser.getIdToken();
        headers['Authorization'] = 'Bearer ' + token;
      } catch (e) {
        console.warn('[elasApi] Failed to get auth token:', e.message);
      }
    }

    let body;
    if (method === 'GET' || method === 'DELETE') {
      body = undefined;
    } else {
      // Direct JSON body for Express backend
      body = JSON.stringify(data || {});
    }

    const resp = await fetch(API_BASE + path, {
      method,
      headers,
      body,
    });

    let json;
    try {
      json = await resp.json();
    } catch (e) {
      throw new Error('Invalid response from server');
    }

    if (!resp.ok) {
      // Mimic Firebase HttpsError shape
      const err = new Error(json.error || `HTTP ${resp.status}`);
      err.code = resp.status === 401 ? 'unauthenticated' :
                 resp.status === 403 ? 'permission-denied' :
                 resp.status === 404 ? 'not-found' :
                 resp.status === 409 ? 'already-exists' :
                 resp.status === 429 ? 'resource-exhausted' :
                 'internal';
      err.details = json;
      throw err;
    }

    return json;
  }

  /**
   * Helper for Firebase-compatible callable shape: { data: ... }
   */
  async function callable(name, data) {
    // Map legacy callable name to path
    const path = CALLABLE_PATHS[name] || ('/callable/' + name);
    return await callApi(path, data);
  }

  const CALLABLE_PATHS = {
    'authenticateWithCredentials': '/auth/login',
    'changePassword':             '/auth/change-password',
    'recoverAccount':             '/auth/recover',
    'listActiveProducts':         '/pay/products',
    'lookupCloserAttribution':    '/pay/closer',
    'createPayUSale':             '/pay/sale',
    'verifyPayUPayment':          '/pay/verify',
    'generateDeliveryTokenFn':    '/pay/delivery-token',
    'listUsers':                  '/admin/users',
    'createUserAccount':          '/admin/users',
    'updateUserAccount':          null,  // uses PATCH
    'deleteUserAccount':          null,  // uses DELETE
    'resetUserPassword':          null,  // uses POST
    'syncUserClaims':             null,  // uses POST
  };

  /**
   * Call a callable function by name.
   * This is the direct replacement for firebase.functions().httpsCallable(name).
   * It returns { data: ... } to match the Firebase callable shape.
   */
  async function callCallable(name, data) {
    const result = await callable(name, data);
    // Firebase callable always returns { data: ... } — wrap if not already
    if (result && typeof result === 'object' && 'data' in result) {
      return result;
    }
    return { data: result };
  }

  global.ELAS_API = {
    base: API_BASE,
    call: callApi,
    callable: callCallable,
    // Direct named helpers for convenience
    login:    (data) => callApi('/auth/login', data),
    recover:  (data) => callApi('/auth/recover', data),
    changePassword: (data) => callApi('/auth/change-password', data),
    listProducts:   () => callApi('/pay/products', null, { method: 'GET' }),
    lookupCloser:   (data) => callApi('/pay/closer', data),
    createSale:     (data) => callApi('/pay/sale', data),
    prepareSale:    (data) => callApi('/pay/prepare-sale', data, { auth: true }),
    getSale:        (saleId) => callApi('/pay/sale/' + encodeURIComponent(saleId), null, { method: 'GET' }),
    verifyPayment:  (data) => callApi('/pay/verify', data),
    listUsers:      () => callApi('/admin/users', null, { method: 'GET', auth: true }),
    createUser:     (data) => callApi('/admin/users', data, { auth: true }),
    updateUser:     (id, data) => callApi('/admin/users/' + encodeURIComponent(id), data, { method: 'PATCH', auth: true }),
    deleteUser:     (id) => callApi('/admin/users/' + encodeURIComponent(id), null, { method: 'DELETE', auth: true }),
    resetPassword:  (id, data) => callApi('/admin/users/' + encodeURIComponent(id) + '/reset-password', data || {}, { auth: true }),
    syncClaims:     (id) => callApi('/admin/users/' + encodeURIComponent(id) + '/sync-claims', {}, { auth: true }),
  };
})(window);
