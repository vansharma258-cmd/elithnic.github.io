/* ===========================================================
   ELAS — PayU India Payment Service
   ===========================================================
   PayU India official integration:
   - API endpoint: https://secure.payu.in/_payment (checkout)
   - Verify payment: https://info.payu.in/merchant/postservice.php?form=2
   - Hash: SHA-512 (mandatory, legacy SHA-1 deprecated)
   - Salt: server-side ONLY
   - Webhook/callback: server-to-server reverse callback

   References:
   - https://dev.payu.in/docs/quick-integration
   - https://dev.payu.in/docs/server-side-hash-verification
   - Hash formula (request):
       hash = sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
   - Hash formula (verify_payment response):
       hash = sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid)
   - Hash formula (webhook reverse callback):
       hash = sha512(SALT|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid)

   Status: PayU returns "success" | "failure" | "pending"
   =========================================================== */

const crypto = require('crypto');
const https = require('https');
const functions = require('firebase-functions');

/* ---------- PayU Environment Configuration ---------- */
const PAYU_ENVIRONMENTS = {
  test: {
    baseUrl: 'https://test.payu.in',
    checkoutUrl: 'https://test.payu.in/_payment',
    verifyUrl: 'https://test.payu.in/merchant/postservice.php?form=2'
  },
  production: {
    baseUrl: 'https://secure.payu.in',
    checkoutUrl: 'https://secure.payu.in/_payment',
    verifyUrl: 'https://info.payu.in/merchant/postservice.php?form=2'
  }
};

/* ---------- Read config from multiple sources (in order) ----------
   1. functions.config().payu.*  (legacy: firebase functions:config:set)
   2. process.env.PAYU_*          (Cloud Functions secrets / runtime env)
   This lets the operator choose either mechanism.
*/
function getPayUConfig() {
  const cfg = (functions.config() && functions.config().payu) || {};
  const env = cfg.env || process.env.PAYU_ENV || 'test';
  return {
    env,
    baseUrl: PAYU_ENVIRONMENTS[env].baseUrl,
    checkoutUrl: PAYU_ENVIRONMENTS[env].checkoutUrl,
    verifyUrl: PAYU_ENVIRONMENTS[env].verifyUrl,
    merchantKey: cfg.merchant_key || process.env.PAYU_MERCHANT_KEY,
    merchantSalt: cfg.merchant_salt || process.env.PAYU_MERCHANT_SALT,
    // Some PayU accounts use a separate SALT2 for the verify_payment API
    merchantSalt2: cfg.merchant_salt2 || process.env.PAYU_MERCHANT_SALT2 ||
                   cfg.merchant_salt || process.env.PAYU_MERCHANT_SALT
  };
}

function isConfigured() {
  const cfg = getPayUConfig();
  return !!(cfg.merchantKey && cfg.merchantSalt);
}

