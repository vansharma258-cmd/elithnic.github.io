# ELAS API — Render Backend

Replaces Firebase Cloud Functions (Blaze-plan required) with a free Node.js/Express backend on Render.

## Architecture

```
/app/  /pay/  /thanks/  (Firebase Hosting — unchanged)
        │
        │  HTTPS POST { data: ... }
        ▼
   Render Free Web Service
   https://your-app.onrender.com
        │
        ├── /auth/login
        ├── /auth/change-password
        ├── /auth/recover
        ├── /pay/products
        ├── /pay/closer
        ├── /pay/sale
        ├── /pay/verify
        ├── /pay/delivery-token
        ├── /pay/delivery/:token
        ├── /admin/users
        ├── /admin/users/:id
        ├── /admin/users/:id/reset-password
        ├── /admin/users/:id/sync-claims
        ├── /webhook/payu
        └── /bootstrap
        │
        │  Firebase Admin SDK
        ▼
   Firestore + Firebase Auth (Spark plan — free)
```

## Environment Variables

Set these in **Render Dashboard → Your Service → Environment**.

### Required

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Full service account JSON as a single-line string. Must have roles: **Firebase Auth Admin**, **Cloud Firestore Owner** (or at minimum read/write on all required collections). Generate from: Firebase Console → Project Settings → Service Accounts → Generate new private key. Paste the entire JSON as a string value. |
| `FIREBASE_WEB_API_KEY` | Firebase Web API Key (for password verification of migrated users via Identity Toolkit REST API). Find in: Firebase Console → Project Settings → General → Web API Key. |

### PayU (required before going live with payments)

| Variable | Description |
|---|---|
| `PAYU_ENV` | `test` (default) or `production` |
| `PAYU_MERCHANT_KEY` | Your PayU merchant key |
| `PAYU_MERCHANT_SALT` | Your PayU merchant SALT — **NEVER expose this to frontend** |
| `PAYU_MERCHANT_SALT2` | PayU SALT for verify_payment API (same as SALT if you don't use separate SALT2) |
| `PAYU_CALLBACK_URL` | Webhook URL (default: `https://your-app.onrender.com/webhook/payu`) |
| `PAYU_SUCCESS_URL` | Success redirect URL (default: `https://getelasos.com/thanks/?saleId=...`) |
| `PAYU_FAILURE_URL` | Failure redirect URL (default: `https://getelasos.com/pay/`) |

### Optional

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://getelasos.com,https://www.getelasos.com` | Comma-separated CORS origins |
| `API_BASE_URL` | `https://elas-api.onrender.com` | Used to build callback URLs |
| `ELAS_BOOTSTRAP_SECRET` | `elithnic-bootstrap-2024` | Change this to a random string! |
| `DELIVERY_TOKEN_EXPIRY_HOURS` | `24` | Hours until delivery token expires |
| `GCLOUD_PROJECT` | `elithnic` | Firebase project ID |
| `NODE_ENV` | `production` | — |

## Deployment Steps

### 1. Get Firebase service account JSON

```bash
# Download from Firebase Console:
# Project Settings → Service Accounts → Generate new private key
# Copy the JSON content
```

### 2. Create a new Web Service on Render

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Set:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Add Environment Variables from the table above.
5. Set `FIREBASE_SERVICE_ACCOUNT` as a multi-line env var (paste the full JSON string).
6. Deploy.

### 3. Update PayU webhook URL

After deployment, set your PayU callback/webhook URL to:
```
https://your-render-url.onrender.com/webhook/payu
```
In your PayU dashboard: Merchant Dashboard → My Account → Plugin / API Settings → Callback URL.

### 4. Update Firebase Hosting rewrites (optional)

If using Firebase Hosting rewrites to proxy API calls, add to `firebase.json`:

```json
"rewrites": [
  { "source": "/api/auth/*", "destination": "https://your-render-url.onrender.com/auth" },
  ...
]
```

Or simply update the frontend's `API_BASE_URL` to point to the Render URL.

### 5. Update frontend API base URL

In `/app/index.html`, `/pay/index.html`, `/thanks/index.html`, set:
```javascript
const API_BASE = 'https://your-render-url.onrender.com';
```

### 6. Bootstrap the admin account

```bash
curl -X POST https://your-render-url.onrender.com/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"secret":"elithnic-bootstrap-2024","loginId":"admin","password":"YourSecurePassword123","name":"Admin"}'
```

**Then change `ELAS_BOOTSTRAP_SECRET` to a new random value.**

## Local Development

```bash
cd server
npm install
# Set env vars locally (or create a .env file — DO NOT commit this)
cp ../functions/service-account-sample.json service-account.json
# Edit service-account.json and add your actual credentials

# Set env vars
export FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
export FIREBASE_WEB_API_KEY="your-web-api-key"
export PAYU_ENV="test"
export PAYU_MERCHANT_KEY="your-merchant-key"
export PAYU_MERCHANT_SALT="your-salt"
export NODE_ENV="development"

npm run dev
```

## Endpoints Summary

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Health check |
| POST | `/auth/login` | Rate-limited | Login (email/password → custom token) |
| POST | `/auth/change-password` | Bearer token | Change own password |
| POST | `/auth/recover` | Rate-limited | Recovery key → custom token |
| GET | `/pay/products` | None | List active products (public fields only) |
| POST | `/pay/closer` | None | Validate closer code → attribution IDs |
| POST | `/pay/sale` | None | Full checkout: create sale + PayU session |
| POST | `/pay/verify` | None | Verify payment status for /thanks/ |
| POST | `/pay/delivery-token` | Bearer token | Generate delivery token (authed users) |
| GET | `/pay/delivery/:token` | None (token-gated) | Get download URL for verified sale |
| GET | `/admin/users` | Admin Bearer token | List users (role-scoped) |
| POST | `/admin/users` | Admin Bearer token | Create user |
| PATCH | `/admin/users/:userId` | Admin Bearer token | Update user |
| DELETE | `/admin/users/:userId` | Admin Bearer token | Delete user |
| POST | `/admin/users/:userId/reset-password` | Admin Bearer token | Reset user password |
| POST | `/admin/users/:userId/sync-claims` | Admin Bearer token | Re-sync custom claims |
| POST | `/webhook/payu` | None (PayU server) | PayU reverse callback |
| POST | `/bootstrap` | Bootstrap secret | One-time admin provisioning |

## Security Notes

- PayU SALT is server-side only — never sent to frontend.
- Firebase service account JSON is server-side only — never sent to frontend.
- All admin endpoints require a valid Firebase ID token (Bearer).
- Rate limiting on `/auth/login` and `/auth/recover` prevents brute force.
- CORS allows only configured origins.
- Webhook verifies PayU SHA-512 hash before processing.
- Webhook is idempotent via `webhook_events` collection.
- Commission generation is idempotent via `commission_locks`.
- Delivery tokens expire and are single-use.
- No password, SALT, or service account credentials are logged.
