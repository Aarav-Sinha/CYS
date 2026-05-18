// ============================================================
//  firebase-backend.js — Critically Yours
//
//  AUTH: Everyone signs in with Google.
//
//  How accounts work:
//  ┌──────────────────────────────────────────────────────────┐
//  │  Admin pre-registers staff by Gmail + role via the       │
//  │  admin portal. When that person first signs in with      │
//  │  Google, their role is applied from `pre_registered`     │
//  │  and the record is consumed. Anyone NOT pre-registered   │
//  │  gets role = "student" automatically on first sign-in.   │
//  │                                                          │
//  │  The hardcoded admin email (aaravhfs@gmail.com) is       │
//  │  always guaranteed admin role on first sign-in.          │
//  └──────────────────────────────────────────────────────────┘
//
//  !! Replace firebaseConfig values before deploying !!
// ============================================================

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// Superadmin email — always gets admin role on first sign-in
const SUPERADMIN_EMAIL = "aaravhfs@gmail.com";

let db, auth, storage;

// ── Init ──────────────────────────────────────────────────
function initFirebase() {
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  db      = firebase.firestore();
  auth    = firebase.auth();
  storage = firebase.storage();

  db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code !== 'failed-precondition' && err.code !== 'unimplemented')
      console.error('Persistence error:', err);
  });
  console.log('%c✦ CYS Firebase ready', 'color:#c8a45a;font-weight:700;');
}

// ── Google Sign-In ─────────────────────────────────────────
async function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await auth.signInWithPopup(provider);
  const user   = result.user;
  const email  = user.email.toLowerCase();

  const userRef  = db.collection('users').doc(user.uid);
  const userSnap = await userRef.get();

  // Returning user — nothing to change
  if (userSnap.exists) return user;

  // First-time sign-in: determine role
  let role          = 'student';
  let assignedEvent = null;

  if (email === SUPERADMIN_EMAIL) {
    // Hardcoded superadmin
    role = 'admin';
  } else {
    // Check pre-registration queue
    const preSnap = await db.collection('pre_registered')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!preSnap.empty) {
      const pre   = preSnap.docs[0].data();
      role          = pre.role;
      assignedEvent = pre.assignedEvent || null;
      // Consume the record
      await preSnap.docs[0].ref.delete();
    }
  }

  await userRef.set({
    uid:           user.uid,
    name:          user.displayName || '',
    email,
    photoURL:      user.photoURL || '',
    role,
    assignedEvent,
    createdAt:     firebase.firestore.FieldValue.serverTimestamp()
  });

  return user;
}

async function signOut() {
  await auth.signOut();
  window.location.href = 'index.html';
}

function onAuthChanged(cb) { return auth.onAuthStateChanged(cb); }
function getCurrentUser()   { return auth.currentUser; }