/* ---------- Hash Generation: PayU Order Request ----------
   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
   Empty UDFs are represented as empty strings separated by pipes.
*/
function generateRequestHash({ key, txnid, amount, productinfo, firstname, email, udf = [] }) {
  const cfg = getPayUConfig();
  // Pad UDFs to 10 (PayU uses udf1-udf5 in request hash; udf6-udf10 not included in request hash)
  const u1 = udf[0] || '';
  const u2 = udf[1] || '';
  const u3 = udf[2] || '';
  const u4 = udf[3] || '';
  const u5 = udf[4] || '';
  const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${u1}|${u2}|${u3}|${u4}|${u5}||||||${cfg.merchantSalt}`;
  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

/* ---------- Hash Generation: PayU Verify Payment Response ----------
   sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid)
   For verify_payment API response.
*/
function generateVerifyPaymentResponseHash({ status, email, firstname, productinfo, amount, txnid, udf = [] }) {
  const cfg = getPayUConfig();
  const u1 = udf[0] || '';
  const u2 = udf[1] || '';
  const u3 = udf[2] || '';
  const u4 = udf[3] || '';
  const u5 = udf[4] || '';
  const hashStr = `${cfg.merchantSalt2}|${status}||||||${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}`;
  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

/* ---------- Hash Generation: PayU Webhook Reverse Callback ----------
   sha512(SALT|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid)
   This is the hash PayU sends in the server-to-server reverse callback POST.
*/
function generateWebhookCallbackHash({ status, email, firstname, productinfo, amount, txnid, udf = [] }) {
  const cfg = getPayUConfig();
  const udfArr = Array(10).fill('');
  for (let i = 0; i < 10; i++) udfArr[i] = udf[i] || '';
  const [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10] = udfArr;
  const hashStr = `${cfg.merchantSalt}|${status}|${u10}|${u9}|${u8}|${u7}|${u6}|${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}`;
  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

/* ---------- Verify Webhook Callback Hash ----------
   CRITICAL: We must recompute the hash from the PayU POST body and compare
   against the `hash` field PayU sent. Use timingSafeEqual.
   Length check is done BEFORE try/catch to avoid timing leaks.
*/
function verifyWebhookCallbackHash(callbackBody) {
  const cfg = getPayUConfig();
  const {
    status, email = '', firstname = '', productinfo = '',
    amount = '', txnid = '', hash = ''
  } = callbackBody;

  const udf = [
    callbackBody.udf1, callbackBody.udf2, callbackBody.udf3,
    callbackBody.udf4, callbackBody.udf5, callbackBody.udf6,
    callbackBody.udf7, callbackBody.udf8, callbackBody.udf9,
    callbackBody.udf10
  ];

  const expected = generateWebhookCallbackHash({
    status, email, firstname, productinfo, amount, txnid, udf
  });

  // Length check MUST happen before try/catch — otherwise a length mismatch
  // leaks timing info via the catch path
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/* ---------- Verify Verify-Payment API Response Hash ----------
   Length check is done BEFORE try/catch to avoid timing leaks.
*/
function verifyVerifyPaymentResponseHash(responseBody) {
  const { status, email = '', firstname = '', productinfo = '',
          amount = '', txnid = '', hash = '' } = responseBody;
  const udf = [
    responseBody.udf1, responseBody.udf2, responseBody.udf3,
    responseBody.udf4, responseBody.udf5
  ];
  const expected = generateVerifyPaymentResponseHash({
    status, email, firstname, productinfo, amount, txnid, udf
  });
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

/* ---------- Create PayU Payment Session ----------
   Returns: { txnid, paymentUrl, params }
   The frontend will submit a POST form to paymentUrl with these params.
   We use udf1 to carry the ELAS Sale ID (immutable link).
*/
async function createSession({ amount, currency = 'INR', productinfo, firstname, email, saleId, callbackUrl, successUrl, failureUrl, udf = [] }) {
  if (!isConfigured()) {
    throw new Error('PayU is not configured. Set PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT.');
  }
  const cfg = getPayUConfig();

  // Generate a unique PayU transaction ID. We use the ELAS Sale ID so
  // the link is preserved and idempotent at the gateway level.
  const txnid = saleId; // txnid = Sale ID for 1:1 traceability

  // Build UDF array — udf1 must be the Sale ID
  const finalUdf = [
    saleId, // udf1 = Sale ID (immutable link to ELAS sale)
    udf[0] || '', // udf2
    udf[1] || '', // udf3
    udf[2] || '', // udf4
    udf[3] || '', // udf5
  ];

  const hash = generateRequestHash({
    key: cfg.merchantKey,
    txnid,
    amount: amount.toString(),
    productinfo,
    firstname,
    email,
    udf: finalUdf
  });

  return {
    txnid,
    gateway: 'payu',
    environment: cfg.env,
    paymentUrl: cfg.checkoutUrl,
    // The frontend should POST these to paymentUrl
    params: {
      key: cfg.merchantKey,
      txnid,
      amount: amount.toString(),
      productinfo,
      firstname,
      email,
      phone: '', // optional
      udf1: finalUdf[0],
      udf2: finalUdf[1],
      udf3: finalUdf[2],
      udf4: finalUdf[3],
      udf5: finalUdf[4],
      surl: successUrl,
      furl: failureUrl,
      curl: callbackUrl, // PayU server-to-server reverse callback
      hash
    }
  };
}

/* ---------- Verify Payment (server-side) ----------
   Hits PayU's verify_payment API to confirm the transaction state.
   This is used to double-check any payment when we want server-to-server
   confirmation (e.g., when /thanks loads and webhook hasn't fired yet).
*/
async function verifyPaymentServerSide({ txnid }) {
  if (!isConfigured()) {
    throw new Error('PayU is not configured');
  }
  const cfg = getPayUConfig();
  // PayU verify_payment requires command=verify_payment
  const verifyHash = crypto.createHash('sha512')
    .update(`${cfg.merchantKey}|verify_payment|${txnid}|${cfg.merchantSalt2}`)
    .digest('hex');

  const formData = new URLSearchParams();
  formData.append('key', cfg.merchantKey);
  formData.append('command', 'verify_payment');
  formData.append('var1', txnid);
  formData.append('hash', verifyHash);

  return new Promise((resolve, reject) => {
    const url = new URL(cfg.verifyUrl);
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData.toString())
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Invalid response from PayU: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(formData.toString());
    req.end();
  });
}

/* ---------- Parse Webhook (reverse callback) ----------
   PayU sends application/x-www-form-urlencoded data to the curl URL.
   Returns normalized fields.
*/
function parseWebhook(body) {
  return {
    saleId: body.udf1 || null,
    transactionId: body.txnid || null,
    orderId: body.txnid || null,
    amount: body.amount ? Number(body.amount) : null,
    currency: 'INR',
    status: body.status || null,
    gatewayEventId: body.mihpayid || body.txnid || null,
    gatewayName: 'payu',
    productinfo: body.productinfo || null,
    firstname: body.firstname || null,
    email: body.email || null,
    phone: body.phone || null,
    hash: body.hash || null,
    mode: body.mode || null,
    bankRefNum: body.bank_ref_num || null,
    error: body.error || null,
    errorMessage: body.error_Message || null
  };
}

/* ---------- Gateway Adapter Export ---------- */
module.exports = {
  gateway: { name: 'payu' },
  isConfigured,
  getPayUConfig,
  createSession,
  verifyPaymentServerSide,
  verifyWebhookCallbackHash,
  verifyVerifyPaymentResponseHash,
  parseWebhook,
  generateRequestHash,
  generateWebhookCallbackHash,
  // Used by commissionService for status checks
  PAYU_STATUS_SUCCESS: 'success',
  PAYU_STATUS_FAILURE: 'failure',
  PAYU_STATUS_PENDING: 'pending'
};
