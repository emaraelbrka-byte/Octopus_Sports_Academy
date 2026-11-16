/* Octopus Sports Academy - vanilla JS single page app (hash routing, no framework) */
'use strict';

const TZ = 'Asia/Kuala_Lumpur';
const LEVELS = ['beginner', 'intermediate', 'professional', 'champion'];
const state = { user: null, loaded: false, timers: [], scanner: null };

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = (d) =>
  new Date(d).toLocaleString('en-MY', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const todayISO = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // Malaysia date
const rm = (cents) => `RM ${(Number(cents) / 100).toFixed(2)}`;
const levelOptions = (sel = '') => LEVELS.map((l) => `<option value="${l}" ${l === sel ? 'selected' : ''}>${l[0].toUpperCase() + l.slice(1)}</option>`).join('');

async function api(path, { method, body } = {}) {
  const res = await fetch('/api' + path, {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    // Show the plain message only; the technical detail (development only) goes to the browser console
    if (data.detail) console.warn('[api]', path, data.detail);
    const err = new Error(data.error || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Small dialog with an OK button. onOk runs after the user presses OK.
function showDialog(message, onOk) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><p>${esc(message)}</p><button type="button" class="block">OK</button></div>`;
  document.body.appendChild(wrap);
  wrap.querySelector('button').onclick = () => {
    wrap.remove();
    if (onOk) onOk();
  };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3500);
}

function clearTimers() {
  document.querySelectorAll('#chatWidget, #chatFab').forEach((el) => el.remove());
  state.timers.forEach((t) => clearInterval(t));
  state.timers = [];
  if (state.scanner) { state.scanner.stop(); state.scanner = null; }
}

// Bind a form: prevents default, passes a plain object of fields to handler, shows errors in [data-msg]
function bindForm(sel, handler) {
  const form = $(sel);
  const msg = form.querySelector('[data-msg]');
  const btn = form.querySelector('button[type="submit"], button:not([type])');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn) btn.disabled = true;
    msg.textContent = '';
    msg.className = 'error';
    try {
      const data = Object.fromEntries(new FormData(form));
      const ok = await handler(data, form);
      if (ok) { msg.className = 'success'; msg.textContent = ok; }
    } catch (err) {
      msg.textContent = err.message;
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// ---------- session ----------
async function loadMe() {
  try {
    const { user } = await api('/me');
    state.user = user;
  } catch (_) {
    state.user = null;
  }
  state.loaded = true;
}

function renderNav() {
  const nav = $('#nav');
  if (!state.user) {
    // On the Log in / Sign up pages the card already has its own switch, so the top links are hidden there
    const onAuthPage = /^#\/(login|register)(\?|$)/.test(location.hash);
    nav.innerHTML = onAuthPage ? '' : '<a href="#/login">Log in</a><a href="#/register">Sign up</a>';
    return;
  }
  const links = ['<a href="#/">Home</a>', '<a href="#/me">My profile</a>'];
  if (state.user.role === 'admin') links.push('<a href="#/admin">Admin</a>');
  // Account menu: the arrow opens a small dropdown that holds Log out
  links.push(`<div class="nav-menu">
    <button class="secondary" id="navMenuBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">▾</button>
    <div class="nav-dropdown" id="navDropdown" hidden>
      <button class="secondary" id="logout" type="button">Log out</button>
    </div>
  </div>`);
  nav.innerHTML = links.join('');
  const menuBtn = $('#navMenuBtn');
  const dropdown = $('#navDropdown');
  menuBtn.onclick = (e) => {
    e.stopPropagation();
    dropdown.hidden = !dropdown.hidden;
    menuBtn.setAttribute('aria-expanded', String(!dropdown.hidden));
  };
  // Clicking anywhere else closes the menu
  document.onclick = (e) => {
    if (!e.target.closest || !e.target.closest('.nav-menu')) {
      dropdown.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  };
  $('#logout').onclick = async () => {
    await api('/auth/logout', { body: {} });
    state.user = null;
    location.hash = '#/login';
    renderNav();
  };
}

// ---------- router ----------
const routes = [
  [/^\/$/, home],
  [/^\/login$/, login],
  [/^\/register$/, register],
  [/^\/forgot$/, forgot],
  [/^\/reset$/, reset],
  [/^\/verify$/, verify],
  [/^\/condo\/([^/]+)$/, condo],
  [/^\/join\/([^/]+)$/, join],
  [/^\/invite\/([^/]+)$/, invite],
  [/^\/new-class\/([^/]+)$/, newClass],
  [/^\/new-condo$/, newCondo],
  [/^\/me$/, me],
  [/^\/checkin$/, checkin],
  [/^\/coach$/, coach],
  [/^\/admin(?:\/([a-z-]+))?$/, admin],
];

async function render() {
  clearTimers();
  if (!state.loaded) await loadMe();
  const [rawPath, qs] = location.hash.slice(1).split('?');
  const path = rawPath || '/';
  const params = new URLSearchParams(qs || '');
  // The slide animation is only for switching between Log in and Sign up, not when arriving from another page
  if (path !== '/login' && path !== '/register') authAnim.last = null;

  // An invite that was opened before logging in: once logged in, bring the person back to it
  const pendingInvite = pendingInviteGet();
  if (state.user && pendingInvite && !path.startsWith('/invite/')) {
    pendingInviteSet(null);
    location.hash = `#/invite/${pendingInvite}`;
    return;
  }
  renderNav();
  const app = $('#app');

  // Guard pages by login and role
  const needsLogin = path === '/me' || path.startsWith('/join/') || path.startsWith('/new-class/') || path === '/new-condo' || path === '/checkin' || path === '/coach' || path.startsWith('/admin');
  if (needsLogin && !state.user) {
    if (path === '/checkin' && params.get('token')) sessionStorage.setItem('pendingCheckin', params.get('token'));
    location.hash = '#/login';
    return;
  }
  // The coach panel now lives on My profile (coaches) — admins and students are sent elsewhere
  if (path === '/coach') {
    location.hash = state.user.role === 'admin' ? '#/admin' : '#/me';
    return;
  }
  if (path.startsWith('/admin') && state.user?.role !== 'admin') return (app.innerHTML = '<p class="card">Admins only.</p>');

  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try {
        await fn(decodeURIComponent(m[1] || ''), params);
      } catch (err) {
        app.innerHTML = `<div class="card error">${esc(err.message)}</div>`;
      }
      return;
    }
  }
  app.innerHTML = '<p class="card">Page not found.</p>';
}
window.addEventListener('hashchange', render);
document.addEventListener('DOMContentLoaded', render);

// ---------- light / dark theme ----------
// The saved choice is applied by a small script in index.html before the page paints.
// With no saved choice the site follows the phone/PC setting.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : darkQuery.matches;
}
function syncThemeButton() {
  const btn = $('#themeToggle');
  if (!btn) return;
  const dark = isDark();
  btn.textContent = dark ? '☀️' : '🌙';
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.title = btn.getAttribute('aria-label');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0b1222' : '#0a6cff';
}
document.addEventListener('DOMContentLoaded', () => {
  syncThemeButton();
  $('#themeToggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('osa_theme', next); } catch { /* private mode: the choice just isn't remembered */ }
    syncThemeButton();
  });
});
darkQuery.addEventListener('change', syncThemeButton);

// ---------- auth pages ----------
// Shared look for the log-in and sign-up screens: logo, title, a Log in / Sign up switch, then the form
// Remembers the last auth screen and its card height, so switching Log in <-> Sign up can animate
const authAnim = { last: null, height: 0 };

function authShell(active, inner) {
  // When coming from the other tab, the pill starts on the old side and the form slides in from that direction
  const switching = authAnim.last && authAnim.last !== active;
  const pillAt = switching ? authAnim.last : active;
  const slide = switching ? (active === 'register' ? 'from-right' : 'from-left') : 'fade-in';
  return `
    <div class="auth">
      <div class="auth-logo" aria-hidden="true">🐙</div>
      <h1>Octopus Sports Academy</h1>
      <p class="sub">Book swimming classes at your condo</p>
      <div class="card auth-card">
        <div class="seg">
          <span class="seg-pill${pillAt === 'register' ? ' right' : ''}" aria-hidden="true"></span>
          <a href="#/login" class="${active === 'login' ? 'active' : ''}">Log in</a>
          <a href="#/register" class="${active === 'register' ? 'active' : ''}">Sign up</a>
        </div>
        <div class="auth-body ${slide}">${inner}</div>
      </div>
    </div>`;
}

