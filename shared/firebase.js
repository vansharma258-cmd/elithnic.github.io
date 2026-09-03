/* ===========================================================
   ELAS — Firebase Configuration (shared across all routes)
   =========================================================== */

// Firebase config — preserve existing setup
const firebaseConfig = {
  apiKey: "AIzaSyCRA-KovecQr9ZS3H3Swr4_1qzIzS7MHl4",
  authDomain: "elithnic.firebaseapp.com",
  projectId: "elithnic",
  storageBucket: "elithnic.firebasestorage.app",
  messagingSenderId: "843612469239",
  appId: "1:843612469239:web:b5fd79945aa9093b64e0f2"
};

/* Initialize Firebase */
let app = null;
let fsdb = null;
let FIREBASE_AVAILABLE = false;

try {
  // Use the existing global firebase initialization pattern
  app = firebase.initializeApp(firebaseConfig);
  fsdb = firebase.firestore();
  FIREBASE_AVAILABLE = true;
  // Enable offline persistence with tab synchronization
  fsdb.enablePersistence({ synchronizeTabs: true }).catch(err => {
    console.warn('[Firestore] Offline persistence unavailable:', err.code);
  });
} catch (err) {
  console.error('[Firebase] SDK failed to initialize:', err.message);
  FIREBASE_AVAILABLE = false;
}

/* Export for use across routes */
if (typeof window !== 'undefined') {
  window.FIREBASE_AVAILABLE = FIREBASE_AVAILABLE;
  window.fsdb = fsdb;
  window.firebaseConfig = firebaseConfig;
}