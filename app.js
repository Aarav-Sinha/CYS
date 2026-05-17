// ============================================================
//  app.js — Critically Yours Portal
//  Frontend routing, state management, DOM logic,
//  and dashboard view controller.
// ============================================================

'use strict';

// ── App State ──────────────────────────────────────────────
const AppState = {
  currentUser:   null,   // Firebase Auth user
  userDoc:       null,   // Firestore user document
  events:        [],     // cached events array
  activeView:    null,   // current dashboard view id
  unsubscribers: [],     // Firestore listener cleanup fns
};

// ── Helpers ────────────────────────────────────────────────

/** Show a toast notification */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✗', info: '◆' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || '◆'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/** Format a Firestore timestamp to readable string */
function formatTimestamp(ts) {
  if (!ts) return '—';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Format timestamp to relative time */
function relativeTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/** Get initials from a name */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Escape HTML */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Unsubscribe all Firestore listeners */
function clearListeners() {
  AppState.unsubscribers.forEach(fn => fn());
  AppState.unsubscribers = [];
}

// ── Scroll-reveal setup ────────────────────────────────────
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── Navbar scroll effect ───────────────────────────────────
function initNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
  // Hamburger
  const ham  = document.getElementById('nav-hamburger');
  const links = document.getElementById('nav-links');
  if (ham && links) {
    ham.addEventListener('click', () => links.classList.toggle('open'));
  }
}