// Runs right after an auth screen is drawn: moves the pill and grows/shrinks the card smoothly
function animateAuth(active) {
  const card = $('.auth-card');
  const pill = $('.seg-pill');
  let prevHeight = authAnim.last && authAnim.last !== active ? authAnim.height : 0;
  authAnim.last = active;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = card.offsetHeight;
  if (prevHeight === target) prevHeight = 0; // same size: nothing to animate (no transitionend would fire)
  // Hold the old height before the first paint, so the card never jumps
  if (prevHeight && !reduce) { card.style.height = prevHeight + 'px'; card.style.overflow = 'hidden'; }
  requestAnimationFrame(() => {
    pill.classList.toggle('right', active === 'register');
    if (prevHeight && !reduce) {
      card.classList.add('resizing');
      card.style.height = target + 'px';
      card.addEventListener('transitionend', function done(e) {
        if (e.target !== card) return;
        card.classList.remove('resizing');
        card.style.height = '';
        card.style.overflow = '';
        card.removeEventListener('transitionend', done);
      });
    }
    authAnim.height = target;
  });
  // Keep the saved height current (e.g. after an error message appears)
  card.addEventListener('submit', () => setTimeout(() => { authAnim.height = card.offsetHeight; }, 600));
  // Save the height at the moment the user clicks the other tab
  card.querySelectorAll('.seg a').forEach((a) => a.addEventListener('click', () => { authAnim.height = card.offsetHeight; }));
}

function login() {
  $('#app').innerHTML = authShell('login', `
      <form id="f">
        <div class="field"><label for="identifier">Email or phone number</label>
          <input id="identifier" name="identifier" required autocomplete="username"></div>
        <div class="field"><label for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="current-password"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block auth-btn">Log in</button>
      </form>
      <p style="text-align:center;margin:14px 0 0"><a href="#/forgot">Forgot password?</a></p>`);
  animateAuth('login');
  bindForm('#f', async (data) => {
    await api('/auth/login', { body: data });
    await loadMe();
    const pending = sessionStorage.getItem('pendingCheckin');
    if (pending) {
      sessionStorage.removeItem('pendingCheckin');
      location.hash = `#/checkin?token=${pending}`;
    } else {
      location.hash = '#/';
    }
  });
}

function register() {
  $('#app').innerHTML = authShell('register', `
      <form id="f">
        <div class="field"><label for="username">Username</label>
          <input id="username" name="username" required minlength="3" maxlength="30" autocomplete="username"></div>
        <div class="field"><label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" required placeholder="+60 12 345 6789" autocomplete="tel"></div>
        <div class="field"><label for="password">Password (min 8 characters)</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block auth-btn">Sign up</button>
      </form>
      <p class="muted" style="margin:12px 0 0;text-align:center">We will email you a verification link.</p>`);
  animateAuth('register');
  bindForm('#f', async (data) => {
    const r = await api('/auth/register', { body: data });
    return r.message;
  });
}

function forgot() {
  $('#app').innerHTML = `
    <div class="form-card">
      <h1>Forgot password</h1>
      <form id="f">
        <div class="field"><label for="email">Your email</label>
          <input id="email" name="email" type="email" required></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block">Send reset link</button>
      </form>
      <p class="muted" style="margin-top:12px"><a href="#/login">Back to log in</a></p>
    </div>`;
  bindForm('#f', async (data) => (await api('/auth/forgot-password', { body: data })).message);
}

function reset(_id, params) {
  const token = params.get('token') || '';
  $('#app').innerHTML = `
    <div class="form-card">
      <h1>Set a new password</h1>
      <form id="f">
        <div class="field"><label for="password">New password (min 8 characters)</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block">Change password</button>
      </form>
    </div>`;
  bindForm('#f', async (data) => {
    const r = await api('/auth/reset-password', { body: { token, password: data.password } });
    setTimeout(() => (location.hash = '#/login'), 1500);
    return r.message;
  });
}

async function verify(_id, params) {
  const app = $('#app');
  app.innerHTML = '<p class="card">Verifying your email...</p>';
  try {
    const r = await api('/auth/verify', { body: { token: params.get('token') || '' } });
    app.innerHTML = `<div class="form-card"><p class="success">${esc(r.message)}</p><a href="#/login">Go to log in</a></div>`;
  } catch (err) {
    app.innerHTML = `<div class="form-card"><p class="error">${esc(err.message)}</p></div>`;
  }
}

// ---------- home and condo ----------
function home() {
  $('#app').innerHTML = `
    <section class="hero">
      <h1>Learn to swim at your condo</h1>
      <p>Pick your condo, choose a class, pay and start your journey.</p>
    </section>
    <form id="search" class="row" role="search">
      <input id="q" class="inline-input" type="search" placeholder="Search your condo..." aria-label="Search condo">
      <button type="submit">Search</button>
    </form>
    <div id="results" style="margin-top:12px"></div>`;
  const load = async (q) => {
    let condos;
    try {
      ({ condos } = await api(`/condos?q=${encodeURIComponent(q)}`));
    } catch (err) {
      $('#results').innerHTML = `<p class="error">Cannot load condos (${esc(err.message)}). Open the app at http://localhost:3001 and make sure the server and database are running.</p>`;
      return;
    }
    // Ignore an old answer if the user has typed something else since
    if (q !== ($('#q')?.value.trim() ?? '')) return;
    $('#results').innerHTML = condos.length
      ? condos.map((c) => `
          <a class="card" href="#/condo/${esc(c.id)}">
            ${c.image_url ? `<img src="${esc(c.image_url)}" alt="">` : ''}
            <h3>${esc(c.name)}</h3><div class="muted">${esc(c.address || '')}</div>
          </a>`).join('')
      : `<div class="card">
          <p class="muted">We could not find your condo.</p>
          <a href="#/new-condo?name=${encodeURIComponent(q)}"><button type="button">Add your condo and class</button></a>
        </div>`;
  };
  // Results update while typing (short delay)
  let searchTimer;
  const runSearch = () => load($('#q').value.trim());
  $('#q').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 200);
  });
  $('#search').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
  load('');
}

async function condo(id, params) {
  const type = params.get('type') || '';
  const { condo: c, classes, can_chat, min_size } = await api(`/condos/${encodeURIComponent(id)}${type ? `?type=${type}` : ''}`);
  state.minSize = min_size;
  $('#app').innerHTML = `
    <h1>${esc(c.name)}</h1>
    ${c.image_url ? `<img src="${esc(c.image_url)}" alt="" class="card" style="padding:0;max-height:260px;object-fit:cover;width:100%">` : ''}
    <p class="muted">${esc(c.address || '')}</p>
    <div class="row" style="margin:12px 0">
      <label for="type" style="margin:0">Class type</label>
      <select id="type" class="inline-input" style="max-width:220px">
        <option value="">All classes</option>
        <option value="one_to_one" ${type === 'one_to_one' ? 'selected' : ''}>Private One to One</option>
        <option value="group" ${type === 'group' ? 'selected' : ''}>Group</option>
      </select>
      <span class="spacer"></span>
      <a href="#/new-class/${esc(id)}"><button type="button">+ Add class</button></a>
    </div>
    ${classes.length ? classes.map((k) => classCard(k)).join('') : '<p class="muted">No classes running in this condo yet.</p>'}
    `;
  $('#type').onchange = (e) => {
    location.hash = `#/condo/${id}${e.target.value ? `?type=${e.target.value}` : ''}`;
  };
  if (can_chat) startChat(id);
}

// Chat state ('open' or 'min') is kept in this browser only. Default: open on desktop, minimized on mobile.
const CHAT_STATE_KEY = 'osa_chat_state';
const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
function getChatState() {
  try {
    const saved = localStorage.getItem(CHAT_STATE_KEY);
    if (saved === 'open' || saved === 'min') return saved;
  } catch (_) { /* storage blocked: use the default */ }
  return isMobile() ? 'min' : 'open';
}
function saveChatState(value) {
  try { localStorage.setItem(CHAT_STATE_KEY, value); } catch (_) { /* storage blocked: nothing to save */ }
}