// ── User docs ─────────────────────────────────────────────
async function getUserDoc(uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function updateUserRole(uid, role, assignedEvent = null) {
  await db.collection('users').doc(uid).update({ role, assignedEvent });
}

async function getAllUsers() {
  const snap = await db.collection('users').orderBy('name').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Pre-registration ───────────────────────────────────────
/**
 * preRegisterUser — Admin adds a Gmail + role before person signs in.
 * Throws: 'ALREADY_SIGNED_IN' | 'ALREADY_PRE_REGISTERED'
 */
async function preRegisterUser(adminUid, email, role, assignedEvent = null, note = '') {
  const norm = email.trim().toLowerCase();
  if (norm === SUPERADMIN_EMAIL) throw new Error('SUPERADMIN');

  const liveSnap = await db.collection('users').where('email', '==', norm).limit(1).get();
  if (!liveSnap.empty) throw new Error('ALREADY_SIGNED_IN');

  const qSnap = await db.collection('pre_registered').where('email', '==', norm).limit(1).get();
  if (!qSnap.empty) throw new Error('ALREADY_PRE_REGISTERED');

  await db.collection('pre_registered').add({
    email: norm, role,
    assignedEvent: assignedEvent || null,
    note: note.trim() || '',
    addedBy: adminUid,
    addedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function getAllPreRegistered() {
  const snap = await db.collection('pre_registered').orderBy('addedAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function deletePreRegistration(docId) {
  await db.collection('pre_registered').doc(docId).delete();
}

function listenToPreRegistered(cb) {
  return db.collection('pre_registered').orderBy('addedAt', 'desc')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Events ────────────────────────────────────────────────
async function getEvents() {
  const snap = await db.collection('events').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getEvent(id) {
  const snap = await db.collection('events').doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createEvent(data) {
  const ref = await db.collection('events').add({
    ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function updateEvent(id, data) {
  await db.collection('events').doc(id).update(data);
}

async function deleteEvent(id) {
  await db.collection('events').doc(id).delete();
}

function listenToEvents(cb) {
  return db.collection('events').orderBy('createdAt', 'desc')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Registrations ─────────────────────────────────────────
async function registerForEvent(studentUid, eventId, formData) {
  const dup = await db.collection('registrations')
    .where('studentUid', '==', studentUid)
    .where('eventId', '==', eventId).get();
  if (!dup.empty) throw new Error('ALREADY_REGISTERED');

  const ref = await db.collection('registrations').add({
    eventId, studentUid,
    studentName:  formData.studentName,
    classSection: formData.classSection,
    phone:        formData.phone  || '',
    email:        formData.email  || '',
    selectionStatus: 'pending',
    registeredAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function getRegistrationsForEvent(eventId) {
  const snap = await db.collection('registrations')
    .where('eventId', '==', eventId).orderBy('registeredAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAllRegistrations() {
  const snap = await db.collection('registrations').orderBy('registeredAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getMyRegistrations(uid) {
  const snap = await db.collection('registrations').where('studentUid', '==', uid).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateSelectionStatus(regId, status) {
  await db.collection('registrations').doc(regId).update({ selectionStatus: status });
}

function listenToRegistrationsForEvent(eventId, cb) {
  return db.collection('registrations').where('eventId', '==', eventId)
    .orderBy('registeredAt', 'desc')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

function listenToAllRegistrations(cb) {
  return db.collection('registrations').orderBy('registeredAt', 'desc')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Notices & Tasks ────────────────────────────────────────
async function createNoticeOrTask(authorUid, eventId, data) {
  const ref = await db.collection('notices_tasks').add({
    ...data, authorUid, eventId,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function updateNoticeOrTask(docId, updates) {
  await db.collection('notices_tasks').doc(docId).update({
    ...updates, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

async function deleteNoticeOrTask(docId) {
  await db.collection('notices_tasks').doc(docId).delete();
}

async function publishDraft(docId) {
  await updateNoticeOrTask(docId, { status: 'published' });
}

function listenToNoticesForEvent(eventId, cb) {
  return db.collection('notices_tasks').where('eventId', '==', eventId)
    .orderBy('timestamp', 'desc')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Schedule items ─────────────────────────────────────────
async function createScheduleItem(adminUid, data) {
  const ref = await db.collection('schedule').add({
    ...data, addedBy: adminUid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function deleteScheduleItem(id) {
  await db.collection('schedule').doc(id).delete();
}

function listenToSchedule(cb) {
  return db.collection('schedule').orderBy('day').orderBy('time')
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

async function getSchedule() {
  const snap = await db.collection('schedule').orderBy('day').orderBy('time').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Messages ──────────────────────────────────────────────
async function sendMessage(senderUid, receiverUid, eventId, messageBody) {
  const ref = await db.collection('messages').add({
    senderUid, receiverUid, eventId, messageBody,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

function listenToConversation(uidA, uidB, cb) {
  const r = { sent: [], recv: [] };
  const merge = () => cb([...r.sent, ...r.recv]
    .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)));

  const u1 = db.collection('messages')
    .where('senderUid', '==', uidA).where('receiverUid', '==', uidB)
    .orderBy('timestamp')
    .onSnapshot(s => { r.sent = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); });

  const u2 = db.collection('messages')
    .where('senderUid', '==', uidB).where('receiverUid', '==', uidA)
    .orderBy('timestamp')
    .onSnapshot(s => { r.recv = s.docs.map(d => ({ id: d.id, ...d.data() })); merge(); });

  return () => { u1(); u2(); };
}

// ── Analytics ─────────────────────────────────────────────
async function getRegistrationCountPerEvent() {
  const snap = await db.collection('registrations').get();
  const counts = {};
  snap.docs.forEach(d => {
    const { eventId } = d.data();
    counts[eventId] = (counts[eventId] || 0) + 1;
  });
  return counts;
}

function listenToActivityLog(cb, limit = 25) {
  return db.collection('notices_tasks').orderBy('timestamp', 'desc').limit(limit)
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ── Exports ────────────────────────────────────────────────
window.CYFirebase = {
  initFirebase, signInWithGoogle, signOut, onAuthChanged, getCurrentUser,
  getUserDoc, updateUserRole, getAllUsers,
  preRegisterUser, getAllPreRegistered, deletePreRegistration, listenToPreRegistered,
  getEvents, getEvent, createEvent, updateEvent, deleteEvent, listenToEvents,
  registerForEvent, getRegistrationsForEvent, getAllRegistrations, getMyRegistrations,
  updateSelectionStatus, listenToRegistrationsForEvent, listenToAllRegistrations,
  createNoticeOrTask, updateNoticeOrTask, deleteNoticeOrTask, publishDraft, listenToNoticesForEvent,
  createScheduleItem, deleteScheduleItem, listenToSchedule, getSchedule,
  sendMessage, listenToConversation,
  getRegistrationCountPerEvent, listenToActivityLog,
  SUPERADMIN_EMAIL
};