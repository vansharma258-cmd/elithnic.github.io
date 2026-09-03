/* ===========================================================
   ELAS — PayU India Payment Service (Render Backend)
   ===========================================================
   Adapted from functions/paymentService.js for Express/Render.
   PayU SALT is read from process.env (set in Render dashboard).
   =========================================================== */

const crypto = require('crypto');
const https = require('https');

/* ---------- PayU Environment ---------- */
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

function getPayUConfig() {
  const env = process.env.PAYU_ENV || 'test';
  const cfg = {
    env,
    baseUrl: PAYU_ENVIRONMENTS[env].baseUrl,
    checkoutUrl: PAYU_ENVIRONMENTS[env].checkoutUrl,
    verifyUrl: PAYU_ENVIRONMENTS[env].verifyUrl,
    merchantKey: process.env.PAYU_MERCHANT_KEY,
    merchantSalt: process.env.PAYU_MERCHANT_SALT,
    merchantSalt2: process.env.PAYU_MERCHANT_SALT2 || process.env.PAYU_MERCHANT_SALT,
  };
  return cfg;
}

function isConfigured() {
  const cfg = getPayUConfig();
  return !!(cfg.merchantKey && cfg.merchantSalt);
}

/* ---------- Hash: Order Request ----------
   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
*/
function generateRequestHash({ key, txnid, amount, productinfo, firstname, email, udf = [] }) {
  const cfg = getPayUConfig();
  const u1 = udf[0] || '';
  const u2 = udf[1] || '';
  const u3 = udf[2] || '';
  const u4 = udf[3] || '';
  const u5 = udf[4] || '';
  const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${u1}|${u2}|${u3}|${u4}|${u5}||||||${cfg.merchantSalt}`;
  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

/* ---------- Hash: Webhook Reverse Callback ----------
   sha512(SALT|status|udf10|udf9|...|udf1|email|firstname|productinfo|amount|txnid)
*/
function generateWebhookCallbackHash({ status, email, firstname, productinfo, amount, txnid, udf = [] }) {
  const cfg = getPayUConfig();
  const udfArr = Array(10).fill('');
  for (let i = 0; i < 10; i++) udfArr[i] = udf[i] || '';
  const [u1, u2, u3, u4, u5, u6, u7, u8, u9, u10] = udfArr;
  const hashStr = `${cfg.merchantSalt}|${status}|${u10}|${u9}|${u8}|${u7}|${u6}|${u5}|${u4}|${u3}|${u2}|${u1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}`;
  return crypto.createHash('sha512').update(hashStr).digest('hex');
}

/* ---------- Verify Webhook Hash ---------- */
function verifyWebhookCallbackHash(callbackBody) {
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

  if (hash.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (e) {
    return false;
  }
}

/* ---------- Create PayU Session ---------- */
async function createSession({ amount, currency = 'INR', productinfo, firstname, email, saleId, callbackUrl, successUrl, failureUrl, udf = [] }) {
  if (!isConfigured()) {
    throw new Error('PayU is not configured');
  }
  const cfg = getPayUConfig();

  const txnid = saleId; // txnid = Sale ID for traceability

  const finalUdf = [
    saleId, // udf1 = Sale ID
    udf[0] || '', udf[1] || '', udf[2] || '', udf[3] || '',
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
    params: {
      key: cfg.merchantKey,
      txnid,
      amount: amount.toString(),
      productinfo,
      firstname,
      email,
      phone: '',
      udf1: finalUdf[0],
      udf2: finalUdf[1],
      udf3: finalUdf[2],
      udf4: finalUdf[3],
      udf5: finalUdf[4],
      surl: successUrl,
      furl: failureUrl,
      curl: callbackUrl,
      hash
    }
  };
}

/* ---------- Verify Payment Server-Side (PayU API) ---------- */
async function verifyPaymentServerSide({ txnid }) {
  if (!isConfigured()) throw new Error('PayU not configured');
  const cfg = getPayUConfig();

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
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid PayU response: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(formData.toString());
    req.end();
  });
}

/* ---------- Parse Webhook Body ---------- */
function parseWebhook(body) {
  // body is a Buffer (raw) for the webhook route
  const raw = typeof body === 'string' ? body : body.toString('utf8');
  const params = new URLSearchParams(raw);
  const get = (k) => params.get(k) || null;
  return {
    saleId: get('udf1') || null,
    transactionId: get('txnid') || null,
    orderId: get('txnid') || null,
    amount: get('amount') ? Number(get('amount')) : null,
    currency: 'INR',
    status: get('status') || null,
    gatewayEventId: get('mihpayid') || get('txnid') || null,
    gatewayName: 'payu',
    productinfo: get('productinfo') || null,
    firstname: get('firstname') || null,
    email: get('email') || null,
    hash: get('hash') || null,
    mode: get('mode') || null,
    bankRefNum: get('bank_ref_num') || null,
    error: get('error') || null,
    errorMessage: get('error_Message') || null,
  };
}

module.exports = {
  gateway: { name: 'payu' },
  isConfigured,
  getPayUConfig,
  createSession,
  verifyPaymentServerSide,
  verifyWebhookCallbackHash,
  parseWebhook,
  generateRequestHash,
  generateWebhookCallbackHash,
  PAYU_STATUS_SUCCESS: 'success',
  PAYU_STATUS_FAILURE: 'failure',
  PAYU_STATUS_PENDING: 'pending',
};
