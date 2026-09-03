/* ===========================================================
   ELAS — Environment Variable Loader & Validator
   ===========================================================
   Loads and validates required environment variables from Render.
   Exits with a clear error if a critical variable is missing.

   IMPORTANT: Actual secret values are set in Render's dashboard.
   This file only documents the required variables and their purpose.
   NEVER put actual values in this file or the repository.

   Required env vars:
   =================
   FIREBASE_SERVICE_ACCOUNT   — Firebase service account JSON (stringified).
                               Set in Render: Settings → Environment → Environment Variables.
                               Must have roles: Firebase Auth Admin, Firestore Admin.

   Optional env vars:
   =================
   PAYU_ENV                  — 'test' or 'production' (default: 'test')
   PAYU_MERCHANT_KEY         — PayU merchant key
   PAYU_MERCHANT_SALT        — PayU merchant SALT (NEVER expose this to frontend)
   PAYU_MERCHANT_SALT2       — PayU SALT for verify_payment API
   PAYU_CALLBACK_URL         — Webhook callback URL (default: auto-detected)
   PAYU_SUCCESS_URL          — Success redirect URL
   PAYU_FAILURE_URL          — Failure redirect URL

   ALLOWED_ORIGINS           — Comma-separated list of allowed CORS origins
                               (default: https://getelasos.com,https://www.getelasos.com)

   NODE_ENV                  — 'development' or 'production'
   PORT                      — HTTP port (default: 3000)

   DELIVERY_TOKEN_EXPIRY_HOURS — Hours until delivery token expires (default: 24)

   ELAS_BOOTSTRAP_SECRET     — Secret for bootstrapAdmin endpoint (change from default)
   =========================================================== */

// Validate critical env vars and exit with clear error
function validateEnv() {
  const critical = [
    'FIREBASE_SERVICE_ACCOUNT',
  ];

  const missing = critical.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error('[Env] FATAL: Missing required environment variables:');
    missing.forEach(k => console.error(`  - ${k}`));
    console.error('[Env] Set these in Render dashboard: Settings → Environment Variables');
    process.exit(1);
  }

  // Validate service account JSON is parseable
  try {
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    console.error('[Env] FATAL: FIREBASE_SERVICE_ACCOUNT is not valid JSON');
    process.exit(1);
  }

  console.log('[Env] Environment variables validated OK');
}

validateEnv();
