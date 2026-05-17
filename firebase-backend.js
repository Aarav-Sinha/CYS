// ============================================================
//  firebase-backend.js — Critically Yours Portal
//  All Firebase Auth, Firestore, and Storage interactions
//  Replace the firebaseConfig object with your project values.
// ============================================================

// ── IMPORTANT: Replace with YOUR Firebase project credentials ──
const firebaseConfig = {
  apiKey: "AIzaSyCw-1ZShAXu8c5ZqnFXvS5S-YRqHReMydk",
  authDomain: "critically-yours.firebaseapp.com",
  projectId: "critically-yours",
  storageBucket: "critically-yours.firebasestorage.app",
  messagingSenderId: "861621080895",
  appId: "1:861621080895:web:14f06cbf7d98402dc8398a",
  measurementId: "G-RWFZRJ0673"
};

// ── SDK Imports (via CDN compat shim — see index.html script tags) ──
// These are accessed via the global firebase object loaded from the CDN.

let db, auth, storage;

/**
 * initFirebase()
 * Initialises Firebase app + services. Call once on page load.
 */
function initFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  db      = firebase.firestore();
  auth    = firebase.auth();
  storage = firebase.storage();

  // Enable offline persistence for Firestore
  db.enablePersistence({ synchronizeTabs: true })
    .catch(err => {
      if (err.code === 'failed-precondition') {
        console.warn('Firestore persistence: multiple tabs open.');
      } else if (err.code === 'unimplemented') {
        console.warn('Firestore persistence: browser unsupported.');
      }
    });

  console.log('%cFirebase initialised ✓', 'color:#c9a84c;font-weight:bold;');
}

// ============================================================
//  AUTH — Google Sign-In (for students)
// ============================================================

/**
 * signInWithGoogle()
 * Opens Google OAuth popup. Returns the signed-in user or null.
 */
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await auth.signInWithPopup(provider);
    const user   = result.user;
    // Ensure a user doc exists in Firestore
    await ensureUserDoc(user, 'student');
    return user;
  } catch (err) {
    console.error('Google Sign-In error:', err);
    throw err;
  }
}

/**
 * signInWithEmail(email, password)
 * For internal staff (Event Heads, Teachers, Admin).
 */
async function signInWithEmail(email, password) {
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  } catch (err) {
    console.error('Email Sign-In error:', err);
    throw err;
  }
}

/**
 * signOut()
 */
async function signOut() {
  await auth.signOut();
  window.location.href = 'index.html';
}

/**
 * onAuthStateChanged(callback)
 * Wraps the Firebase listener for convenience.
 */
function onAuthChanged(callback) {
  return auth.onAuthStateChanged(callback);
}

/**
 * getCurrentUser()
 */
function getCurrentUser() {
  return auth.currentUser;
}

// ============================================================
//  USER MANAGEMENT
// ============================================================

/**
 * ensureUserDoc(firebaseUser, defaultRole)
 * Creates a Firestore user doc on first sign-in; skips if exists.
 */