// Condo chat: refreshes every 5 seconds (simple polling, no extra server needed)
function startChat(condoId) {
  // Floating widget: fixed on the right on desktop, a chat button bottom-right on mobile
  document.body.insertAdjacentHTML('beforeend', `
    <div class="chat-widget" id="chatWidget">
      <div class="chat-head">
        <div class="chat-avatar">🐙</div>
        <div class="spacer">
          <strong>Condo chat</strong>
          <div class="chat-sub">Messages are kept for <span id="retDays">…</span> days</div>
        </div>
        <button type="button" class="chat-icon" id="chatMin" aria-label="Minimize">—</button>
        <button type="button" class="chat-icon chat-close" id="chatClose" aria-label="Close">✕</button>
      </div>
      <div class="chat-list" id="chatList"></div>
      <p class="error chat-err" id="chatErr"></p>
      <form class="chat-input" id="chatForm">
        <input id="chatInput" maxlength="500" placeholder="Message" autocomplete="off">
        <button type="submit" class="chat-send" aria-label="Send">➤</button>
      </form>
    </div>
    <button type="button" class="chat-fab" id="chatFab" aria-label="Open chat">💬</button>`);

  const widget = $('#chatWidget');
  // Remember whether the user minimized (desktop) or closed (mobile) the chat
  const applyState = () => {
    const minimized = getChatState() === 'min';
    widget.classList.toggle('collapsed', !isMobile() && minimized);
    widget.classList.toggle('open', isMobile() && !minimized);
  };
  applyState();
  $('#chatFab').onclick = () => { saveChatState('open'); widget.classList.add('open'); };
  $('#chatClose').onclick = () => { saveChatState('min'); widget.classList.remove('open'); };
  $('#chatMin').onclick = () => {
    const nowCollapsed = widget.classList.toggle('collapsed');
    saveChatState(nowCollapsed ? 'min' : 'open');
  };

  const load = async () => {
    try {
      const { messages, retention_days } = await api(`/condos/${encodeURIComponent(condoId)}/chat`);
      const retEl = $('#retDays');
      if (retEl) retEl.textContent = retention_days;
      const list = $('#chatList');
      if (!list) return;
      const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60;
      const first = !list.dataset.ready;
      list.innerHTML = messages.length
        ? messages.map(chatItem).join('')
        : '<p class="chat-empty">No messages yet. Say hi 👋</p>';
      if (first || nearBottom) list.scrollTop = list.scrollHeight;
      list.dataset.ready = '1';
    } catch (err) {
      const e = $('#chatErr');
      if (e) e.textContent = err.message;
    }
  };

  $('#chatForm').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#chatInput');
    const text = input.value.trim();
    if (!text) return;
    try {
      await api(`/condos/${encodeURIComponent(condoId)}/chat`, { body: { body: text } });
      input.value = '';
      $('#chatErr').textContent = '';
      await load();
    } catch (err) {
      $('#chatErr').textContent = err.message;
    }
  };

  load();
  state.timers.push(setInterval(load, 5000));
}

// One message bubble. My messages go on the right (green), others on the left (white)
function chatItem(m) {
  const mine = state.user && m.user_id === state.user.id;
  const time = new Date(m.created_at).toLocaleTimeString('en-MY', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const badge = m.role === 'admin' ? '<span class="chat-tag">Academy</span>' : '';
  return `<div class="bubble ${mine ? 'mine' : 'theirs'}">
    <div class="who">${esc(m.username || 'Deleted user')} ${badge}</div>
    <div class="text">${esc(m.body)}</div>
    <div class="meta">${esc(time)}</div>
  </div>`;
}

// Group name from the class days, e.g. "Monday Group" or "Monday & Wednesday Group".
// Falls back to the stored name when the class has no upcoming sessions.
function groupName(times, fallback, classType) {
  const days = [];
  for (const t of times || []) {
    const day = new Date(t).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
    if (!days.includes(day)) days.push(day);
  }
  const kind = classType === 'one_to_one' ? 'Private One to One' : 'Group';
  return days.length ? `${days.join(' & ')} ${kind}` : fallback;
}

// Builds "Mon 1:00 PM · Sat 2:00 PM" from the upcoming session times (Malaysia time), one entry per weekday
function dayLabels(times) {
  const seen = new Map();
  for (const t of times || []) {
    const d = new Date(t);
    const day = d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
    if (!seen.has(day)) {
      seen.set(day, d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }));
    }
  }
  return [...seen].map(([day, time]) => `${day} ${time}`).join(' · ');
}

// Group classes show their state: red = still forming, orange = waiting for payment, green = confirmed
function statusBadge(k) {
  if (k.class_type !== 'group' || !k.status) return '';
  const min = state.minSize || 4;
  if (k.status === 'forming') return `<div><span class="badge full">In progress · ${k.enrolled}/${min} joined</span></div>`;
  if (k.status === 'payment') return '<div><span class="badge late">Waiting for payment</span></div>';
  return '<div><span class="badge ok">Confirmed</span></div>';
}

// "Will you attend?" buttons. Only shown on the next class of a card, and only when it is close (RSVP_WINDOW_MS).
const RSVP_WINDOW_MS = 3 * 24 * 3600 * 1000; // 3 days
function rsvpRow(s) {
  if (!s.session_id) return '';
  const now = Date.now();
  if (new Date(s.ends_at).getTime() <= now) return '';
  if (new Date(s.starts_at).getTime() - now > RSVP_WINDOW_MS) return '';
  const yes = s.rsvp_will_attend === true;
  const no = s.rsvp_will_attend === false;
  return `<div class="row" style="margin-top:6px">
    <span class="muted">Will you attend this class?</span>
    <button type="button" class="${yes ? '' : 'secondary'}" data-rsvp="1" data-session="${esc(s.session_id)}" data-enr="${esc(s.enrollment_id)}">Yes</button>
    <button type="button" class="${no ? 'danger' : 'secondary'}" data-rsvp="0" data-session="${esc(s.session_id)}" data-enr="${esc(s.enrollment_id)}">No</button>
  </div>
  ${no ? rsvpReason(s) : ''}`;
}

// After "No": a box for an optional reason. Once saved, the box and its button are replaced by the reason
// as text with an Edit link (or an "Add a reason" link when it was saved empty).
function rsvpReason(s) {
  const key = `${s.session_id}:${s.enrollment_id}`;
  const ids = `data-session="${esc(s.session_id)}" data-enr="${esc(s.enrollment_id)}"`;
  state.reasonEditing = state.reasonEditing || new Set();
  state.reasonDone = state.reasonDone || new Set();
  const editing = state.reasonEditing.has(key) || (!s.rsvp_reason && !state.reasonDone.has(key));
  if (!editing) {
    return `<p class="muted rsvp-reason-text" style="margin:6px 0 0">${s.rsvp_reason
      ? `Reason: ${esc(s.rsvp_reason)} · <a href="#" data-reason-edit ${ids}>Edit</a>`
      : `<a href="#" data-reason-edit ${ids}>Add a reason (optional)</a>`}</p>`;
  }
  return `
  <form class="row rsvp-reason" data-reason-form ${ids} style="margin-top:6px">
    <input name="reason" maxlength="300" placeholder="Reason (optional)" aria-label="Reason for not attending (optional)" value="${esc(s.rsvp_reason || '')}" style="flex:1;min-width:0">
    <button type="submit" class="secondary">Save reason</button>
  </form>`;
}

// Coach view: how many will attend, how many will not, how many have not answered
function rsvpSummary(yes, no, enrolled) {
  const none = Math.max(0, enrolled - yes - no);
  return `<span class="badge ok">${yes} will attend</span><span class="badge full">${no} will not attend</span><span class="badge">${none} no reply</span>`;
}

function classCard(k) {
  const full = k.enrolled >= k.capacity;
  return `
    <div class="card">
      <div class="row"><h3 class="spacer" style="margin:0">${esc(groupName(k.upcoming_times, k.name, k.class_type))}</h3>
        ${full ? '<span class="badge full">FULL</span>' : `<span class="badge ok">${k.capacity - k.enrolled} ${k.capacity - k.enrolled === 1 ? 'seat' : 'seats'} left</span>`}</div>
      ${statusBadge(k)}
      <div class="muted">Coach: ${esc(k.coach_name || 'To be assigned')} · ${k.class_type === 'one_to_one' ? 'Private One to One' : 'Group'} · ${k.duration_min} min</div>
      <div><span class="badge">${esc(k.skill_level)}</span><span class="badge">Age ${k.min_age}–${k.max_age}</span>${k.classes_per_month ? `<span class="badge">${k.classes_per_month === 8 ? 'Twice a week' : 'Once a week'} · ${k.classes_per_month} classes/month</span>` : ''}</div>
      ${k.schedule_text ? `<div class="muted">Schedule: ${esc(k.schedule_text)}</div>` : ''}
      <div class="muted">Class days: ${esc(dayLabels(k.upcoming_times)) || 'No upcoming sessions'}</div>
      ${k.prices
        // A private class is for 1 person; a group class is charged at the 4-person price (see pricing.js)
        ? `<div class="muted">Package price: <strong>${rm(k.class_type === 'one_to_one' ? k.prices['1'] : k.prices['4-6'])}</strong> per person${k.class_type === 'one_to_one' ? ' (private)' : ''}</div>`
        : `<div><span class="badge">${rm(k.price_cents)} per person</span></div>`}
      <div class="muted">Next class: ${k.next_session_at ? esc(fmtTime(k.next_session_at)) + ' (Malaysia time)' : 'No session scheduled'}</div>
      <div class="row" style="margin-top:8px">
        ${full ? '<button disabled>Class full</button>' : `<a href="#/join/${esc(k.id)}"><button type="button">Join class</button></a>`}
      </div>
    </div>`;
}

