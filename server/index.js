/* ===========================================================
   ELAS — Render Backend Entry Point
   ===========================================================
   Express.js server that replaces Firebase Cloud Functions.
   Runs on Render Free (Node 18).

   All sensitive operations use Firebase Admin SDK server-side.
   PayU SALT, Firebase service account, and other secrets
   are stored as Render environment variables — never in the repo.

   IMPORTANT: Do NOT put actual secret values in this file.
   All secrets come from process.env only.
   =========================================================== */

require('./env'); // Load and validate environment variables first

const express = require('express');
const helmet = require('helmet');
const admin = require('firebase-admin');

// ============================================================
// Firebase Admin SDK Initialization
// ============================================================
let db;
try {
  // Initialize with credentials from Render env var (service account JSON)
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    const saParsed = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(saParsed),
    });
  } else {
    // Fallback: use default credentials (GCE / Render meta)
    admin.initializeApp();
  }
  db = admin.firestore();
  console.log('[Init] Firebase Admin SDK initialized');
} catch (err) {
  console.error('[Init] Firebase Admin SDK init failed:', err.message);
  process.exit(1);
}

// ============================================================
// Express App Setup
// ============================================================
const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Allow inline scripts from our own pages
}));

// Parse JSON bodies (needed for all API routes)
app.use(express.json({ limit: '1mb' }));

// Parse URL-encoded bodies (needed for PayU webhook callback)
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============================================================
// CORS — Allow only ELAS frontend origins
// ============================================================
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://getelasos.com,https://www.getelasos.com')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Cache preflight
  res.setHeader('Access-Control-Max-Age', '3600');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ============================================================
// Raw Body for PayU Webhook (MUST be before express.json())
// PayU sends application/x-www-form-urlencoded to the callback URL.
// We need the raw body to verify the SHA-512 hash.
// ============================================================
app.use('/webhook/payu', express.raw({ type: 'application/x-www-form-urlencoded', limit: '1mb' }));

// ============================================================
// Health Check
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'elas-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    firebase: admin.apps.length > 0 ? 'initialized' : 'uninitialized',
  });
});

// ============================================================
// Mount Route Modules
// Each module receives (app, db, admin) for its implementation.
// ============================================================
const authRoutes    = require('./routes/auth');
const payRoutes     = require('./routes/pay');
const adminRoutes   = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');
const bootstrapRoutes = require('./routes/bootstrap');

app.use('/auth',     authRoutes);
app.use('/pay',      payRoutes);
app.use('/admin',    adminRoutes);
app.use('/webhook',  webhookRoutes);
app.use('/bootstrap', bootstrapRoutes);

// ============================================================
// 404 Handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// Global Error Handler
// Catches all errors and returns a clean JSON response.
// Never leaks stack traces or sensitive info in production.
// ============================================================
app.use((err, req, res, next) => {
  console.error('[Error]', req.path, err.message);
  const isDev = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] ELAS API running on port ${PORT}`);
  console.log(`[Server] Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
});

module.exports = app;
