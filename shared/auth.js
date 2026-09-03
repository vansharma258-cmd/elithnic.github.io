/* ===========================================================
   ELAS — Authentication Module (shared across all routes)
   ===========================================================
   NOTE: Current auth uses SHA-256 password hashing — no salt, no key
   stretching. This is a known security weakness.
   Migration path: Move to Firebase Auth / bcrypt later.
   Do NOT break existing accounts during migration.
   =========================================================== */

/* ---------- Constants (session-only, no DB dependency) ---------- */
const SESSION_KEY = 'elithnic_session_v1';

/* ---------- Session Helpers (no DB dependency) ---------- */
function isLoggedIn(){
  try{ return !!(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY)); }
  catch(e){ return false; }
}
function getSessionUserId(){
  try{ return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || null; }
  catch(e){ return null; }
}
function setLoggedIn(userId, remember){
  if(remember) localStorage.setItem(SESSION_KEY, userId);
  sessionStorage.setItem(SESSION_KEY, userId);
}
function clearLoggedIn(){
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

/* ---------- Password Hashing (SHA-256 — legacy) ---------- */
async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ---------- Role Labels (no DB dependency) ---------- */
const ROLE_LABELS = {
  admin:'Admin',closer:'Closer',dp:'Delivery Partner',freelancer:'Freelancer',
  client:'Client',dsacloser:'DSA Closer',loanmanager:'Loan Manager',
  productmanager:'Product Manager',servicemanager:'Service Manager',manager:'Manager'
};

/* Export */
if (typeof window !== 'undefined') {
  window.SESSION_KEY = SESSION_KEY;
  window.isLoggedIn = isLoggedIn;
  window.getSessionUserId = getSessionUserId;
  window.setLoggedIn = setLoggedIn;
  window.clearLoggedIn = clearLoggedIn;
  window.sha256 = sha256;
  window.ROLE_LABELS = ROLE_LABELS;
}