// ---------- package price box on the add-class forms ----------
const DAY_FULL = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const isWeekendCode = (c) => c === 'sat' || c === 'sun';
// Shows the price per person for the chosen days and times per week, and whether it is weekdays or weekends.
async function wirePriceBox(formSel) {
  const form = $(formSel);
  if (!form) return;
  if (!state.plans) {
    try {
      state.plans = (await api('/price-plans')).plans;
    } catch (_) {
      state.plans = {};
    }
  }
  const render = () => {
    const box = form.querySelector('#priceBox');
    if (!box) return;
    const perWeek = Number(form.per_week.value);
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map((i) => i.value);
    const head = '<strong>Package price per person</strong>';
    if (days.length !== perWeek) {
      box.innerHTML = `${head}<p class="muted">Choose ${perWeek} day${perWeek > 1 ? 's' : ''} to see the price.</p>`;
      return;
    }
    const perMonth = perWeek === 2 ? 8 : 4;
    const freq = `${perWeek === 2 ? 'Twice' : 'Once'} a week · ${perMonth} classes a month`;
    const tiers = [['1', '1 person'], ['2', '2 people'], ['3', '3 people'], ['4-6', '4–6 people']];
    const weekdayPlan = state.plans[`weekdays-${perMonth}`] || {};
    const weekendPlan = state.plans[`weekends-${perMonth}`] || {};
    // Each chosen day is tagged Weekday or Weekend, so the difference is visible
    const dayTags = days
      .map((d) => `<span class="badge ${isWeekendCode(d) ? 'late' : ''}">${DAY_FULL[d]} · ${isWeekendCode(d) ? 'Weekend' : 'Weekday'}</span>`)
      .join(' ');
    const mixed = days.some(isWeekendCode) && !days.every(isWeekendCode) && days.some((d) => !isWeekendCode(d));

    let priceHtml;
    if (mixed) {
      // Mixed days: price is the average of the weekday and weekend packages, shown next to both
      const average = (t) => Math.round(((weekdayPlan[t] || 0) + (weekendPlan[t] || 0)) / 2);
      priceHtml = `
        <p class="muted" style="margin:8px 0 4px">Mixed package (weekday + weekend days). Your price is the average of both.</p>
        <div class="pt-row pt-head"><span></span><span>Weekday</span><span>Weekend</span><span>You pay</span></div>
        ${tiers.map(([t, text]) => `<div class="pt-row"><span class="muted">${text}</span><span>${rm(weekdayPlan[t])}</span><span>${rm(weekendPlan[t])}</span><strong>${rm(average(t))}</strong></div>`).join('')}`;
    } else {
      const weekend = days.every(isWeekendCode);
      const plan = weekend ? weekendPlan : weekdayPlan;
      const label = weekend ? 'Weekends (Sat–Sun)' : 'Weekdays (Mon–Fri)';
      priceHtml = `
        <div class="muted">${label} · ${freq}</div>
        ${Object.keys(plan).length
          ? `<div class="price-grid">${tiers.map(([t, text]) => `<div><span class="muted">${text}</span><strong>${rm(plan[t])}</strong></div>`).join('')}</div>`
          : '<p class="muted">Price not set yet.</p>'}`;
    }
    box.innerHTML = `${head}<div style="margin:6px 0">${dayTags}</div>${priceHtml}`;
  };
  form.addEventListener('change', render);
  render();
}

// ---------- student adds a condo that is not in the app, with a class ----------
function newCondo(_id, params) {
  const name = params.get('name') || '';
  const days = [['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday']];
  $('#app').innerHTML = `
    <h1>Add your condo and class</h1>
    <p class="muted">Tell us your condo and the class you want. The academy will review it, and your condo will appear in the app once it is approved.</p>
    <form id="fCondoNew" class="form-card" style="max-width:560px;margin-left:0">      <div class="field"><label for="cName">Condo name</label>
        <input id="cName" name="condo_name" required minlength="2" maxlength="120" value="${esc(name)}"></div>
      <div class="field"><label for="perWeek2">How many times a week?</label>
        <select id="perWeek2" name="per_week"><option value="1">Once a week</option><option value="2">Twice a week</option></select></div>
      <div class="field"><label>Days (pick one day for once a week, or two for twice a week)</label>
        ${days.map(([code, label]) => `<label style="display:flex;gap:8px;align-items:center;color:inherit;margin:4px 0"><input type="checkbox" name="days" value="${code}" style="width:auto"> ${label} <span class="muted">${isWeekendCode(code) ? '· Weekend' : '· Weekday'}</span></label>`).join('')}
      </div>
      <div class="field"><label for="time2">Start time (Malaysia time)</label>
        <input id="time2" name="start_time" type="time" required></div>
      <div class="field"><label for="level2">Swimming level</label><select id="level2" name="skill_level">${levelOptions()}</select></div>
      <div class="field"><label for="people2">How many people?</label>
        <select id="people2" name="people">
          <option value="1">Private (1 person)</option><option value="2">2 people</option><option value="3">3 people</option><option value="4">4 people</option><option value="5">5 or more</option>
        </select></div>
      <div class="field"><label for="unitNo2">Unit number (for coach registration at the condo gate as visitors)</label>
        <input id="unitNo2" name="unit_number" required maxlength="20"></div>
      <div id="priceBox" class="card price-box"></div>
      <p data-msg class="error"></p>
      <button type="submit" class="block">Send request</button>
      <p class="muted" style="margin-top:12px"><a href="#/">Back to home</a></p>
    </form>`;
  wirePriceBox('#fCondoNew');
  bindForm('#fCondoNew', async (data, form) => {
    const selectedDays = [...form.querySelectorAll('input[name="days"]:checked')].map((i) => i.value);
    const res = await api('/condo-proposals', {
      body: {
        condo_name: data.condo_name,
        per_week: Number(data.per_week),
        unit_number: data.unit_number,
        days: selectedDays,
        start_time: data.start_time,
        skill_level: data.skill_level,
        people: Number(data.people),
      },
    });
    showDialog(res.message, () => (location.hash = '#/'));
  });
}

// ---------- student proposes a new class ----------
function newClass(condoId) {
  const days = [['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday']];
  $('#app').innerHTML = `
    <h1>Add a class</h1>
    <p class="muted">Tell us what works for you. The academy will review it, and the class will appear on this condo page once it is approved.</p>
    <form id="fNew" class="form-card" style="max-width:560px;margin-left:0">      <div class="field"><label for="perWeek">How many times a week?</label>
        <select id="perWeek" name="per_week"><option value="1">Once a week</option><option value="2">Twice a week</option></select></div>
      <div class="field"><label>Days (pick one day for once a week, or two for twice a week)</label>
        ${days.map(([code, label]) => `<label style="display:flex;gap:8px;align-items:center;color:inherit;margin:4px 0"><input type="checkbox" name="days" value="${code}" style="width:auto"> ${label} <span class="muted">${isWeekendCode(code) ? '· Weekend' : '· Weekday'}</span></label>`).join('')}
      </div>
      <div class="field"><label for="startTime">Start time (Malaysia time)</label>
        <input id="startTime" name="start_time" type="time" required></div>
      <div class="field"><label for="level">Swimming level</label><select id="level" name="skill_level">${levelOptions()}</select></div>
      <div class="field"><label for="people">How many people?</label>
        <select id="people" name="people">
          <option value="1">Private (1 person)</option><option value="2">2 people</option><option value="3">3 people</option><option value="4">4 people</option><option value="5">5 or more</option>
        </select></div>
      <div class="field"><label for="unitNo">Unit number (for coach registration at the condo gate as visitors)</label>
        <input id="unitNo" name="unit_number" required maxlength="20"></div>
      <div id="priceBox" class="card price-box"></div>
      <p data-msg class="error"></p>
      <button type="submit" class="block">Send request</button>
      <p class="muted" style="margin-top:12px"><a href="#/condo/${esc(condoId)}">Back to condo</a></p>
    </form>`;
  wirePriceBox('#fNew');
  bindForm('#fNew', async (data, form) => {
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map((i) => i.value);
    const res = await api(`/condos/${encodeURIComponent(condoId)}/class-proposals`, {
      body: { per_week: Number(data.per_week), unit_number: data.unit_number, days, start_time: data.start_time, skill_level: data.skill_level, people: Number(data.people) },
    });
    showDialog(res.message, () => (location.hash = `#/condo/${condoId}`));
  });
}

