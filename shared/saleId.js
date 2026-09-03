/* ===========================================================
   ELAS — Sale ID Generation Service
   ===========================================================
   Generates unique human-readable Sale IDs (SALE-1001, SALE-1002...).
   Uses Firestore transaction to prevent duplicate IDs.
   =========================================================== */

/* Generate next Sale ID using Firestore transaction */
async function nextSaleId(){
  if (!FIREBASE_AVAILABLE || !fsdb) {
    // Fallback: use local counter in localStorage (DB may not be initialized yet)
    var localCounter = parseInt(localStorage.getItem('elithnic_saleid_counter') || '1000', 10) + 1;
    localStorage.setItem('elithnic_saleid_counter', localCounter);
    // Also update DB if it exists
    if (typeof DB !== 'undefined' && DB && DB.counters) {
      DB.counters.saleId = localCounter;
      if (typeof saveLocalCache === 'function') saveLocalCache();
    }
    return 'SALE-' + localCounter;
  }

  const sysRef = fsdb.collection('system').doc('counters');
  const newValue = await fsdb.runTransaction(async (tx) => {
    const snap = await tx.get(sysRef);
    const data = snap.exists ? snap.data() : {};
    const next = (data.saleIdCounter || 1000) + 1;
    tx.set(sysRef, { saleIdCounter: next }, { merge: true });
    return next;
  });

  // Mirror to local storage as fallback
  try { localStorage.setItem('elithnic_saleid_counter', newValue); } catch(e){}

  return 'SALE-' + newValue;
}

/* Validate Sale ID format */
function isValidSaleId(saleId){
  return /^SALE-\d{4,}$/.test(saleId);
}

/* Export */
if (typeof window !== 'undefined') {
  window.nextSaleId = nextSaleId;
  window.isValidSaleId = isValidSaleId;
}