// ── Countdown Timer ────────────────────────────────────────
function initCountdown() {
  const targetEl = document.getElementById('fest-date');
  if (!targetEl) return;
  const festDate = new Date(targetEl.dataset.date || '2025-09-15T09:00:00');

  function tick() {
    const now  = new Date();
    const diff = festDate - now;
    if (diff <= 0) {
      document.getElementById('countdown-days').textContent   = '00';
      document.getElementById('countdown-hours').textContent  = '00';
      document.getElementById('countdown-mins').textContent   = '00';
      document.getElementById('countdown-secs').textContent   = '00';
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    document.getElementById('countdown-days').textContent   = String(d).padStart(2, '0');
    document.getElementById('countdown-hours').textContent  = String(h).padStart(2, '0');
    document.getElementById('countdown-mins').textContent   = String(m).padStart(2, '0');
    document.getElementById('countdown-secs').textContent   = String(s).padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================================
//  INDEX.HTML LOGIC
// ============================================================

async function initIndexPage() {
  initNavbar();
  initCountdown();
  initReveal();
  updateNavAuthState();

  // Load events into grid
  try {
    const events = await CYFirebase.getEvents();
    AppState.events = events;
    renderEventCards(events);
  } catch (e) {
    console.error('Failed to load events:', e);
  }

  // Auth button
  const btnPortal = document.getElementById('btn-portal');
  if (btnPortal) {
    btnPortal.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }
}

/** Update nav auth button based on current auth state */
function updateNavAuthState() {
  CYFirebase.onAuthChanged(user => {
    AppState.currentUser = user;
    const navAuth = document.getElementById('nav-auth-btn');
    if (!navAuth) return;
    if (user) {
      navAuth.textContent = 'My Dashboard';
      navAuth.href = 'dashboard.html';
    } else {
      navAuth.textContent = 'Portal Login';
      navAuth.href = 'dashboard.html';
    }
  });
}

// ── Render Event Cards on index.html ─────────────────────
const EVENT_ICONS = {
  debate:      '⚖️',
  quiz:        '🧠',
  essay:       '✒️',
  moot:        '🏛️',
  poetry:      '📜',
  model_un:    '🌐',
  photography: '📷',
  film:        '🎬',
  default:     '📚'
};

function renderEventCards(events) {
  const grid = document.getElementById('events-grid');
  if (!grid) return;

  if (!events.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">📋</div>
      <p>Events will be announced soon. Stay tuned.</p>
    </div>`;
    return;
  }

  grid.innerHTML = events.map(ev => `
    <div class="glass-card glass-hover event-card reveal" data-event-id="${ev.id}" tabindex="0" role="button">
      <div class="event-card-icon">${EVENT_ICONS[ev.category] || EVENT_ICONS.default}</div>
      <div class="event-card-tag">${esc(ev.category || 'Humanities')}</div>
      <h3 class="event-card-title">${esc(ev.title)}</h3>
      <p class="event-card-desc">${esc((ev.description || '').slice(0, 100))}…</p>
      <div class="event-card-meta">
        <span>🕐 ${esc(ev.time || 'TBA')}</span>
        <span>📍 ${esc(ev.venue || 'TBA')}</span>
      </div>
    </div>
  `).join('');

  // Re-run reveal on new elements
  initReveal();

  // Attach click handlers
  grid.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => openEventModal(card.dataset.eventId));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openEventModal(card.dataset.eventId); });
  });
}

// ── Event Modal ───────────────────────────────────────────
async function openEventModal(eventId) {
  const ev = AppState.events.find(e => e.id === eventId) || await CYFirebase.getEvent(eventId);
  if (!ev) return;

  const modal = document.getElementById('event-modal');
  document.getElementById('modal-event-title').textContent   = ev.title || '';
  document.getElementById('modal-event-category').textContent = ev.category || 'Humanities';
  document.getElementById('modal-event-desc').textContent    = ev.description || '';
  document.getElementById('modal-event-rules').innerHTML     = (ev.rules || 'Rules will be announced soon.')
    .split('\n').map(r => `<li>${esc(r)}</li>`).join('');
  document.getElementById('modal-event-venue').textContent   = ev.venue || 'TBA';
  document.getElementById('modal-event-time').textContent    = ev.time  || 'TBA';

  const regBtn = document.getElementById('modal-register-btn');
  regBtn.dataset.eventId = eventId;
  modal.classList.add('active');
}

function closeEventModal() {
  document.getElementById('event-modal')?.classList.remove('active');
}

// ── Registration Flow ─────────────────────────────────────
async function handleRegisterClick(eventId) {
  const user = CYFirebase.getCurrentUser();

  if (!user) {
    // Not signed in — trigger Google Sign-In
    try {
      showToast('Signing you in with Google…', 'info');
      await CYFirebase.signInWithGoogle();
      AppState.currentUser = CYFirebase.getCurrentUser();
      showRegForm(eventId);
    } catch (err) {
      showToast('Sign-in failed. Please try again.', 'error');
    }
    return;
  }
  showRegForm(eventId);
}

function showRegForm(eventId) {
  const regModal  = document.getElementById('reg-modal');
  const regFormEl = document.getElementById('registration-form');
  const user      = CYFirebase.getCurrentUser();

  // Pre-fill name & email
  document.getElementById('reg-name').value  = user?.displayName || '';
  document.getElementById('reg-email').value = user?.email || '';
  regFormEl.dataset.eventId = eventId;
  closeEventModal();
  regModal.classList.add('active');
}

async function submitRegistration(formEl) {
  const eventId = formEl.dataset.eventId;
  const user    = CYFirebase.getCurrentUser();
  if (!user || !eventId) return;

  const formData = {
    studentName:  document.getElementById('reg-name').value.trim(),
    classSection: document.getElementById('reg-class').value.trim(),
    phone:        document.getElementById('reg-phone').value.trim(),
    email:        user.email
  };

  if (!formData.studentName || !formData.classSection) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const btn = document.getElementById('reg-submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registering…';

  try {
    await CYFirebase.registerForEvent(user.uid, eventId, formData);
    showToast('Registration successful! 🎉', 'success');
    document.getElementById('reg-modal').classList.remove('active');
    formEl.reset();
  } catch (err) {
    if (err.message === 'ALREADY_REGISTERED') {
      showToast('You are already registered for this event.', 'error');
    } else {
      showToast('Registration failed. Please try again.', 'error');
      console.error(err);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirm Registration';
  }
}

// ============================================================
//  DASHBOARD.HTML LOGIC
// ============================================================

async function initDashboardPage() {
  initNavbar();

  // Wait for auth state
  CYFirebase.onAuthChanged(async user => {
    if (!user) {
      showAuthScreen();
      return;
    }
    AppState.currentUser = user;
    try {
      const userDoc = await CYFirebase.getUserDoc(user.uid);
      if (!userDoc) {
        // Account not set up by admin yet
        showAccessDenied('Your account has not been assigned a role yet. Please contact the administrator.');
        return;
      }
      AppState.userDoc = userDoc;
      bootDashboard(userDoc);
    } catch (e) {
      console.error(e);
      showAccessDenied('Error loading your profile. Please try again.');
    }
  });
}

// ── Auth Screen ───────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('auth-screen').style.display    = 'flex';
  document.getElementById('dashboard-layout').style.display = 'none';
  document.getElementById('access-denied').style.display  = 'none';

  // Wire up login buttons
  document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    try {
      await CYFirebase.signInWithGoogle();
    } catch (e) {
      showToast('Sign-in failed.', 'error');
    }
  });

  document.getElementById('staff-login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('staff-email').value.trim();
    const pass  = document.getElementById('staff-password').value;
    const btn   = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await CYFirebase.signInWithEmail(email, pass);
    } catch (err) {
      const msgs = {
        'auth/user-not-found':  'No account found with that email.',
        'auth/wrong-password':  'Incorrect password.',
        'auth/invalid-email':   'Invalid email address.'
      };
      showToast(msgs[err.code] || 'Login failed. Please check credentials.', 'error');
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

function showAccessDenied(msg) {
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('dashboard-layout').style.display = 'none';
  const ad = document.getElementById('access-denied');
  ad.style.display = 'flex';
  document.getElementById('access-denied-msg').textContent = msg || 'Access denied.';
}

// ── Boot Dashboard ────────────────────────────────────────
function bootDashboard(userDoc) {
  document.getElementById('auth-screen').style.display    = 'none';
  document.getElementById('access-denied').style.display  = 'none';
  document.getElementById('dashboard-layout').style.display = 'flex';

  // Populate sidebar user info
  document.getElementById('sidebar-user-name').textContent = userDoc.name || userDoc.email || 'User';
  document.getElementById('sidebar-user-role').textContent = formatRole(userDoc.role);
  document.getElementById('sidebar-avatar').textContent    = getInitials(userDoc.name || userDoc.email);

  // Render sidebar nav per role
  renderSidebarNav(userDoc.role);

  // Navbar name
  const navName = document.getElementById('nav-user-name');
  if (navName) navName.textContent = (userDoc.name || userDoc.email || '').split(' ')[0];

  // Default view
  const defaultView = getDefaultView(userDoc.role);
  switchView(defaultView, userDoc);
}

function formatRole(role) {
  const map = {
    student:     'Student',
    event_head:  'Event Head',
    core_team:   'Core Team',
    teacher:     'Teacher In-Charge',
    admin:       'Administrator'
  };
  return map[role] || role;
}

function getDefaultView(role) {
  const map = {
    student:    'my-registrations',
    event_head: 'eh-participants',
    core_team:  'ct-overview',
    teacher:    'tc-analytics',
    admin:      'admin-users'
  };
  return map[role] || 'my-registrations';
}

// ── Sidebar Nav Config ────────────────────────────────────
const SIDEBAR_CONFIG = {
  student: [
    { id: 'my-registrations', icon: '📋', label: 'My Registrations' },
    { id: 'browse-events',    icon: '🗂️', label: 'Browse Events' },
  ],
  event_head: [
    { section: 'Event Management' },
    { id: 'eh-participants', icon: '👥', label: 'Participants' },
    { id: 'eh-notices',      icon: '📢', label: 'Notice Board' },
    { id: 'eh-tasks',        icon: '✅', label: 'Task Manager' },
    { id: 'eh-messages',     icon: '💬', label: 'Messages' },
  ],
  core_team: [
    { section: 'Coordination' },
    { id: 'ct-overview',     icon: '📊', label: 'Overview' },
    { id: 'ct-events',       icon: '🗂️', label: 'All Events' },
    { id: 'ct-announcements',icon: '📣', label: 'Announcements' },
  ],
  teacher: [
    { section: 'Teacher In-Charge' },
    { id: 'tc-analytics',    icon: '📈', label: 'Master Analytics' },
    { id: 'tc-activity',     icon: '⚡', label: 'Activity Monitor' },
    { id: 'tc-selection',    icon: '🏆', label: 'Selection Tool' },
    { id: 'tc-messages',     icon: '💬', label: 'Communications' },
  ],
  admin: [
    { section: 'Administration' },
    { id: 'admin-users',     icon: '👤', label: 'User Management' },
    { id: 'admin-events',    icon: '🗂️', label: 'Manage Events' },
    { id: 'admin-roles',     icon: '🔑', label: 'Role Assignment' },
  ]
};

function renderSidebarNav(role) {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  const items = SIDEBAR_CONFIG[role] || [];
  nav.innerHTML = items.map(item => {
    if (item.section) {
      return `<div class="sidebar-section-label">${item.section}</div>`;
    }
    return `
      <button class="sidebar-item" data-view="${item.id}" onclick="switchView('${item.id}', AppState.userDoc)">
        <span class="sidebar-icon">${item.icon}</span>
        <span>${item.label}</span>
      </button>`;
  }).join('');
}

// ── View Switcher ─────────────────────────────────────────
function switchView(viewId, userDoc) {
  // Clear existing listeners
  clearListeners();

  // Update active sidebar state
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  AppState.activeView = viewId;

  // Hide all views
  document.querySelectorAll('.dashboard-view').forEach(v => v.classList.remove('active'));

  // Show or build the target view
  const viewEl = document.getElementById(`view-${viewId}`);
  if (viewEl) {
    viewEl.classList.add('active');
  } else {
    buildView(viewId, userDoc);
  }
}

// ── View Builder (dynamic) ────────────────────────────────
function buildView(viewId, userDoc) {
  const main = document.getElementById('dashboard-content');
  if (!main) return;

  // Create view container
  const div = document.createElement('div');
  div.className = 'dashboard-view active fade-in';
  div.id = `view-${viewId}`;
  main.appendChild(div);

  // Dispatch to role-specific renderers
  switch (viewId) {
    // ── Student
    case 'my-registrations': renderMyRegistrations(div, userDoc); break;
    case 'browse-events':    renderBrowseEvents(div, userDoc); break;
    // ── Event Head
    case 'eh-participants':  renderParticipants(div, userDoc); break;
    case 'eh-notices':       renderNotices(div, userDoc); break;
    case 'eh-tasks':         renderTasks(div, userDoc); break;
    case 'eh-messages':      renderMessages(div, userDoc); break;
    // ── Core Team
    case 'ct-overview':      renderCoreOverview(div, userDoc); break;
    case 'ct-events':        renderCoreEvents(div, userDoc); break;
    case 'ct-announcements': renderAnnouncements(div, userDoc); break;
    // ── Teacher
    case 'tc-analytics':     renderTeacherAnalytics(div, userDoc); break;
    case 'tc-activity':      renderActivityMonitor(div, userDoc); break;
    case 'tc-selection':     renderSelectionTool(div, userDoc); break;
    case 'tc-messages':      renderTeacherMessages(div, userDoc); break;
    // ── Admin
    case 'admin-users':      renderAdminUsers(div, userDoc); break;
    case 'admin-events':     renderAdminEvents(div, userDoc); break;
    case 'admin-roles':      renderAdminRoles(div, userDoc); break;
    default:
      div.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔧</div><p>View coming soon.</p></div>`;
  }
}

// ============================================================
//  STUDENT VIEWS
// ============================================================

async function renderMyRegistrations(container, userDoc) {
  container.innerHTML = `
    <div class="dash-header">
      <h1>My Registrations</h1>
      <p>Events you have signed up for.</p>
    </div>
    <div id="my-reg-list"><div class="spinner" style="margin:3rem auto;display:block;"></div></div>`;

  try {
    const regs   = await CYFirebase.getMyRegistrations(userDoc.uid);
    const events = await CYFirebase.getEvents();
    const evMap  = {};
    events.forEach(e => evMap[e.id] = e);
    const listEl = document.getElementById('my-reg-list');

    if (!regs.length) {
      listEl.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <p>You haven't registered for any events yet. <br>
        <a href="index.html#events" style="color:var(--gold)">Browse events →</a></p>
      </div>`;
      return;
    }

    listEl.innerHTML = `<div class="events-grid">${
      regs.map(r => {
        const ev = evMap[r.eventId] || {};
        const statusBadge = {
          pending:    '<span class="badge badge-blue">Pending</span>',
          selected:   '<span class="badge badge-green">Selected ✓</span>',
          waitlisted: '<span class="badge badge-gold">Waitlisted</span>'
        }[r.selectionStatus] || '';
        return `
          <div class="glass-card" style="padding:1.5rem;">
            <div class="event-card-icon">${EVENT_ICONS[ev.category] || '📚'}</div>
            <h3 class="event-card-title" style="font-size:1.15rem;">${esc(ev.title || 'Event')}</h3>
            <div style="margin:.5rem 0;">${statusBadge}</div>
            <div class="event-card-meta" style="margin-top:.75rem;">
              <span>📍 ${esc(ev.venue || 'TBA')}</span>
              <span>🕐 ${esc(ev.time || 'TBA')}</span>
            </div>
            <p style="font-size:.75rem;color:var(--slate);margin-top:.75rem;font-family:var(--font-ui);">
              Registered ${relativeTime(r.registeredAt)}
            </p>
          </div>`;
      }).join('')
    }</div>`;
  } catch (e) {
    document.getElementById('my-reg-list').innerHTML = `<div class="empty-state"><p>Failed to load registrations.</p></div>`;
  }
}

async function renderBrowseEvents(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Browse Events</h1><p>Explore and register for fest events.</p></div>
    <div id="dashboard-events-grid" class="events-grid"><div class="spinner" style="margin:3rem auto;display:block;"></div></div>`;

  const events = await CYFirebase.getEvents();
  AppState.events = events;
  const grid = document.getElementById('dashboard-events-grid');
  if (!events.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📋</div><p>No events yet.</p></div>`;
    return;
  }
  grid.innerHTML = events.map(ev => `
    <div class="glass-card glass-hover event-card" data-event-id="${ev.id}" style="cursor:pointer;">
      <div class="event-card-icon">${EVENT_ICONS[ev.category] || '📚'}</div>
      <div class="event-card-tag">${esc(ev.category || 'Humanities')}</div>
      <h3 class="event-card-title">${esc(ev.title)}</h3>
      <p class="event-card-desc">${esc((ev.description || '').slice(0, 90))}…</p>
      <button class="btn btn-primary btn-sm" style="margin-top:.75rem;" onclick="handleRegisterClick('${ev.id}')">Register Now</button>
    </div>`).join('');
}

// ============================================================
//  EVENT HEAD VIEWS
// ============================================================

async function renderParticipants(container, userDoc) {
  const eventId = userDoc.assignedEvent;
  container.innerHTML = `
    <div class="dash-header">
      <h1>Participant Roster</h1>
      <p>Registered students for your event.</p>
    </div>
    <div style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
      <div class="search-bar" style="flex:1;min-width:200px;">
        <span class="search-icon">🔍</span>
        <input class="form-input" id="participant-search" placeholder="Search by name or class…" oninput="filterParticipants()">
      </div>
      <select class="form-select" id="status-filter" style="width:180px;" onchange="filterParticipants()">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="selected">Selected</option>
        <option value="waitlisted">Waitlisted</option>
      </select>
    </div>
    <div class="glass-card" style="overflow:auto;">
      <table class="data-table" id="participants-table">
        <thead><tr>
          <th>#</th><th>Name</th><th>Class</th><th>Email</th><th>Status</th><th>Registered</th>
        </tr></thead>
        <tbody id="participants-tbody">
          <tr><td colspan="6" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr>
        </tbody>
      </table>
    </div>`;

  if (!eventId) {
    document.getElementById('participants-tbody').innerHTML = `<tr><td colspan="6">No event assigned.</td></tr>`;
    return;
  }

  const unsub = CYFirebase.listenToRegistrationsForEvent(eventId, regs => {
    window._participantData = regs;
    renderParticipantRows(regs);
  });
  AppState.unsubscribers.push(unsub);
}

window._participantData = [];

function renderParticipantRows(regs) {
  const tbody = document.getElementById('participants-tbody');
  if (!tbody) return;
  if (!regs.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--slate);">No participants yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = regs.map((r, i) => `
    <tr>
      <td style="color:var(--slate);">${i + 1}</td>
      <td style="color:var(--ivory);font-weight:500;">${esc(r.studentName)}</td>
      <td>${esc(r.classSection)}</td>
      <td style="font-size:.8rem;">${esc(r.email || '—')}</td>
      <td>${statusBadgeHTML(r.selectionStatus)}</td>
      <td style="font-size:.78rem;color:var(--slate);">${relativeTime(r.registeredAt)}</td>
    </tr>`).join('');
}

function filterParticipants() {
  const q = (document.getElementById('participant-search')?.value || '').toLowerCase();
  const s = document.getElementById('status-filter')?.value || '';
  const data = window._participantData || [];
  const filtered = data.filter(r =>
    (!q || r.studentName?.toLowerCase().includes(q) || r.classSection?.toLowerCase().includes(q)) &&
    (!s || r.selectionStatus === s)
  );
  renderParticipantRows(filtered);
}

function statusBadgeHTML(status) {
  const map = {
    pending:    '<span class="badge badge-blue">Pending</span>',
    selected:   '<span class="badge badge-green">Selected</span>',
    waitlisted: '<span class="badge badge-gold">Waitlisted</span>'
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

// ── Notices ───────────────────────────────────────────────
async function renderNotices(container, userDoc) {
  const eventId = userDoc.assignedEvent;
  container.innerHTML = `
    <div class="dash-header"><h1>Notice Board</h1><p>Post announcements for your event's participants.</p></div>
    <div class="glass-card" style="padding:1.75rem;margin-bottom:2rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1.25rem;font-size:1.2rem;">New Notice</h3>
      <div class="form-group">
        <label class="form-label">Title</label>
        <input class="form-input" id="notice-title" placeholder="Notice title…">
      </div>
      <div class="form-group">
        <label class="form-label">Content</label>
        <textarea class="form-textarea" id="notice-content" rows="5" placeholder="Write your announcement here…"></textarea>
      </div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="saveNotice('${eventId}','${userDoc.uid}','draft')">Save as Draft</button>
        <button class="btn btn-primary btn-sm" onclick="saveNotice('${eventId}','${userDoc.uid}','published')">Publish Now</button>
      </div>
    </div>
    <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1rem;">Posted Notices</h3>
    <div id="notices-list"></div>`;

  if (!eventId) return;
  const unsub = CYFirebase.listenToNoticesForEvent(eventId, items => {
    renderNoticesList(items.filter(i => i.type === 'notice'));
  });
  AppState.unsubscribers.push(unsub);
}

function renderNoticesList(items) {
  const el = document.getElementById('notices-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📢</div><p>No notices posted yet.</p></div>`;
    return;
  }
  el.innerHTML = items.map(n => `
    <div class="glass-card" style="padding:1.25rem;margin-bottom:1rem;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem;">
            <h4 style="color:var(--ivory);font-size:1rem;">${esc(n.title)}</h4>
            <span class="badge ${n.status === 'published' ? 'badge-green' : 'badge-gold'}">${n.status}</span>
          </div>
          <p style="font-size:.9rem;color:var(--muted);font-family:var(--font-ui);line-height:1.5;">${esc(n.content)}</p>
          <p style="font-size:.72rem;color:var(--slate);margin-top:.5rem;font-family:var(--font-ui);">${formatTimestamp(n.timestamp)}</p>
        </div>
        <div style="display:flex;gap:.5rem;">
          ${n.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="publishItem('${n.id}')">Publish</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="deleteItem('${n.id}')">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

async function saveNotice(eventId, authorUid, status) {
  const title   = document.getElementById('notice-title')?.value.trim();
  const content = document.getElementById('notice-content')?.value.trim();
  if (!title || !content) { showToast('Please fill in all fields.', 'error'); return; }
  try {
    await CYFirebase.createNoticeOrTask(authorUid, eventId, { type: 'notice', title, content, status });
    document.getElementById('notice-title').value   = '';
    document.getElementById('notice-content').value = '';
    showToast(status === 'published' ? 'Notice published!' : 'Draft saved.', 'success');
  } catch (e) {
    showToast('Failed to save notice.', 'error');
  }
}

// ── Tasks ─────────────────────────────────────────────────
async function renderTasks(container, userDoc) {
  const eventId = userDoc.assignedEvent;
  container.innerHTML = `
    <div class="dash-header"><h1>Task Manager</h1><p>Assign tasks and reminders to participants.</p></div>
    <div class="glass-card" style="padding:1.75rem;margin-bottom:2rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1.25rem;font-size:1.2rem;">New Task</h3>
      <div class="form-group">
        <label class="form-label">Task Title</label>
        <input class="form-input" id="task-title" placeholder="e.g. Submit your essay draft…">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="task-content" rows="4" placeholder="Describe what participants need to do…"></textarea>
      </div>
      <div style="display:flex;gap:.75rem;">
        <button class="btn btn-outline btn-sm" onclick="saveTask('${eventId}','${userDoc.uid}','draft')">Save Draft</button>
        <button class="btn btn-primary btn-sm" onclick="saveTask('${eventId}','${userDoc.uid}','published')">Assign Task</button>
      </div>
    </div>
    <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1rem;">Active Tasks</h3>
    <div id="tasks-list"></div>`;

  if (!eventId) return;
  const unsub = CYFirebase.listenToNoticesForEvent(eventId, items => {
    renderTasksList(items.filter(i => i.type === 'task'));
  });
  AppState.unsubscribers.push(unsub);
}

function renderTasksList(items) {
  const el = document.getElementById('tasks-list');
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><p>No tasks assigned yet.</p></div>`;
    return;
  }
  el.innerHTML = items.map(t => `
    <div class="glass-card" style="padding:1.25rem;margin-bottom:1rem;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.4rem;">
            <span style="font-size:1rem;">✅</span>
            <h4 style="color:var(--ivory);font-size:1rem;">${esc(t.title)}</h4>
            <span class="badge ${t.status === 'published' ? 'badge-green' : 'badge-gold'}">${t.status}</span>
          </div>
          <p style="font-size:.88rem;color:var(--muted);font-family:var(--font-ui);">${esc(t.content)}</p>
          <p style="font-size:.72rem;color:var(--slate);margin-top:.4rem;font-family:var(--font-ui);">${formatTimestamp(t.timestamp)}</p>
        </div>
        <div style="display:flex;gap:.5rem;">
          ${t.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="publishItem('${t.id}')">Assign</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="deleteItem('${t.id}')">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

async function saveTask(eventId, authorUid, status) {
  const title   = document.getElementById('task-title')?.value.trim();
  const content = document.getElementById('task-content')?.value.trim();
  if (!title || !content) { showToast('Please fill in all fields.', 'error'); return; }
  try {
    await CYFirebase.createNoticeOrTask(authorUid, eventId, { type: 'task', title, content, status });
    document.getElementById('task-title').value   = '';
    document.getElementById('task-content').value = '';
    showToast(status === 'published' ? 'Task assigned!' : 'Draft saved.', 'success');
  } catch (e) {
    showToast('Failed to save task.', 'error');
  }
}

async function publishItem(docId) {
  try {
    await CYFirebase.publishDraft(docId);
    showToast('Published!', 'success');
  } catch (e) { showToast('Failed to publish.', 'error'); }
}

async function deleteItem(docId) {
  if (!confirm('Delete this item permanently?')) return;
  try {
    await CYFirebase.deleteNoticeOrTask(docId);
    showToast('Deleted.', 'info');
  } catch (e) { showToast('Delete failed.', 'error'); }
}

// ── Event Head Messages ───────────────────────────────────
async function renderMessages(container, userDoc) {
  container.innerHTML = `
    <div class="dash-header"><h1>Messages</h1><p>Communicate with the Teacher In-Charge.</p></div>
    <div class="glass-card" style="padding:1.5rem;margin-bottom:1.5rem;">
      <p style="font-family:var(--font-ui);font-size:.85rem;color:var(--muted);margin-bottom:1rem;">
        Use this channel to send updates or queries to the Teacher In-Charge.
      </p>
      <div class="chat-window" id="eh-chat-window">
        <div class="chat-messages" id="eh-chat-messages">
          <div style="text-align:center;color:var(--slate);font-size:.8rem;padding:2rem;">Loading messages…</div>
        </div>
        <div class="chat-input-row">
          <input class="form-input" id="eh-msg-input" placeholder="Type your message…" style="flex:1;" onkeydown="if(event.key==='Enter')sendEHMessage('${userDoc.uid}','${userDoc.assignedEvent}')">
          <button class="btn btn-primary btn-sm" onclick="sendEHMessage('${userDoc.uid}','${userDoc.assignedEvent}')">Send</button>
        </div>
      </div>
    </div>`;

  // Find teacher UID
  try {
    const allUsers = await CYFirebase.getAllUsers();
    const teacher  = allUsers.find(u => u.role === 'teacher');
    if (!teacher) {
      document.getElementById('eh-chat-messages').innerHTML = `<div style="text-align:center;color:var(--slate);padding:2rem;">No Teacher In-Charge found.</div>`;
      return;
    }
    window._teacherUid = teacher.uid;
    const unsub = CYFirebase.listenToConversation(userDoc.uid, teacher.uid, msgs => {
      renderChatMessages(msgs, userDoc.uid, 'eh-chat-messages');
    });
    AppState.unsubscribers.push(unsub);
  } catch (e) {
    console.error(e);
  }
}

async function sendEHMessage(senderUid, eventId) {
  const input = document.getElementById('eh-msg-input');
  const body  = input?.value.trim();
  if (!body || !window._teacherUid) return;
  input.value = '';
  try {
    await CYFirebase.sendMessage(senderUid, window._teacherUid, eventId || '', body);
  } catch (e) { showToast('Message failed.', 'error'); }
}

function renderChatMessages(msgs, myUid, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = `<div style="text-align:center;color:var(--slate);font-size:.82rem;padding:2rem;">No messages yet. Say hello!</div>`;
    return;
  }
  el.innerHTML = msgs.map(m => `
    <div>
      <div class="chat-bubble ${m.senderUid === myUid ? 'sent' : 'received'}">
        ${esc(m.messageBody)}
        <div class="chat-bubble-meta">${relativeTime(m.timestamp)}</div>
      </div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ============================================================
//  CORE TEAM VIEWS
// ============================================================

async function renderCoreOverview(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Overview</h1><p>Real-time metrics across all events.</p></div>
    <div class="stats-grid" id="core-stats">
      <div class="glass-card stat-card"><div class="stat-card-label">Total Events</div><div class="stat-card-value" id="stat-events">—</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Total Registrations</div><div class="stat-card-value" id="stat-regs">—</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Selected</div><div class="stat-card-value" id="stat-selected">—</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Pending</div><div class="stat-card-value" id="stat-pending">—</div></div>
    </div>
    <div class="glass-card" style="padding:1.5rem;margin-top:1.5rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1rem;">Registrations Per Event</h3>
      <div id="per-event-stats"></div>
    </div>`;

  const [events, counts] = await Promise.all([
    CYFirebase.getEvents(),
    CYFirebase.getRegistrationCountPerEvent()
  ]);

  const totalRegs     = Object.values(counts).reduce((a, b) => a + b, 0);
  document.getElementById('stat-events').textContent = events.length;
  document.getElementById('stat-regs').textContent   = totalRegs;

  const unsub = CYFirebase.listenToAllRegistrations(regs => {
    document.getElementById('stat-selected').textContent = regs.filter(r => r.selectionStatus === 'selected').length;
    document.getElementById('stat-pending').textContent  = regs.filter(r => r.selectionStatus === 'pending').length;
  });
  AppState.unsubscribers.push(unsub);

  const perEl = document.getElementById('per-event-stats');
  perEl.innerHTML = events.map(ev => {
    const cnt = counts[ev.id] || 0;
    const pct = totalRegs > 0 ? Math.round((cnt / totalRegs) * 100) : 0;
    return `
      <div style="margin-bottom:.85rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
          <span style="font-family:var(--font-ui);font-size:.85rem;color:var(--ivory);">${esc(ev.title)}</span>
          <span style="font-family:var(--font-ui);font-size:.82rem;color:var(--gold);">${cnt}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--gold-dim),var(--amber));border-radius:3px;transition:width .6s ease;"></div>
        </div>
      </div>`;
  }).join('');
}

async function renderCoreEvents(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>All Events</h1><p>Full list of fest events and their details.</p></div>
    <div id="core-events-list"><div class="spinner" style="margin:3rem auto;display:block;"></div></div>`;

  const events = await CYFirebase.getEvents();
  const el = document.getElementById('core-events-list');
  if (!events.length) { el.innerHTML = `<div class="empty-state"><p>No events found.</p></div>`; return; }
  el.innerHTML = `<div class="glass-card" style="overflow:auto;">
    <table class="data-table">
      <thead><tr><th>Event</th><th>Category</th><th>Venue</th><th>Time</th></tr></thead>
      <tbody>${events.map(ev => `
        <tr>
          <td style="color:var(--ivory);font-weight:500;">${esc(ev.title)}</td>
          <td>${esc(ev.category || '—')}</td>
          <td>${esc(ev.venue || '—')}</td>
          <td>${esc(ev.time || '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

async function renderAnnouncements(container, userDoc) {
  container.innerHTML = `
    <div class="dash-header"><h1>Announcements</h1><p>Post coordination messages for all event heads.</p></div>
    <div class="glass-card" style="padding:1.75rem;margin-bottom:2rem;">
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="ann-title" placeholder="Announcement title…"></div>
      <div class="form-group"><label class="form-label">Message</label><textarea class="form-textarea" id="ann-content" rows="4" placeholder="Write your announcement…"></textarea></div>
      <button class="btn btn-primary btn-sm" onclick="saveAnnouncement('${userDoc.uid}')">Publish Announcement</button>
    </div>
    <div id="ann-list"></div>`;

  const unsub = CYFirebase.listenToNoticesForEvent('__global__', items => {
    const el = document.getElementById('ann-list');
    if (!el) return;
    if (!items.length) { el.innerHTML = `<div class="empty-state"><p>No announcements yet.</p></div>`; return; }
    el.innerHTML = items.map(a => `
      <div class="glass-card" style="padding:1.25rem;margin-bottom:1rem;">
        <h4 style="color:var(--ivory);margin-bottom:.3rem;">${esc(a.title)}</h4>
        <p style="font-size:.88rem;color:var(--muted);font-family:var(--font-ui);">${esc(a.content)}</p>
        <p style="font-size:.72rem;color:var(--slate);margin-top:.4rem;font-family:var(--font-ui);">${formatTimestamp(a.timestamp)}</p>
      </div>`).join('');
  });
  AppState.unsubscribers.push(unsub);
}

async function saveAnnouncement(authorUid) {
  const title   = document.getElementById('ann-title')?.value.trim();
  const content = document.getElementById('ann-content')?.value.trim();
  if (!title || !content) { showToast('Please fill in all fields.', 'error'); return; }
  await CYFirebase.createNoticeOrTask(authorUid, '__global__', { type: 'notice', title, content, status: 'published' });
  document.getElementById('ann-title').value   = '';
  document.getElementById('ann-content').value = '';
  showToast('Announcement published!', 'success');
}

// ============================================================
//  TEACHER IN-CHARGE VIEWS
// ============================================================

async function renderTeacherAnalytics(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Master Analytics</h1><p>Real-time registration overview across all events.</p></div>
    <div class="stats-grid">
      <div class="glass-card stat-card"><div class="stat-card-label">Total Events</div><div class="stat-card-value" id="tc-stat-events">—</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Total Registrations</div><div class="stat-card-value" id="tc-stat-total">—</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Selected</div><div class="stat-card-value" id="tc-stat-selected" style="color:var(--gold);">—</div><div class="stat-card-sub">Confirmed for finals</div></div>
      <div class="glass-card stat-card"><div class="stat-card-label">Pending Review</div><div class="stat-card-value" id="tc-stat-pending">—</div></div>
    </div>
    <div class="glass-card" style="padding:1.5rem;margin-top:1.5rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1.25rem;">Event Breakdown</h3>
      <div id="tc-breakdown"></div>
    </div>`;

  const [events, counts] = await Promise.all([CYFirebase.getEvents(), CYFirebase.getRegistrationCountPerEvent()]);
  document.getElementById('tc-stat-events').textContent = events.length;

  const unsub = CYFirebase.listenToAllRegistrations(regs => {
    document.getElementById('tc-stat-total').textContent    = regs.length;
    document.getElementById('tc-stat-selected').textContent = regs.filter(r => r.selectionStatus === 'selected').length;
    document.getElementById('tc-stat-pending').textContent  = regs.filter(r => r.selectionStatus === 'pending').length;
  });
  AppState.unsubscribers.push(unsub);

  const bd = document.getElementById('tc-breakdown');
  bd.innerHTML = `<div class="glass-card" style="overflow:auto;"><table class="data-table">
    <thead><tr><th>Event</th><th>Registrations</th><th>Category</th><th>Venue</th></tr></thead>
    <tbody>${events.map(ev => `
      <tr>
        <td style="color:var(--ivory);font-weight:500;">${esc(ev.title)}</td>
        <td><span class="badge badge-gold">${counts[ev.id] || 0}</span></td>
        <td>${esc(ev.category || '—')}</td>
        <td>${esc(ev.venue || '—')}</td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

async function renderActivityMonitor(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Activity Monitor</h1><p>Live stream of recent actions across all event heads.</p></div>
    <div class="glass-card" style="padding:1.5rem;">
      <div class="activity-feed" id="activity-feed-list">
        <div style="text-align:center;padding:2rem;"><span class="spinner"></span></div>
      </div>
    </div>`;

  const unsub = CYFirebase.listenToActivityLog(items => {
    const el = document.getElementById('activity-feed-list');
    if (!el) return;
    if (!items.length) { el.innerHTML = `<div class="empty-state"><p>No recent activity.</p></div>`; return; }
    el.innerHTML = items.map(item => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-text">
          <strong>${esc(item.type === 'task' ? '✅ Task' : '📢 Notice')}</strong>
          "${esc(item.title)}"
          <span class="badge ${item.status === 'published' ? 'badge-green' : 'badge-gold'}" style="margin-left:.4rem;">${item.status}</span>
        </div>
        <span class="activity-time">${relativeTime(item.timestamp)}</span>
      </div>`).join('');
  });
  AppState.unsubscribers.push(unsub);
}

async function renderSelectionTool(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Selection Tool</h1><p>Mark participants as Selected or Waitlisted.</p></div>
    <div style="margin-bottom:1rem;display:flex;gap:1rem;flex-wrap:wrap;">
      <select class="form-select" id="sel-event-filter" style="max-width:240px;" onchange="loadSelectionList()">
        <option value="">All Events</option>
      </select>
      <select class="form-select" id="sel-status-filter" style="max-width:180px;" onchange="loadSelectionList()">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="selected">Selected</option>
        <option value="waitlisted">Waitlisted</option>
      </select>
    </div>
    <div class="glass-card" style="overflow:auto;">
      <table class="data-table" id="sel-table">
        <thead><tr><th>Name</th><th>Class</th><th>Event</th><th>Status</th><th>Change</th></tr></thead>
        <tbody id="sel-tbody"><tr><td colspan="5" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr></tbody>
      </table>
    </div>`;

  const events = await CYFirebase.getEvents();
  const selFilter = document.getElementById('sel-event-filter');
  events.forEach(ev => {
    const o = document.createElement('option');
    o.value = ev.id;
    o.textContent = ev.title;
    selFilter.appendChild(o);
  });
  window._selectionEvents = events;
  await loadSelectionList();
}

window._selectionEvents = [];

async function loadSelectionList() {
  const eventId = document.getElementById('sel-event-filter')?.value || '';
  const status  = document.getElementById('sel-status-filter')?.value || '';
  const tbody   = document.getElementById('sel-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:1.5rem;"><span class="spinner"></span></td></tr>`;

  let regs = [];
  if (eventId) {
    regs = await CYFirebase.getRegistrationsForEvent(eventId);
  } else {
    regs = await CYFirebase.getAllRegistrations();
  }
  if (status) regs = regs.filter(r => r.selectionStatus === status);

  const evMap = {};
  (window._selectionEvents || []).forEach(e => evMap[e.id] = e.title);

  if (!regs.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--slate);padding:1.5rem;">No participants found.</td></tr>`;
    return;
  }
  tbody.innerHTML = regs.map(r => `
    <tr>
      <td style="color:var(--ivory);font-weight:500;">${esc(r.studentName)}</td>
      <td>${esc(r.classSection)}</td>
      <td style="font-size:.82rem;">${esc(evMap[r.eventId] || r.eventId)}</td>
      <td>${statusBadgeHTML(r.selectionStatus)}</td>
      <td>
        <select class="form-select" style="padding:.3rem .6rem;font-size:.78rem;" onchange="updateStatus('${r.id}', this.value)">
          <option value="pending"    ${r.selectionStatus === 'pending'    ? 'selected' : ''}>Pending</option>
          <option value="selected"   ${r.selectionStatus === 'selected'   ? 'selected' : ''}>Selected</option>
          <option value="waitlisted" ${r.selectionStatus === 'waitlisted' ? 'selected' : ''}>Waitlisted</option>
        </select>
      </td>
    </tr>`).join('');
}

async function updateStatus(regId, status) {
  try {
    await CYFirebase.updateSelectionStatus(regId, status);
    showToast(`Status updated to "${status}".`, 'success');
  } catch (e) { showToast('Failed to update status.', 'error'); }
}

async function renderTeacherMessages(container, userDoc) {
  container.innerHTML = `
    <div class="dash-header"><h1>Communications</h1><p>Messages from Event Heads.</p></div>
    <div id="tc-convo-list"><div class="spinner" style="margin:3rem auto;display:block;"></div></div>
    <div id="tc-chat-area" style="display:none;margin-top:1.5rem;"></div>`;

  try {
    const allUsers   = await CYFirebase.getAllUsers();
    const eventHeads = allUsers.filter(u => u.role === 'event_head');
    const el         = document.getElementById('tc-convo-list');
    if (!eventHeads.length) { el.innerHTML = `<div class="empty-state"><p>No Event Heads found.</p></div>`; return; }
    el.innerHTML = `<div style="display:flex;flex-direction:column;gap:.75rem;">` +
      eventHeads.map(eh => `
        <div class="glass-card glass-hover" style="padding:1.25rem;cursor:pointer;display:flex;align-items:center;gap:1rem;"
             onclick="openTCChat('${eh.uid}','${userDoc.uid}','${esc(eh.name || eh.email)}')">
          <div class="sidebar-avatar" style="width:42px;height:42px;font-size:1rem;">${getInitials(eh.name || eh.email)}</div>
          <div>
            <div style="color:var(--ivory);font-weight:500;font-family:var(--font-ui);">${esc(eh.name || eh.email)}</div>
            <div style="color:var(--gold);font-size:.75rem;font-family:var(--font-ui);">Event Head</div>
          </div>
        </div>`).join('') + `</div>`;
  } catch (e) { console.error(e); }
}

function openTCChat(ehUid, tcUid, ehName) {
  const area = document.getElementById('tc-chat-area');
  if (!area) return;
  area.style.display = 'block';
  area.innerHTML = `
    <div class="glass-card" style="padding:1.5rem;">
      <h4 style="color:var(--ivory);font-family:var(--font-display);margin-bottom:1rem;">Chat with ${esc(ehName)}</h4>
      <div class="chat-window">
        <div class="chat-messages" id="tc-chat-messages"><div style="text-align:center;color:var(--slate);padding:2rem;">Loading…</div></div>
        <div class="chat-input-row">
          <input class="form-input" id="tc-msg-input" placeholder="Type a message…" style="flex:1;"
                 onkeydown="if(event.key==='Enter')sendTCMessage('${tcUid}','${ehUid}')">
          <button class="btn btn-primary btn-sm" onclick="sendTCMessage('${tcUid}','${ehUid}')">Send</button>
        </div>
      </div>
    </div>`;
  clearListeners();
  const unsub = CYFirebase.listenToConversation(tcUid, ehUid, msgs => {
    renderChatMessages(msgs, tcUid, 'tc-chat-messages');
  });
  AppState.unsubscribers.push(unsub);
}

async function sendTCMessage(senderUid, receiverUid) {
  const input = document.getElementById('tc-msg-input');
  const body  = input?.value.trim();
  if (!body) return;
  input.value = '';
  await CYFirebase.sendMessage(senderUid, receiverUid, '', body);
}

// ============================================================
//  ADMIN VIEWS  (Role assignment only — no direct account creation)
// ============================================================

async function renderAdminUsers(container) {
  container.innerHTML = `
    <div class="dash-header">
      <h1>User Management</h1>
      <p>View all users who have signed in and manage their roles.</p>
    </div>
    <div class="glass-card" style="overflow:auto;">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Assigned Event</th><th>Actions</th></tr></thead>
        <tbody id="admin-users-tbody"><tr><td colspan="5" style="text-align:center;padding:2rem;"><span class="spinner"></span></td></tr></tbody>
      </table>
    </div>`;

  const [users, events] = await Promise.all([CYFirebase.getAllUsers(), CYFirebase.getEvents()]);
  const evMap = {};
  events.forEach(e => evMap[e.id] = e.title);
  window._adminEvents = events;

  const tbody = document.getElementById('admin-users-tbody');
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--slate);">No users found.</td></tr>`;
    return;
  }
  const roleBadge = r => ({
    student:    '<span class="badge badge-blue">Student</span>',
    event_head: '<span class="badge badge-purple">Event Head</span>',
    core_team:  '<span class="badge badge-gold">Core Team</span>',
    teacher:    '<span class="badge badge-green">Teacher</span>',
    admin:      '<span class="badge badge-red">Admin</span>'
  })[r] || `<span class="badge">${r}</span>`;

  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="color:var(--ivory);font-weight:500;">${esc(u.name || '—')}</td>
      <td style="font-size:.82rem;">${esc(u.email || '—')}</td>
      <td>${roleBadge(u.role)}</td>
      <td style="font-size:.82rem;">${esc(evMap[u.assignedEvent] || '—')}</td>
      <td><button class="btn btn-outline btn-sm" onclick="openRoleModal('${u.uid}','${esc(u.name || u.email)}','${u.role}','${u.assignedEvent || ''}')">Edit Role</button></td>
    </tr>`).join('');
}

async function renderAdminEvents(container) {
  container.innerHTML = `
    <div class="dash-header"><h1>Manage Events</h1><p>Create, edit, or remove fest events.</p></div>
    <div class="glass-card" style="padding:1.75rem;margin-bottom:2rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1.25rem;font-size:1.2rem;">Add New Event</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group"><label class="form-label">Event Title *</label><input class="form-input" id="ev-title" placeholder="e.g. Model United Nations"></div>
        <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="ev-category" placeholder="e.g. debate, quiz, essay…"></div>
        <div class="form-group"><label class="form-label">Venue</label><input class="form-input" id="ev-venue" placeholder="e.g. Auditorium Hall A"></div>
        <div class="form-group"><label class="form-label">Time</label><input class="form-input" id="ev-time" placeholder="e.g. 10:00 AM – 12:00 PM"></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="ev-desc" rows="3"></textarea></div>
      <div class="form-group"><label class="form-label">Rules (one per line)</label><textarea class="form-textarea" id="ev-rules" rows="4" placeholder="Rule 1&#10;Rule 2&#10;…"></textarea></div>
      <button class="btn btn-primary btn-sm" onclick="createEventAdmin()">Create Event</button>
    </div>
    <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1rem;">Existing Events</h3>
    <div id="admin-events-list"><span class="spinner" style="display:block;margin:2rem auto;"></span></div>`;

  loadAdminEventsList();
}

async function loadAdminEventsList() {
  const events = await CYFirebase.getEvents();
  const el = document.getElementById('admin-events-list');
  if (!el) return;
  if (!events.length) { el.innerHTML = `<div class="empty-state"><p>No events yet. Create one above.</p></div>`; return; }
  el.innerHTML = `<div class="glass-card" style="overflow:auto;"><table class="data-table">
    <thead><tr><th>Title</th><th>Category</th><th>Venue</th><th>Time</th><th></th></tr></thead>
    <tbody>${events.map(ev => `
      <tr>
        <td style="color:var(--ivory);font-weight:500;">${esc(ev.title)}</td>
        <td>${esc(ev.category || '—')}</td>
        <td>${esc(ev.venue || '—')}</td>
        <td>${esc(ev.time || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="deleteEventAdmin('${ev.id}')">Delete</button></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

async function createEventAdmin() {
  const data = {
    title:       document.getElementById('ev-title')?.value.trim(),
    category:    document.getElementById('ev-category')?.value.trim(),
    venue:       document.getElementById('ev-venue')?.value.trim(),
    time:        document.getElementById('ev-time')?.value.trim(),
    description: document.getElementById('ev-desc')?.value.trim(),
    rules:       document.getElementById('ev-rules')?.value.trim()
  };
  if (!data.title) { showToast('Event title is required.', 'error'); return; }
  await CYFirebase.createEvent(data);
  showToast('Event created!', 'success');
  ['ev-title','ev-category','ev-venue','ev-time','ev-desc','ev-rules'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  loadAdminEventsList();
}

async function deleteEventAdmin(eventId) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  await CYFirebase.deleteEvent(eventId);
  showToast('Event deleted.', 'info');
  loadAdminEventsList();
}

async function renderAdminRoles(container) {
  container.innerHTML = `
    <div class="dash-header">
      <h1>Role Assignment</h1>
      <p>Assign or change roles for any signed-in user. Accounts are created automatically when users sign in.</p>
    </div>
    <div class="glass-card" style="padding:1.5rem;margin-bottom:1.5rem;">
      <p style="font-family:var(--font-ui);font-size:.9rem;color:var(--muted);line-height:1.6;">
        <strong style="color:var(--ivory);">How it works:</strong> When a user signs in (via Google or email/password), their account is automatically added to the system with a default role of <span class="badge badge-blue">Student</span>. Use this panel — or the User Management tab — to elevate them to Event Head, Core Team, Teacher, or Admin.
      </p>
    </div>
    <div class="glass-card" style="padding:1.75rem;">
      <h3 style="font-family:var(--font-display);color:var(--ivory);margin-bottom:1.25rem;">Quick Role Change</h3>
      <div class="form-group"><label class="form-label">User Email</label><input class="form-input" id="role-email" placeholder="user@dps.com"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div class="form-group">
          <label class="form-label">New Role</label>
          <select class="form-select" id="role-select">
            <option value="student">Student</option>
            <option value="event_head">Event Head</option>
            <option value="core_team">Core Team</option>
            <option value="teacher">Teacher In-Charge</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Assigned Event (for Event Heads)</label>
          <select class="form-select" id="role-event">
            <option value="">None</option>
          </select>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="applyRoleChange()">Apply Role</button>
    </div>`;

  const events = await CYFirebase.getEvents();
  const sel = document.getElementById('role-event');
  events.forEach(ev => {
    const o = document.createElement('option');
    o.value = ev.id; o.textContent = ev.title;
    sel.appendChild(o);
  });
}

async function applyRoleChange() {
  const email       = document.getElementById('role-email')?.value.trim();
  const role        = document.getElementById('role-select')?.value;
  const assignedEv  = document.getElementById('role-event')?.value || null;
  if (!email || !role) { showToast('Please fill in all fields.', 'error'); return; }

  try {
    const allUsers = await CYFirebase.getAllUsers();
    const user     = allUsers.find(u => u.email === email);
    if (!user) { showToast('User not found. They must sign in at least once first.', 'error'); return; }
    await CYFirebase.updateUserRole(user.uid, role, assignedEv);
    showToast(`Role updated to "${formatRole(role)}" for ${email}.`, 'success');
  } catch (e) {
    showToast('Failed to update role.', 'error');
    console.error(e);
  }
}

// ── Role modal (from user management table) ────────────────
function openRoleModal(uid, name, currentRole, currentEvent) {
  const modal = document.getElementById('role-modal');
  document.getElementById('rm-uid').value   = uid;
  document.getElementById('rm-name').textContent = name;
  document.getElementById('rm-role').value  = currentRole;
  document.getElementById('rm-event').value = currentEvent || '';
  modal.classList.add('active');
}

async function applyRoleModal() {
  const uid   = document.getElementById('rm-uid').value;
  const role  = document.getElementById('rm-role').value;
  const event = document.getElementById('rm-event').value || null;
  try {
    await CYFirebase.updateUserRole(uid, role, event);
    showToast('Role updated!', 'success');
    document.getElementById('role-modal').classList.remove('active');
    // Re-render the user list
    const div = document.getElementById('view-admin-users');
    if (div) { div.remove(); }
    buildView('admin-users', AppState.userDoc);
  } catch (e) { showToast('Update failed.', 'error'); }
}

// ============================================================
//  GLOBAL MODAL CLOSE
// ============================================================
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// ============================================================
//  PAGE INIT ROUTER
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  CYFirebase.initFirebase();

  const page = document.body.dataset.page;
  if (page === 'index') {
    initIndexPage();
    // Wire up modal buttons
    document.getElementById('event-modal')?.addEventListener('click', e => {
      if (e.target.id === 'event-modal') closeEventModal();
    });
    document.getElementById('modal-register-btn')?.addEventListener('click', e => {
      handleRegisterClick(e.currentTarget.dataset.eventId);
    });
    document.getElementById('reg-modal-close')?.addEventListener('click', () => {
      document.getElementById('reg-modal').classList.remove('active');
    });
    document.getElementById('registration-form')?.addEventListener('submit', e => {
      e.preventDefault();
      submitRegistration(e.target);
    });
  } else if (page === 'dashboard') {
    initDashboardPage();
  }
});

// Expose to global scope for inline onclick handlers
window.AppState         = AppState;
window.switchView       = switchView;
window.showToast        = showToast;
window.handleRegisterClick = handleRegisterClick;
window.filterParticipants  = filterParticipants;
window.publishItem      = publishItem;
window.deleteItem       = deleteItem;
window.saveNotice       = saveNotice;
window.saveTask         = saveTask;
window.saveAnnouncement = saveAnnouncement;
window.sendEHMessage    = sendEHMessage;
window.sendTCMessage    = sendTCMessage;
window.openTCChat       = openTCChat;
window.loadSelectionList   = loadSelectionList;
window.updateStatus        = updateStatus;
window.createEventAdmin    = createEventAdmin;
window.deleteEventAdmin    = deleteEventAdmin;
window.loadAdminEventsList = loadAdminEventsList;
window.openRoleModal    = openRoleModal;
window.applyRoleModal   = applyRoleModal;
window.applyRoleChange  = applyRoleChange;
window.closeEventModal  = closeEventModal;