// ---------- joining a class ----------
async function join(classId, params = new URLSearchParams()) {
  const invite = params.get('invite') || null; // set when the person came through a friend's invite link
  const { members } = await api('/me/family');
  const memberOptions = members.map((m) => `<option value="${esc(m.id)}">${esc(m.full_name)} (${m.age}, ${esc(m.skill_level)})</option>`).join('');
  const row = (i) => `
    <div class="participant" data-i="${i}">
      <div class="row"><strong class="spacer">Person ${i + 1}</strong></div>
      ${members.length ? `<div class="field"><label for="p${i}-member">From family</label><select id="p${i}-member" data-field="member"><option value="">— type manually —</option>${memberOptions}</select></div>` : ''}
      <div class="field"><label for="p${i}-name">Name</label><input id="p${i}-name" name="p${i}-name" type="text" data-field="name" required maxlength="80"></div>
      <div class="row">
        <div class="field spacer"><label for="p${i}-dob">Date of birth</label><input id="p${i}-dob" name="p${i}-dob" data-field="dob" type="date" max="${todayISO()}" required></div>
        <div class="field spacer"><label for="p${i}-skill">Swimming level</label><select id="p${i}-skill" name="p${i}-skill" data-field="skill">${levelOptions()}</select></div>
      </div>
    </div>`;

  $('#app').innerHTML = `
    <h1>Join class</h1>
    <div class="form-card" style="max-width:640px;margin-left:0">
      <div class="row"><label for="count" style="margin:0">How many people are joining?</label>
        <select id="count" class="inline-input" style="max-width:120px">${[...Array(10)].map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
      <div class="field" style="margin-top:12px"><label for="unit">Unit number (for coach registration at the condo gate as visitors)</label>
        <input id="unit" maxlength="20" required></div>
      <div id="people" style="margin-top:12px"></div>
      <button id="check" type="button">Check eligibility</button>
      <div id="result" style="margin-top:14px"></div>
    </div>`;

  const people = $('#people');
  const drawPeople = () => {
    const n = Number($('#count').value);
    people.innerHTML = [...Array(n)].map((_, i) => row(i)).join('');
    people.querySelectorAll('[data-field="member"]').forEach((sel) => sel.addEventListener('change', (e) => {
      const m = members.find((x) => x.id === e.target.value);
      if (!m) return;
      const box = e.target.closest('.participant');
      box.querySelector('[data-field="name"]').value = m.full_name;
      box.querySelector('[data-field="dob"]').value = m.date_of_birth || '';
      box.querySelector('[data-field="skill"]').value = m.skill_level;
    }));
  };
  $('#count').onchange = drawPeople;
  drawPeople();

  const collect = () => [...people.querySelectorAll('.participant')].map((box) => {
    const get = (f) => box.querySelector(`[data-field="${f}"]`);
    const member = get('member')?.value;
    return {
      name: get('name').value.trim(),
      date_of_birth: get('dob').value,
      skill_level: get('skill').value,
      ...(member ? { family_member_id: member } : {}),
    };
  });

  $('#check').onclick = async () => {
    const unit = $('#unit').value.trim();
    if (!unit) return toast('Please enter your unit number');
    const participants = collect();
    const out = $('#result');
    out.textContent = 'Checking...';
    try {
      const r = await api(`/classes/${classId}/eligibility`, { body: { participants } });
      if (r.full) {
        out.innerHTML = r.seats_left > 0
          ? `<p class="error">Only ${r.seats_left} seat${r.seats_left === 1 ? '' : 's'} left in this class. Choose fewer people.</p>`
          : '<p class="error">Sorry, this class is full.</p>';
        return;
      }
      const list = r.participants.map((p) => `<li>${esc(p.name)}: ${p.eligible
        ? '<span class="badge ok">Eligible</span>'
        : `<span class="badge full">Not eligible</span> ${esc(p.reason)}`}</li>`).join('');
      if (r.eligible) {
        out.innerHTML = `
          <ul>${list}</ul>
          <p>Total: <strong>${rm(r.price_cents)}</strong> (${rm(r.price_per_person_cents)} per person)</p>
          <button id="pay" type="button">Pay and join</button>
          <p class="muted">Payment is processed securely.</p>
          <p data-msg class="error"></p>`;
        $('#pay').onclick = () => enroll(classId, participants, unit, invite);
      } else {
        out.innerHTML = `
          <ul>${list}</ul>
          <p>You are not eligible for this class. Create a class for your group instead:</p>
          <form id="req">
            <div class="field"><label for="days">How often?</label>
              <select id="days" name="days"><option value="once_a_week">Once a week</option><option value="twice_a_week">Twice a week</option></select></div>
            <button type="submit">Create class</button>
            <p data-msg class="error"></p>
          </form>`;
        const condoId = r.condo_id;
        bindForm('#req', async (form) => {
          const res = await api('/class-requests', { body: { condo_id: condoId, participants, unit_number: unit, days: form.days } });
          showDialog(res.message, () => (location.hash = `#/condo/${condoId}`));
        });
      }
    } catch (err) {
      out.innerHTML = `<p class="error">${esc(err.message)}</p>`;
    }
  };
}

// The invite code is kept in this browser until the person logs in (localStorage survives the email verification step)
const PENDING_INVITE_KEY = 'osa_pending_invite';
function pendingInviteGet() {
  try { return localStorage.getItem(PENDING_INVITE_KEY); } catch (_) { return null; }
}
function pendingInviteSet(code) {
  try {
    if (code) localStorage.setItem(PENDING_INVITE_KEY, code);
    else localStorage.removeItem(PENDING_INVITE_KEY);
  } catch (_) { /* private mode: the link just has to be opened again after login */ }
}

// Friend's invite landing page: shows the class and whether this account can accept it
async function invite(code) {
  if (!state.user) {
    pendingInviteSet(code);
    $('#app').innerHTML = `
      <h1>You are invited</h1>
      <div class="card">
        <p>A friend invited you to a swimming class at Octopus Sports Academy.</p>
        <p class="muted">Create an account or log in first. After you log in, this invite opens again by itself.</p>
        <div class="row">
          <a href="#/register"><button type="button">Create account</button></a>
          <a href="#/login"><button type="button" class="secondary">I have an account</button></a>
        </div>
      </div>`;
    return;
  }
  pendingInviteSet(null);
  let info;
  try {
    info = await api(`/invites/${encodeURIComponent(code)}`);
  } catch (err) {
    $('#app').innerHTML = `<h1>Invite</h1><p class="error">${esc(err.message)}</p>`;
    return;
  }
  $('#app').innerHTML = `
    <h1>You are invited</h1>
    <div class="card">
      <h3>${esc(info.class_name)}</h3>
      <div class="muted">${esc(info.condo_name)} · invited by ${esc(info.inviter_name)}</div>
      <div style="margin:6px 0"><span class="badge">${esc(info.skill_level)}</span><span class="badge">Age ${info.min_age}–${info.max_age}</span><span class="badge">${info.seats_left} seats left</span></div>
      <p>Price per person: <strong>${rm(info.price_per_person_cents)}</strong></p>
      ${info.can_accept
        ? `<a href="#/join/${esc(info.class_id)}?invite=${esc(code)}"><button type="button" class="block">Join this class</button></a>`
        : `<p class="error">${esc(info.reason)}</p>`}
    </div>`;
}

async function enroll(classId, participants, unit, invite = null) {
  try {
    const r = await api(`/classes/${classId}/enroll`, { body: { participants, unit_number: unit, ...(invite ? { invite } : {}) } });
    toast(r.message);
    location.hash = '#/me';
  } catch (err) {
    const msg = document.querySelector('[data-msg]');
    if (msg) msg.textContent = err.message;
  }
}

