/* ===========================================================
   ELAS — Central Configuration & Constants
   =========================================================== */

/* ---------- Collection Names ---------- */
const COLLECTIONS = {
  USERS: 'users',
  LEADS: 'leads',
  CLOSERS: 'closers',
  DELIVERY_PARTNERS: 'deliveryPartners',
  FREELANCERS: 'freelancers',
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  ACTIVITIES: 'activities',
  NOTIFICATIONS: 'notifications',
  PRODUCTS: 'products',
  PRODUCT_SALES: 'productSales',
  TICKETS: 'tickets',
  DSA_CLOSERS: 'dsaClosers',
  LOAN_DEALS: 'loanDeals',
  PERF_VIDEOS: 'perfVideos',
  LEGAL_DOCUMENTS: 'legalDocuments',
  PRODUCT_DEALS: 'productDeals',
  WALLET_PAYOUTS: 'walletPayouts',
  WITHDRAWAL_REQUESTS: 'withdrawalRequests',
  SAAS_SALES: 'saasSales',
  MANAGERS: 'managers',
  CLOSER_ASSIGNMENTS: 'closerAssignments',
  CLIENT_REQUESTS: 'clientRequests',
  PAYOUT_PROFILES: 'payoutProfiles',
  /* New collections for payment architecture */
  SALES: 'sales',
  PAYMENTS: 'payments',
  COMMISSION_LEDGER: 'commissionLedger',
  SYSTEM_CONFIG: 'system_config'
};

/* ---------- Sales ID Configuration ---------- */
const SALE_ID_PREFIX = 'SALE';
const SALE_ID_START_NUMBER = 1001;

/* ---------- Commission Rates (Server-side authoritative) ---------- */
const DEFAULT_COMMISSION_RATES = {
  closer: 30000,
  productManager: 5000,
  seniorManager: 5000
};

/* ---------- Hierarchy Role Labels ---------- */
const ROLE_HIERARCHY = {
  ADMIN: 'admin',
  SENIOR_MANAGER: 'seniorManager',
  PRODUCT_MANAGER: 'productmanager',
  CLOSER: 'closer',
  CLIENT: 'client'
};

/* ---------- Sale & Payment Statuses ---------- */
const SALE_STATUSES = ['pending', 'created', 'verified', 'paid', 'failed', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'initiated', 'verified', 'failed', 'refunded', 'expired'];
const COMMISSION_STATUSES = ['pending', 'verified', 'paid', 'failed'];
const DELIVERY_STATUSES = ['locked', 'authorized', 'delivered', 'expired'];

/* ---------- Gateway Configuration ---------- */
/* Gateway credentials are server-side ONLY — never in frontend */
/* When gateway is finalized, configure via environment variables */
const GATEWAY_CONFIG = {
  /* These will be populated via server-side env vars */
  gatewayName: null,       // e.g., 'razorpay', 'stripe', 'paytm'
  apiKey: null,            // Server-side only
  secret: null,            // Server-side only
  webhookSecret: null      // Server-side only
};

/* ---------- Security Constants ---------- */
const SECURITY = {
  DELIVERY_TOKEN_EXPIRY_HOURS: 24,
  MAX_PASSWORD_LENGTH: 128,
  MIN_RECOVERY_KEY_LENGTH: 12
};

/* ---------- UI Constants ---------- */
const CURRENCY = 'INR';
const CURRENCY_SYMBOL = '₹';
const DATE_FORMAT = 'en-IN';

/* Export for use across routes */
if (typeof window !== 'undefined') {
  window.COLLECTIONS = COLLECTIONS;
  window.SALE_ID_PREFIX = SALE_ID_PREFIX;
  window.SALE_ID_START_NUMBER = SALE_ID_START_NUMBER;
  window.DEFAULT_COMMISSION_RATES = DEFAULT_COMMISSION_RATES;
  window.ROLE_HIERARCHY = ROLE_HIERARCHY;
  window.GATEWAY_CONFIG = GATEWAY_CONFIG;
  window.SECURITY = SECURITY;
}