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

  // Default request timeout (ms). Render free-tier cold-start can take 30+ sec.
  // 25s gives a clear timeout before the user's browser would.
  const DEFAULT_TIMEOUT_MS = 25000;

  // Categorize a fetch/network error into a user-friendly message.
  // - Network failure (DNS, offline, CORS rejection) → 'unreachable'
  // - Timeout → 'timeout'
  // - Empty/non-JSON response from server → 'invalid-response'
  // - 401/403 → 'auth' (caller should re-login or check perms)
  // - 4xx other → 'client' (validation, not found, etc.) — keep server message
  // - 5xx → 'server' (backend failure) — keep server message if present
  function classifyError(err) {
    if (!err) return { code: 'unknown', message: 'Unknown error' };
    const msg = String(err.message || err);

    // AbortController timeout
    if (err.name === 'AbortError' || /aborted|timeout/i.test(msg)) {
      return { code: 'timeout', message: 'The server took too long to respond. Please try again in a moment.' };
    }
    // Browser-level network failure (CORS, offline, DNS, reset)
    if (err.name === 'TypeError' && /fetch/i.test(msg)) {
      return { code: 'unreachable', message: 'Unable to reach the server. Please check your connection and try again.' };
    }
    return { code: 'unknown', message: msg };
  }

  /**
   * Call a Render API endpoint.
   * @param {string} path  - e.g. '/auth/login'
   * @param {object} data  - request body
   * @param {object} options - { auth: 'idToken', method: 'GET'|'POST'|'PATCH'|'DELETE', timeout: number }
   * @returns {Promise<object>}
   */
  async function callApi(path, data, options) {
    options = options || {};
    const method = options.method || 'POST';
    const useAuth = options.auth;
    const timeoutMs = options.timeout || DEFAULT_TIMEOUT_MS;

    const headers = { 'Content-Type': 'application/json' };

    if (useAuth && global.firebase && global.firebase.auth && global.firebase.auth().currentUser) {
      try {
        const token = await global.firebase.auth().currentUser.getIdToken();
        headers['Authorization'] = 'Bearer ' + token;
      } catch (e) {
        console.warn('[elasApi] Failed to get auth token:', e.message);
        // Continue without auth — server will return a proper 401, which the caller can handle
      }
    }

    let body;
    if (method === 'GET' || method === 'DELETE') {
      body = undefined;
    } else {
      body = JSON.stringify(data || {});
    }

    // Timeout via AbortController — prevents indefinite hangs on Render cold-start
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let resp;
    try {
      resp = await fetch(API_BASE + path, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const classified = classifyError(e);
      const err = new Error(classified.message);
      err.code = classified.code;
      err.isNetworkError = true;
      throw err;
    }
    clearTimeout(timeoutId);

    // Parse JSON response. Tolerate non-JSON / empty bodies (e.g. Render 502 with HTML).
    let json = null;
    let parseError = null;
    try {
      const text = await resp.text();
      if (text) {
        try { json = JSON.parse(text); }
        catch (e) { parseError = 'Non-JSON response from server'; }
      }
    } catch (e) {
      parseError = 'Could not read server response';
    }

    if (!resp.ok) {
      // Use server's error message if available, otherwise a contextual one
      const serverMessage = json && json.error;
      let errMessage, errCode;

      if (resp.status === 401) {
        errCode = 'unauthenticated';
        errMessage = serverMessage || 'Your session has expired. Please sign in again.';
      } else if (resp.status === 403) {
        errCode = 'permission-denied';
        errMessage = serverMessage || 'You do not have permission to perform this action.';
      } else if (resp.status === 404) {
        errCode = 'not-found';
        errMessage = serverMessage || 'The requested resource was not found.';
      } else if (resp.status === 409) {
        errCode = 'already-exists';
        errMessage = serverMessage || 'This record already exists.';
      } else if (resp.status === 429) {
        errCode = 'resource-exhausted';
        errMessage = serverMessage || 'Too many requests. Please try again in a moment.';
      } else if (resp.status >= 500) {
        errCode = 'server';
        errMessage = serverMessage || 'The server encountered an error. Please try again in a moment.';
      } else {
        errCode = 'client';
        errMessage = serverMessage || `Request failed (HTTP ${resp.status}).`;
      }

      const err = new Error(errMessage);
      err.code = errCode;
      err.status = resp.status;
      err.details = json;
      throw err;
    }

    if (parseError && !json) {
      const err = new Error(parseError);
      err.code = 'invalid-response';
      err.status = resp.status;
      throw err;
    }

    return json;
  }

  /**
   * Helper for Firebase-compatible callable shape: { data: ... }
   */
  async function callable(name, data) {
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
   * Returns { data: ... } to match the Firebase callable shape.
   */
  async function callCallable(name, data) {
    const result = await callable(name, data);
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
    // Product distribution endpoints
    getProduct:           (id) => callApi('/admin/products/' + encodeURIComponent(id), null, { method: 'GET', auth: true }),
    assignSeniorManagers: (id, seniorManagerIds) => callApi('/admin/products/' + encodeURIComponent(id) + '/assign-senior-managers', { seniorManagerIds }, { auth: true }),
    assignManagers:       (id, managerIds)         => callApi('/admin/products/' + encodeURIComponent(id) + '/assign-managers', { managerIds }, { auth: true }),
    assignClosers:        (id, closerIds)          => callApi('/admin/products/' + encodeURIComponent(id) + '/assign-closers', { closerIds }, { auth: true }),
  };
})(window);