// ---------- profile ----------
async function me() {
  clearTimers();
  // Coaches get their class panel on the profile page instead of the student view
  if (state.user?.role === 'coach') return coach();
  const [{ user }, { members }, { sessions }] = await Promise.all([api('/me'), api('/me/family'), api('/me/classes')]);
  // A class is complete but this participant has not paid yet: one notice per enrolment
  const unpaid = [...new Map(
    sessions.filter((s) => s.class_status === 'payment' && !s.paid).map((s) => [s.enrollment_id, s])
  ).values()];
  const payNotice = unpaid.length
    ? `<div class="pay-notice">${unpaid.map((s) => `<p><strong>${esc(s.class_name)}</strong>: the class is complete. Please pay to start the first class.</p>`).join('')}</div>`
    : '';
  $('#app').innerHTML = `
    <h1>Hi, ${esc(user.username)}</h1>
    ${payNotice}

    <h2>My classes</h2>
    <div id="classes"></div>
    <h2>Friends I invited</h2>
    <div id="referrals"></div>

    <h2>Family members</h2>
    <p class="muted">Manage everyone who joins under your email.</p>
    <div id="family"></div>
    <form id="addFamily" class="card">
      <div class="row">
        <input name="full_name" class="inline-input" placeholder="Full name" required maxlength="80">
        <input name="date_of_birth" class="inline-input" type="date" max="${todayISO()}" required style="max-width:170px">
        <select name="skill_level" class="inline-input" style="max-width:200px">${levelOptions()}</select>
      </div>
      <p data-msg class="error"></p>
      <button type="submit">Add family member</button>
    </form>`;

  $('#family').innerHTML = members.length
    ? members.map((m) => `
        <div class="card row">
          <span class="spacer">${esc(m.full_name)} · ${m.age} · ${esc(m.skill_level)}</span>
          <button class="danger" data-remove="${esc(m.id)}" type="button">Remove</button>
        </div>`).join('')
    : '<p class="muted">No family members yet.</p>';
  document.querySelectorAll('[data-remove]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Remove this family member?')) return;
    await api(`/me/family/${b.dataset.remove}`, { method: 'DELETE' });
    me();
  }));
  bindForm('#addFamily', async (data) => {
    await api('/me/family', { body: data });
    setTimeout(me, 300);
    return 'Family member added';
  });

  renderMySessions(sessions);
  loadReferrals();
  // Countdown ticks every second; the list is re-fetched every 30 s so the check-in button appears on time
  const tick = setInterval(() => updateCountdowns(), 1000);
  const refresh = setInterval(async () => {
    const { sessions: s } = await api('/me/classes').catch(() => ({ sessions: [] }));
    renderMySessions(s);
  }, 30000);
  state.timers.push(tick, refresh);
}

// Friends who joined with my invite link, and the free months earned from them
async function loadReferrals() {
  const box = $('#referrals');
  if (!box) return;
  try {
    const { invited, free_months: freeMonths } = await api('/me/referrals');
    box.innerHTML = `
      <div class="card">
        <strong>Free months earned: ${freeMonths}</strong>
        <p class="muted" style="margin:4px 0 0">You get one free month for each class that is confirmed only because of the friends you invited. It is one month per class, not per person.</p>
        ${invited.length ? `<ul style="margin:8px 0 0">${invited.map((r) => `<li>${esc(r.participant_name)} · ${esc(r.class_name)} · ${r.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge late">Not paid yet</span>'}</li>`).join('')}</ul>`
          : '<p class="muted" style="margin-bottom:0">No friends have joined with your link yet.</p>'}
      </div>`;
  } catch (err) {
    box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
  }
}

// One card per enrolled class. The card shows the next session (countdown / scan button).
// Clicking the card header expands the full list of dates.
function renderMySessions(sessions) {
  const box = $('#classes');
  if (!box) return;
  state.lastSessions = sessions; // kept so the reason "Edit" link can redraw without reloading
  if (!sessions.length) {
    box.innerHTML = '<p class="muted">You have no classes yet. Find your condo on the home page.</p>';
    return;
  }
  state.expanded = state.expanded || new Set();
  const groups = new Map();
  for (const s of sessions) {
    if (!groups.has(s.enrollment_id)) groups.set(s.enrollment_id, []);
    groups.get(s.enrollment_id).push(s);
  }
  const now = Date.now();
  box.innerHTML = [...groups.entries()].map(([enrId, list]) => {
    list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const next = list.find((s) => new Date(s.ends_at).getTime() > now) || list[list.length - 1];
    const open = state.expanded.has(enrId);
    return `
    <div class="card class-card" data-start="${esc(next.starts_at)}" data-end="${esc(next.ends_at)}">
      <div class="class-head" data-toggle="${esc(enrId)}" role="button" tabindex="0" aria-expanded="${open}">
        <div class="row"><strong class="spacer">${esc(next.class_name)}</strong><span class="muted">${open ? '▲' : '▼'}</span></div>
        <div class="muted">${esc(next.participant_name)} · ${esc(next.condo_name)} · Coach ${esc(next.coach_name || 'TBA')}</div>
        <div class="muted">Next class: ${esc(fmtTime(next.starts_at))} (Malaysia time)</div>
      </div>
      <div class="countdown-slot" style="margin-top:6px"></div>
      ${rsvpRow(next)}
      ${next.class_type === 'group' && next.enrollment_id ? `
        <div class="row" style="margin-top:8px">
          <button type="button" class="secondary" data-invite="${esc(next.enrollment_id)}">Invite a friend</button>
          <div class="invite-slot" style="width:100%"></div>
        </div>` : ''}
      ${open ? `<div class="all-dates">${list.map(sessionRow).join('')}</div>` : ''}
    </div>`;
  }).join('');

  box.querySelectorAll('[data-invite]').forEach((b) => (b.onclick = async () => {
    const slot = b.parentElement.querySelector('.invite-slot');
    try {
      const { link } = await api(`/me/enrollments/${b.dataset.invite}/invite`, { method: 'POST', body: {} });
      slot.innerHTML = `
        <div class="row" style="width:100%">
          <input readonly value="${esc(link)}" class="inline-input" onclick="this.select()">
          <button type="button" class="secondary" data-copy>Copy link</button>
        </div>
        <p class="muted" style="margin:4px 0 0">Send this link to a friend who is new to the academy. They can join the class with it.</p>`;
      slot.querySelector('[data-copy]').onclick = async () => {
        try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch (_) { toast('Copy the link from the box'); }
      };
    } catch (err) {
      toast(err.message);
    }
  }));

  box.querySelectorAll('[data-rsvp]').forEach((b) => (b.onclick = async () => {
    // A new Yes/No answer starts the reason part fresh (No shows the box again unless a reason is saved)
    const key = `${b.dataset.session}:${b.dataset.enr}`;
    state.reasonEditing && state.reasonEditing.delete(key);
    state.reasonDone && state.reasonDone.delete(key);
    try {
      await api(`/me/sessions/${b.dataset.session}/rsvp/${b.dataset.enr}`, {
        method: 'PUT',
        body: { will_attend: b.dataset.rsvp === '1' },
      });
      const { sessions: fresh } = await api('/me/classes');
      renderMySessions(fresh);
      toast(b.dataset.rsvp === '1' ? 'Saved' : 'Saved. You can add a reason (optional).');
      // After "No", put the cursor in the optional reason box
      if (b.dataset.rsvp === '0') {
        const f = document.querySelector(`[data-reason-form][data-enr="${CSS.escape(b.dataset.enr)}"] input`);
        if (f) f.focus();
      }
    } catch (err) {
      toast(err.message);
    }
  }));

  // Optional reason for "No"
  box.querySelectorAll('[data-reason-form]').forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button');
    btn.disabled = true;
    try {
      const res = await api(`/me/sessions/${f.dataset.session}/rsvp/${f.dataset.enr}`, {
        method: 'PUT',
        body: { will_attend: false, reason: f.reason.value },
      });
      toast(f.reason.value.trim() ? res.message : 'Reason removed');
      // Saved: hide the box and the button, show the reason as text
      const key = `${f.dataset.session}:${f.dataset.enr}`;
      state.reasonEditing.delete(key);
      state.reasonDone.add(key);
      const { sessions: fresh } = await api('/me/classes');
      renderMySessions(fresh);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  }));

  // "Edit" / "Add a reason" brings the box back
  box.querySelectorAll('[data-reason-edit]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const key = `${a.dataset.session}:${a.dataset.enr}`;
    state.reasonEditing.add(key);
    renderMySessions(state.lastSessions || []);
    const input = document.querySelector(`[data-reason-form][data-enr="${CSS.escape(a.dataset.enr)}"] input`);
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }));

  box.querySelectorAll('[data-toggle]').forEach((h) => {
    const toggle = () => {
      const id = h.dataset.toggle;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      renderMySessions(sessions);
    };
    h.onclick = toggle;
    h.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    };
  });
  updateCountdowns();
}