async function ensureUserDoc(firebaseUser, defaultRole = 'student') {
  const ref = db.collection('users').doc(firebaseUser.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      uid:           firebaseUser.uid,
      name:          firebaseUser.displayName || '',
      email:         firebaseUser.email || '',
      role:          defaultRole,
      assignedEvent: null,
      createdAt:     firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

/**
 * getUserDoc(uid) → user data object | null
 */
async function getUserDoc(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * updateUserRole(uid, role, assignedEvent?)
 * Admin / Teacher use.
 */
async function updateUserRole(uid, role, assignedEvent = null) {
  await db.collection('users').doc(uid).update({ role, assignedEvent });
}

/**
 * getAllUsers() → array of user objects
 */
async function getAllUsers() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
//  EVENTS
// ============================================================

/**
 * getEvents() → array of event objects
 */
async function getEvents() {
  const snap = await db.collection('events').orderBy('title').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * getEvent(eventId) → event object | null
 */
async function getEvent(eventId) {
  const snap = await db.collection('events').doc(eventId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * createEvent(data) → new event doc id
 */
async function createEvent(data) {
  const ref = await db.collection('events').add({
    ...data,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

/**
 * updateEvent(eventId, data)
 */
async function updateEvent(eventId, data) {
  await db.collection('events').doc(eventId).update(data);
}

/**
 * deleteEvent(eventId)
 */
async function deleteEvent(eventId) {
  await db.collection('events').doc(eventId).delete();
}

/**
 * listenToEvents(callback) → unsubscribe fn
 * Real-time listener for the events collection.
 */
function listenToEvents(callback) {
  return db.collection('events').orderBy('title').onSnapshot(snap => {
    const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(events);
  });
}

// ============================================================
//  REGISTRATIONS
// ============================================================

/**
 * registerForEvent(studentUid, eventId, formData)
 * Prevents duplicate registrations using compound query.
 */
async function registerForEvent(studentUid, eventId, formData) {
  // Check for existing registration
  const existing = await db.collection('registrations')
    .where('studentUid', '==', studentUid)
    .where('eventId', '==', eventId)
    .get();

  if (!existing.empty) {
    throw new Error('ALREADY_REGISTERED');
  }

  const ref = await db.collection('registrations').add({
    eventId,
    studentUid,
    studentName:     formData.studentName,
    classSection:    formData.classSection,
    phone:           formData.phone || '',
    email:           formData.email || '',
    selectionStatus: 'pending',
    registeredAt:    firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

/**
 * getRegistrationsForEvent(eventId) → array
 */
async function getRegistrationsForEvent(eventId) {
  const snap = await db.collection('registrations')
    .where('eventId', '==', eventId)
    .orderBy('registeredAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * getAllRegistrations() → array (Teacher / Admin)
 */
async function getAllRegistrations() {
  const snap = await db.collection('registrations').orderBy('registeredAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * getMyRegistrations(studentUid) → array
 */
async function getMyRegistrations(studentUid) {
  const snap = await db.collection('registrations')
    .where('studentUid', '==', studentUid)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * updateSelectionStatus(regId, status)
 * status: "pending" | "selected" | "waitlisted"
 */
async function updateSelectionStatus(regId, status) {
  await db.collection('registrations').doc(regId).update({ selectionStatus: status });
}

/**
 * listenToRegistrationsForEvent(eventId, callback) → unsubscribe fn
 */
function listenToRegistrationsForEvent(eventId, callback) {
  return db.collection('registrations')
    .where('eventId', '==', eventId)
    .orderBy('registeredAt', 'desc')
    .onSnapshot(snap => {
      const regs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(regs);
    });
}

/**
 * listenToAllRegistrations(callback) → unsubscribe fn
 */
function listenToAllRegistrations(callback) {
  return db.collection('registrations')
    .orderBy('registeredAt', 'desc')
    .onSnapshot(snap => {
      const regs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(regs);
    });
}

// ============================================================
//  NOTICES & TASKS
// ============================================================

/**
 * createNoticeOrTask(authorUid, eventId, data)
 * data: { type: "notice"|"task", title, content, status: "draft"|"published" }
 */
async function createNoticeOrTask(authorUid, eventId, data) {
  const ref = await db.collection('notices_tasks').add({
    ...data,
    authorUid,
    eventId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

/**
 * updateNoticeOrTask(docId, updates)
 */
async function updateNoticeOrTask(docId, updates) {
  await db.collection('notices_tasks').doc(docId).update({
    ...updates,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * deleteNoticeOrTask(docId)
 */
async function deleteNoticeOrTask(docId) {
  await db.collection('notices_tasks').doc(docId).delete();
}

/**
 * publishDraft(docId) — Shortcut to flip status to published.
 */
async function publishDraft(docId) {
  await updateNoticeOrTask(docId, { status: 'published' });
}

/**
 * getNoticesForEvent(eventId, status?) → array
 * Pass status = "published" or "draft" to filter; omit for all.
 */
async function getNoticesForEvent(eventId, status = null) {
  let query = db.collection('notices_tasks').where('eventId', '==', eventId);
  if (status) query = query.where('status', '==', status);
  const snap = await query.orderBy('timestamp', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * listenToNoticesForEvent(eventId, callback) → unsubscribe fn
 */
function listenToNoticesForEvent(eventId, callback) {
  return db.collection('notices_tasks')
    .where('eventId', '==', eventId)
    .orderBy('timestamp', 'desc')
    .onSnapshot(snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(items);
    });
}

// ============================================================
//  MESSAGES
// ============================================================

/**
 * sendMessage(senderUid, receiverUid, eventId, messageBody)
 */
async function sendMessage(senderUid, receiverUid, eventId, messageBody) {
  const ref = await db.collection('messages').add({
    senderUid,
    receiverUid,
    eventId,
    messageBody,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

/**
 * listenToConversation(uidA, uidB, callback) → unsubscribe fn
 * Listens to all messages between two users.
 */
function listenToConversation(uidA, uidB, callback) {
  // Firestore doesn't support OR queries natively pre-v10; use two listeners merged.
  const results = { sent: [], received: [] };
  const merge = () => {
    const all = [...results.sent, ...results.received]
      .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
    callback(all);
  };

  const unsub1 = db.collection('messages')
    .where('senderUid', '==', uidA)
    .where('receiverUid', '==', uidB)
    .orderBy('timestamp')
    .onSnapshot(snap => {
      results.sent = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

  const unsub2 = db.collection('messages')
    .where('senderUid', '==', uidB)
    .where('receiverUid', '==', uidA)
    .orderBy('timestamp')
    .onSnapshot(snap => {
      results.received = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

  return () => { unsub1(); unsub2(); };
}

/**
 * getMessagesForEvent(eventId) → array (Teacher overview)
 */
async function getMessagesForEvent(eventId) {
  const snap = await db.collection('messages')
    .where('eventId', '==', eventId)
    .orderBy('timestamp', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ============================================================
//  ANALYTICS HELPERS
// ============================================================

/**
 * getRegistrationCountPerEvent() → { eventId: count, ... }
 */
async function getRegistrationCountPerEvent() {
  const snap = await db.collection('registrations').get();
  const counts = {};
  snap.docs.forEach(d => {
    const { eventId } = d.data();
    counts[eventId] = (counts[eventId] || 0) + 1;
  });
  return counts;
}

/**
 * listenToActivityLog(callback, limit?) → unsubscribe fn
 * Watches notices_tasks for recent activity feed.
 */
function listenToActivityLog(callback, limit = 20) {
  return db.collection('notices_tasks')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .onSnapshot(snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(items);
    });
}

// ============================================================
//  EXPORTS (module pattern via global object)
// ============================================================
window.CYFirebase = {
  initFirebase,
  // Auth
  signInWithGoogle,
  signInWithEmail,
  signOut,
  onAuthChanged,
  getCurrentUser,
  // Users
  ensureUserDoc,
  getUserDoc,
  updateUserRole,
  getAllUsers,
  // Events
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  listenToEvents,
  // Registrations
  registerForEvent,
  getRegistrationsForEvent,
  getAllRegistrations,
  getMyRegistrations,
  updateSelectionStatus,
  listenToRegistrationsForEvent,
  listenToAllRegistrations,
  // Notices & Tasks
  createNoticeOrTask,
  updateNoticeOrTask,
  deleteNoticeOrTask,
  publishDraft,
  getNoticesForEvent,
  listenToNoticesForEvent,
  // Messages
  sendMessage,
  listenToConversation,
  getMessagesForEvent,
  // Analytics
  getRegistrationCountPerEvent,
  listenToActivityLog
};
