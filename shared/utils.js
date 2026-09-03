/* ===========================================================
   ELAS — Shared Utility Functions
   ===========================================================
   NOTE: This file contains ONLY pure utility functions that do not
   depend on DB, FIREBASE_AVAILABLE, fsdb, saveLocalCache, or any
   other runtime state. Functions requiring those globals are
   defined in their respective page scripts (e.g. app-shell.html).
   =========================================================== */

/* ---------- Unique ID ---------- */
function uid(prefix){ return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- Money Formatter ---------- */
function fmtMoney(n){
  n = Number(n)||0;
  return '₹' + n.toLocaleString('en-IN', {maximumFractionDigits:0});
}

/* ---------- Date Formatters ---------- */
function fmtDate(d){
  if(!d) return '—';
  const dt = new Date(d);
  if(isNaN(dt)) return d;
  return dt.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'});
}
function fmtDateTime(d){
  const dt = new Date(d);
  if(isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) + ' · ' + dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }

/* ---------- HTML Escape ---------- */
function escapeHtml(s){
  if(s===undefined||s===null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Slug ---------- */
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }

/* ---------- Debounce ---------- */
function debounce(fn, ms){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

/* ---------- Toast (DOM-only, no DB dependency) ---------- */
function toast(message, type){
  type = type || 'info';
  const icons = {success:'✓', error:'✕', info:'ℹ'};
  const el = document.createElement('div');
  el.className = 'toast t-' + type;
  el.innerHTML = '<span class="t-ic">'+icons[type]+'</span><span>'+escapeHtml(String(message))+'</span>';
  const container = document.getElementById('toastContainer');
  if(container) container.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 280); }, 3200);
}

/* Export — pure functions only */
if (typeof window !== 'undefined') {
  window.uid = uid;
  window.fmtMoney = fmtMoney;
  window.fmtDate = fmtDate;
  window.fmtDateTime = fmtDateTime;
  window.todayISO = todayISO;
  window.escapeHtml = escapeHtml;
  window.toast = toast;
}