// One date line inside an expanded class card
function sessionRow(s) {
  const badge = s.attendance_status
    ? `<span class="badge ${s.attendance_status === 'late' ? 'late' : 'ok'}">${esc(s.attendance_status.replace('_', ' '))}</span>`
    : '';
  const rating = s.rating_stars
    ? `<div class="muted">Coach rating: ${'★'.repeat(s.rating_stars)}${'☆'.repeat(5 - s.rating_stars)}${s.rating_reason ? ` — ${esc(s.rating_reason)}` : ''}</div>`
    : '';
  return `<div class="session-row">
    <div class="row"><span class="spacer">${esc(fmtTime(s.starts_at))}</span>${badge}</div>
    ${rating}
  </div>`;
}

// Before the window: countdown. From 30 min before the start until the end: scan button. After: status.
function updateCountdowns() {
  const now = Date.now();
  document.querySelectorAll('[data-start]').forEach((card) => {
    const start = new Date(card.dataset.start).getTime();
    const end = new Date(card.dataset.end).getTime();
    const slot = card.querySelector('.countdown-slot');
    const windowOpen = start - 30 * 60000;
    if (now < windowOpen) {
      slot.innerHTML = `Starts in <span class="countdown">${formatRemaining(start - now)}</span>`;
    } else if (now <= end) {
      slot.innerHTML = `<a href="#/checkin"><button type="button">Scan coach QR code</button></a>`;
    } else {
      slot.innerHTML = '<span class="muted">Class finished</span>';
    }
  });
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return d ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ---------- check-in (student scans the coach QR) ----------
async function checkin(_id, params) {
  const app = $('#app');
  const token = params.get('token') || sessionStorage.getItem('pendingCheckin');
  app.innerHTML = `
    <h1>Check in</h1>
    <div class="card" id="status">${token ? 'Checking you in...' : 'Scan the QR code shown by your coach.'}</div>
    ${token ? '' : `
      <div class="card">
        <button type="button" id="cam" class="block">Open camera to scan</button>
        <video id="video" hidden playsinline muted></video>
        <p class="muted" id="camNote"></p>
        <label for="manual" style="margin-top:12px">Coach not available? Paste the QR link or code</label>
        <div class="row"><input id="manual" class="inline-input" placeholder="Paste link or code"><button type="button" id="manualGo">Check in</button></div>
      </div>`}`;
  if (token) return submitCheckin(token);

  $('#manualGo').onclick = () => {
    const v = $('#manual').value.trim();
    const m = v.match(/token=([a-f0-9]{32})/i) || v.match(/^([a-f0-9]{32})$/i);
    if (!m) return toast('That does not look like a valid code');
    submitCheckin(m[1]);
  };

  $('#cam').onclick = async () => {
    const note = $('#camNote');
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
      note.textContent = 'Camera scanning is not supported in this browser. Use the paste option or ask your coach for manual check-in.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = $('#video');
      video.hidden = false;
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const stop = () => { stream.getTracks().forEach((t) => t.stop()); if (state.scanner) clearInterval(state.scanner.id); state.scanner = null; };
      state.scanner = { stop, id: setInterval(async () => {
        const codes = await detector.detect(video).catch(() => []);
        const hit = codes.find((c) => /token=[a-f0-9]{32}/i.test(c.rawValue));
        if (hit) {
          stop();
          submitCheckin(hit.rawValue.match(/token=([a-f0-9]{32})/i)[1]);
        }
      }, 400) };
    } catch (err) {
      note.textContent = 'Could not open the camera: ' + err.message;
    }
  };
}

async function submitCheckin(token) {
  sessionStorage.removeItem('pendingCheckin');
  const status = $('#status');
  try {
    const r = await api('/attendance/checkin', { body: { token } });
    status.innerHTML = `<p class="success">${esc(r.message)}</p><p>${esc(r.participants.join(', '))}</p>`;
  } catch (err) {
    status.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

// ---------- coach panel ----------
async function coach() {
  clearTimers();
  const { sessions } = await api('/coach/sessions');
  $('#app').innerHTML = `
    <h1>${state.user.role === 'coach' ? `Hi, ${esc(state.user.username)}` : 'Coach panel'}</h1>
    <h2>My classes</h2>
    <div class="card" id="nextClass"></div>
    <div id="sessionList"></div>
    <div id="panel"></div>`;

  // One card per class, showing its next date. "All dates" expands the rest of that class's dates.
  // Only the first class is shown at first; the button shows the other classes.
  const now = Date.now();
  const groups = new Map();
  for (const s of sessions) {
    if (!groups.has(s.class_id)) groups.set(s.class_id, []);
    groups.get(s.class_id).push(s);
  }
  const classes = [...groups.values()]
    .map((list) => ({
      list,
      next: list.find((s) => new Date(s.ends_at).getTime() > now) || list[list.length - 1],
    }))
    .sort((a, b) => new Date(a.next.starts_at) - new Date(b.next.starts_at));

  let showAll = false;
  const expanded = new Set();
  const dateButtons = (s) => `<button type="button" class="secondary" data-qr="${esc(s.id)}">Show QR</button>
        <button type="button" data-roster="${esc(s.id)}">Attendance & ratings</button>`;

  const drawSessions = () => {
    const box = $('#sessionList');
    if (!classes.length) {
      box.innerHTML = '<p class="muted">No sessions yet. The academy admin adds them.</p>';
      return;
    }
    const shown = showAll ? classes : [classes[0]];
    const hidden = classes.length - shown.length;
    box.innerHTML = shown.map(({ list, next }) => {
      const id = next.class_id;
      const open = expanded.has(id);
      return `
      <div class="card">
        <div class="row">
          <div class="spacer"><strong>${esc(next.class_name)}</strong><div class="muted">${esc(next.condo_name)} · Next: ${esc(fmtTime(next.starts_at))} · ${next.enrolled} enrolled</div>
          <div style="margin-top:4px">${rsvpSummary(next.will_attend || 0, next.will_not_attend || 0, next.enrolled)}</div></div>
          ${dateButtons(next)}
        </div>
        <button type="button" class="secondary block" data-expand="${esc(id)}" style="margin-top:8px">${open ? 'Hide dates' : `All dates (${list.length})`}</button>
        ${open ? list.map((s) => `<div class="session-row row"><span class="spacer">${esc(fmtTime(s.starts_at))}</span>${dateButtons(s)}</div>`).join('') : ''}
      </div>`;
    }).join('')
      + (classes.length > 1
        ? `<button type="button" class="secondary block" id="toggleSessions">${showAll ? 'Show less' : `Show ${hidden} more class${hidden === 1 ? '' : 'es'}`}</button>`
        : '');
    box.querySelectorAll('[data-qr]').forEach((b) => (b.onclick = () => showQr(b.dataset.qr)));
    box.querySelectorAll('[data-roster]').forEach((b) => (b.onclick = () => showRoster(b.dataset.roster)));
    box.querySelectorAll('[data-expand]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.expand;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      drawSessions();
    }));
    const toggle = $('#toggleSessions');
    if (toggle) toggle.onclick = () => { showAll = !showAll; drawSessions(); };
  };
  drawSessions();

  renderNextClass(sessions);
  state.timers.push(setInterval(() => renderNextClass(sessions), 1000));
}

// Countdown to the first class that has not ended yet (or "in progress" while it runs)
function renderNextClass(sessions) {
  const box = $('#nextClass');
  if (!box) return;
  const now = Date.now();
  const next = sessions.find((s) => new Date(s.ends_at).getTime() > now);
  if (!next) {
    box.innerHTML = '<p class="muted">No upcoming classes.</p>';
    return;
  }
  const start = new Date(next.starts_at).getTime();
  box.innerHTML = now < start
    ? `<div class="muted">Next class: ${esc(next.class_name)} · ${esc(next.condo_name)}</div>
       <div class="muted">${esc(fmtTime(next.starts_at))} (Malaysia time)</div>
       <div style="font-size:28px;margin-top:6px">Starts in <span class="countdown">${formatRemaining(start - now)}</span></div>`
    : `<div class="muted">In progress: ${esc(next.class_name)} · ${esc(next.condo_name)}</div>
       <div class="badge ok">Class is running</div>`;
}

async function showQr(sessionId) {
  const panel = $('#panel');
  panel.innerHTML = '<p class="card">Generating QR...</p>';
  try {
    const r = await api(`/coach/sessions/${sessionId}/qr`, { body: {} });
    panel.innerHTML = `
      <div class="card" style="text-align:center">
        <h3>Scan to check in</h3>
        <img class="qr-img" src="${r.qr_image}" alt="Check-in QR code">
        <p class="muted">${esc(r.class_name)}: students scan this one code for any session of the class.</p>
      </div>`;
  } catch (err) {
    panel.innerHTML = `<p class="card error">${esc(err.message)}</p>`;
  }
}

async function showRoster(sessionId) {
  const panel = $('#panel');
  const { session, roster } = await api(`/coach/sessions/${sessionId}/roster`);
  panel.innerHTML = `
    <h2>${esc(session.class_name)} · ${esc(fmtTime(session.starts_at))}</h2>
    <p>${rsvpSummary(roster.filter((r) => r.will_attend === true).length, roster.filter((r) => r.will_attend === false).length, roster.length)}</p>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Student</th><th>Will attend</th><th>Checked in at</th><th>Attendance</th><th>Stars</th><th>Reason (below 3 stars)</th></tr></thead>
        <tbody>${roster.map((r) => `
          <tr data-enr="${esc(r.enrollment_id)}">
            <td>${esc(r.participant_name)}</td>
            <td>${r.will_attend === true ? '<span class="badge ok">Yes</span>' : r.will_attend === false ? `<span class="badge full">No</span>${r.rsvp_reason ? `<div class="muted" style="font-size:13px">${esc(r.rsvp_reason)}</div>` : ''}` : '<span class="muted">No reply</span>'}</td>
            <td>${r.checked_in_at ? esc(fmtTime(r.checked_in_at)) : '<span class="muted">—</span>'}</td>
            <td><select data-att>
              ${['', 'on_time', 'late', 'absent'].map((v) => `<option value="${v}" ${r.attendance_status === v ? 'selected' : ''}>${v ? v.replace('_', ' ') : '—'}</option>`).join('')}
            </select></td>
            <td><select data-stars>
              <option value="">—</option>
              ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${r.stars === n ? 'selected' : ''}>${n} ★</option>`).join('')}
            </select></td>
            <td><input data-reason value="${esc(r.reason || '')}" maxlength="500" placeholder="Required if below 3"></td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p data-msg class="error"></p>
      <div class="row">
        <button type="button" id="saveAtt" class="secondary">Save attendance</button>
        <button type="button" id="saveRate">Save ratings</button>
      </div>
    </div>`;

  $('#saveAtt').onclick = async () => {
    const rows = [...document.querySelectorAll('tr[data-enr]')].filter((tr) => tr.querySelector('[data-att]').value);
    try {
      for (const tr of rows) {
        await api(`/coach/sessions/${sessionId}/attendance`, { body: { enrollment_id: tr.dataset.enr, status: tr.querySelector('[data-att]').value } });
      }
      toast('Attendance saved');
    } catch (err) { $('[data-msg]').textContent = err.message; }
  };

  $('#saveRate').onclick = async () => {
    const ratings = [...document.querySelectorAll('tr[data-enr]')]
      .filter((tr) => tr.querySelector('[data-stars]').value)
      .map((tr) => ({
        enrollment_id: tr.dataset.enr,
        stars: Number(tr.querySelector('[data-stars]').value),
        reason: tr.querySelector('[data-reason]').value.trim(),
      }));
    if (!ratings.length) return toast('Choose stars for at least one student');
    try {
      await api(`/coach/sessions/${sessionId}/ratings`, { body: { ratings } });
      toast('Ratings saved');
    } catch (err) { $('[data-msg]').textContent = err.message; }
  };
}

// ---------- admin dashboard ----------
// Popup to edit a student's proposed class before it is published
function openProposalEditor(r, coaches) {
  const d = r.details;
  const days = [['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday']];
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <form class="modal" id="edProp" style="max-width:460px;text-align:left">
      <h2 style="margin-top:0">Edit proposed class</h2>
      ${d.new_condo ? `
        <div class="field"><label>Condo name</label><input name="condo_name" required minlength="2" maxlength="120" value="${esc(d.condo_name)}"></div>
` : ''}
      <div class="field"><label>Times per week</label>
        <select name="per_week">
          <option value="1" ${d.per_week === 1 ? 'selected' : ''}>Once a week</option>
          <option value="2" ${d.per_week === 2 ? 'selected' : ''}>Twice a week</option>
        </select></div>
      <div class="field"><label>Days</label>
        ${days.map(([code, label]) => `<label style="display:flex;gap:8px;align-items:center;color:inherit;margin:4px 0"><input type="checkbox" name="days" value="${code}" style="width:auto" ${(d.days || []).includes(code) ? 'checked' : ''}> ${label}</label>`).join('')}
      </div>
      <div class="field"><label>Start time (Malaysia time)</label>
        <input name="start_time" type="time" required value="${esc(d.start_time || '')}"></div>
      <div class="field"><label>Swimming level</label><select name="skill_level">${levelOptions(d.skill_level)}</select></div>
      <div class="field"><label>People</label>
        <select name="people">
          ${[[1, 'Private (1 person)'], [2, '2 people'], [3, '3 people'], [4, '4 people'], [5, '5 or more']]
            .map(([v, l]) => `<option value="${v}" ${d.people === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></div>
      <div class="field"><label>Coach</label>
        <select name="coach_id"><option value="">— none yet —</option>
          ${coaches.map((c) => `<option value="${esc(c.id)}" ${d.coach_id === c.id ? 'selected' : ''}>${esc(c.username)}</option>`).join('')}
        </select></div>
      <p class="error" data-msg></p>
      <div class="row">
        <button type="button" class="secondary" id="edCancel">Cancel</button>
        <span class="spacer"></span>
        <button type="submit">Save</button>
      </div>
    </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector('form');
  wrap.querySelector('#edCancel').onclick = () => wrap.remove();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const selectedDays = [...form.querySelectorAll('input[name="days"]:checked')].map((i) => i.value);
    try {
      await api(`/admin/class-requests/${r.id}/details`, {
        method: 'PATCH',
        body: {
          per_week: Number(form.per_week.value),
          days: selectedDays,
          start_time: form.start_time.value,
          skill_level: form.skill_level.value,
          people: Number(form.people.value),
          coach_id: form.coach_id.value || null,
          ...(d.new_condo ? { condo_name: form.condo_name.value.trim() } : {}),
        },
      });
      wrap.remove();
      toast('Saved');
      admin('requests');
    } catch (err) {
      form.querySelector('[data-msg]').textContent = err.message;
    }
  };
}

// Short summary of a class request. New-class proposals get an "Approve & publish" button.
function requestDetails(r) {
  const d = r.details;
  if (d.kind === 'new_class') {
    const summary = `${d.new_condo ? `New condo: ${esc(d.condo_name)} · ` : ''}New class: ${d.per_week === 2 ? 'twice' : 'once'} a week · ${(d.days || []).join(', ')}${d.start_time ? ` at ${esc(d.start_time)}` : ''} · ${esc(d.skill_level)} · ${d.people === 5 ? '5 or more' : d.people === 1 ? 'private' : d.people + ' people'} · unit ${esc(d.unit_number)}`;
    return d.class_id
      ? `${summary} <span class="badge ok">Published</span>`
      : `${summary}<br><button type="button" class="secondary" data-edit="${esc(r.id)}">Edit</button>
         <button type="button" data-approve="${esc(r.id)}">Approve & publish</button>`;
  }
  // "Join class" request from people who were not eligible: list each person in plain words
  const people = (d.participants || [])
    .map((p) => `${esc(p.name)} (${p.age != null ? `age ${esc(p.age)}` : esc(p.date_of_birth || '')}, ${esc(p.skill_level)})`)
    .join(', ');
  const often = { once_a_week: 'once a week', twice_a_week: 'twice a week' }[d.days] || d.days || '';
  return `${people} · ${esc(often)} · unit ${esc(d.unit_number)}`;
}
