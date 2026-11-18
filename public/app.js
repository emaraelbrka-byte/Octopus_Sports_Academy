/* Octopus Sports Academy - vanilla JS single page app (hash routing, no framework) */
'use strict';

const TZ = 'Asia/Kuala_Lumpur';
const LEVELS = ['beginner', 'intermediate', 'professional', 'champion'];
const state = { user: null, loaded: false, timers: [], scanner: null };

// Line icons (24px grid, drawn with currentColor so they follow the text colour)
const ICON_PATHS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16 9.5"/>',
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3h-1"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  whistle: '<circle cx="9" cy="14" r="6"/><path d="M13 9.5 21 6v5l-6 1.5M9 14h.01"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  wave: '<path d="M2 12c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5 0"/><path d="M8 7a4 4 0 0 1 8 0"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
// "Ahmed Ali" -> "AA" for avatar circles
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Navy banner at the top of My profile (students and coaches): avatar, greeting, and up to three numbers
function profileHero(user, stats) {
  const roleLabel = { student: 'Member', coach: 'Coach', admin: 'Admin' }[user.role] || user.role;
  return `
    <section class="profile-hero">
      <div class="profile-id">
        <span class="avatar lg" aria-hidden="true">${esc(initials(user.username))}</span>
        <div>
          <span class="eyebrow">My profile</span>
          <h1>Hi, ${esc(user.username)}</h1>
          <div class="profile-meta"><span class="role-chip">${esc(roleLabel)}</span>${user.email ? `<span>${esc(user.email)}</span>` : ''}</div>
        </div>
      </div>
      <div class="profile-stats">
        ${stats.map(([id, value, label]) => `<div><strong id="${id}">${value}</strong><span>${label}</span></div>`).join('')}
      </div>
    </section>`;
}
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const LOGO = '<img src="img/logo.svg" alt="">';

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
  try {
    data = await res.json();
  } catch (err) {
    // 204 = no content on purpose; anything else should have been JSON
    if (res.status !== 204) console.warn('[api] response is not JSON:', path, res.status, err.message);
  }
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
  state.pollers = [];
  if (state.scanner) { state.scanner.stop(); state.scanner = null; }
}

// Repeats fn every ms while the tab is visible. A hidden tab makes no requests;
// when the person comes back, fn runs at once so the page is up to date.
// Stopped by clearTimers() like any other timer.
function poll(fn, ms) {
  state.pollers = state.pollers || [];
  state.pollers.push(fn);
  state.timers.push(setInterval(() => { if (!document.hidden) fn(); }, ms));
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) (state.pollers || []).forEach((fn) => fn());
});

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
  const pageLinks = [['#/', 'Home'], ['#/me', 'My profile']];
  if (state.user.role === 'admin') pageLinks.push(['#/admin', 'Admin']);
  // Desktop shows the page links in the bar; phones show them inside the account menu
  const links = pageLinks.map(([href, label]) => `<a href="${href}" class="nav-link">${label}</a>`);
  // Account menu: the arrow opens a small dropdown with the page links (phones) and Log out
  links.push(`<div class="nav-menu">
    <button class="secondary nav-account" id="navMenuBtn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Account menu"><span class="avatar xs">${esc(initials(state.user.username))}</span>${icon('chev')}</button>
    <div class="nav-dropdown" id="navDropdown" hidden>
      <div class="menu-who"><strong>${esc(state.user.username)}</strong><span>${esc(state.user.email || '')}</span></div>
      ${pageLinks.map(([href, label]) => `<a href="${href}" class="menu-link">${label}</a>`).join('')}
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
    else rememberAfterLogin(location.hash);
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
// With no saved choice the site starts in dark mode.
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : darkQuery.matches;
}
function syncThemeButton() {
  const btn = $('#themeToggle');
  if (!btn) return;
  const dark = isDark();
  btn.innerHTML = icon(dark ? 'sun' : 'moon');
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  btn.title = btn.getAttribute('aria-label');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#06142a' : '#071a33';
}
document.addEventListener('DOMContentLoaded', () => {
  syncThemeButton();
  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
  $('#themeToggle').addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('osa_theme', next);
    } catch (err) {
      // Private mode / blocked storage: the theme still changes, it just is not remembered
      console.warn('[theme] could not save the choice:', err.message);
    }
    syncThemeButton();
  });
});
darkQuery.addEventListener('change', syncThemeButton);

// ---------- auth pages ----------
// Shared look for the log-in and sign-up screens: logo, title, a Log in / Sign up switch, then the form
// Remembers the last auth screen and its card height, so switching Log in <-> Sign up can animate
const authAnim = { last: null, height: 0 };

// Photo panel shown left of every account screen on desktop
const authVisual = () => `
    <aside class="auth-visual" aria-hidden="true">
      <span class="eyebrow">Octopus Sports Academy</span>
      <h2>The pool downstairs is your new classroom.</h2>
      <p>Private and group swimming classes, held right at your condo.</p>
    </aside>`;

// Account screens without the Log in / Sign up switch (forgot, reset, verify): same look as log in
function authPage({ title, sub, body }) {
  return `
    <div class="auth-split">
      ${authVisual()}
      <div class="auth">
        <img class="auth-logo" src="img/logo.svg" alt="">
        <h1>${title}</h1>
        <p class="sub">${sub}</p>
        <div class="card auth-card"><div class="auth-body fade-in">${body}</div></div>
      </div>
    </div>`;
}

// A big round icon with a title and text: success, problem or "please wait" screens
function stateBlock(kind, title, text, extra = '') {
  const ic = { ok: 'check', bad: 'shield', wait: 'clock', info: 'qr' }[kind] || 'check';
  return `
    <div class="state ${kind}">
      <span class="state-icon">${icon(ic)}</span>
      <h3>${title}</h3>
      ${text ? `<p class="muted">${text}</p>` : ''}
      ${extra}
    </div>`;
}

// Day picker as toggle chips (the inputs keep name="days", so forms and price boxes work as before)
function dayChips(days, isWeekend) {
  return `<div class="day-chips">${days.map(([code, label]) => `
    <label class="day-chip"><input type="checkbox" name="days" value="${code}"><span>${label.slice(0, 3)}<small>${isWeekend(code) ? 'Weekend' : 'Weekday'}</small></span></label>`).join('')}</div>`;
}

function authShell(active, inner) {
  // When coming from the other tab, the pill starts on the old side and the form slides in from that direction
  const switching = authAnim.last && authAnim.last !== active;
  const pillAt = switching ? authAnim.last : active;
  const slide = switching ? (active === 'register' ? 'from-right' : 'from-left') : 'fade-in';
  return `
    <div class="auth-split">
    ${authVisual()}
    <div class="auth">
      <img class="auth-logo" src="img/logo.svg" alt="">
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

// The page someone wanted before being sent to log in (e.g. "Join class"), so login can bring them back.
// Only in-app hash routes are kept, never a full URL.
const AFTER_LOGIN_KEY = 'osa_after_login';
const SAFE_HASH = /^#\/[\w\-/?=&%.]*$/;
function rememberAfterLogin(hash) {
  if (!SAFE_HASH.test(hash) || /^#\/(login|register)\b/.test(hash)) return;
  try {
    sessionStorage.setItem(AFTER_LOGIN_KEY, hash);
  } catch (err) {
    console.warn('[login] could not remember the page to return to:', err.message);
  }
}
function takeAfterLogin() {
  try {
    const hash = sessionStorage.getItem(AFTER_LOGIN_KEY);
    sessionStorage.removeItem(AFTER_LOGIN_KEY);
    return hash && SAFE_HASH.test(hash) ? hash : null;
  } catch (err) {
    console.warn('[login] could not read the page to return to:', err.message);
    return null;
  }
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
      location.hash = takeAfterLogin() || '#/';
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
  $('#app').innerHTML = authPage({
    title: 'Forgot your password?',
    sub: 'We will email you a link to choose a new one',
    body: `
      <form id="f">
        <div class="field"><label for="email">Your email</label>
          <input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block auth-btn">Send reset link</button>
      </form>
      <p class="auth-foot"><a href="#/login">${icon('arrow')} Back to log in</a></p>`,
  });
  bindForm('#f', async (data, form) => {
    const r = await api('/auth/forgot-password', { body: data });
    form.outerHTML = stateBlock('ok', 'Check your email', `${esc(r.message)} The link is valid for 1 hour.`);
  });
}

function reset(_id, params) {
  const token = params.get('token') || '';
  if (!token) {
    $('#app').innerHTML = authPage({
      title: 'Set a new password',
      sub: 'This page needs the link from your email',
      body: stateBlock('bad', 'Link is missing', 'Open the reset link from your email, or ask for a new one.',
        '<a href="#/forgot"><button type="button" class="block">Send a new link</button></a>'),
    });
    return;
  }
  $('#app').innerHTML = authPage({
    title: 'Set a new password',
    sub: 'Choose a password you do not use anywhere else',
    body: `
      <form id="f">
        <div class="field"><label for="password">New password (min 8 characters)</label>
          <input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></div>
        <div class="field"><label for="password2">Type it again</label>
          <input id="password2" name="password2" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block auth-btn">Change password</button>
      </form>
      <p class="auth-foot"><a href="#/login">${icon('arrow')} Back to log in</a></p>`,
  });
  bindForm('#f', async (data, form) => {
    if (data.password !== data.password2) throw new Error('The two passwords are not the same');
    const r = await api('/auth/reset-password', { body: { token, password: data.password } });
    form.outerHTML = stateBlock('ok', 'Password changed', `${esc(r.message)} Taking you to log in...`);
    setTimeout(() => (location.hash = '#/login'), 1800);
  });
}

async function verify(_id, params) {
  const app = $('#app');
  const page = (body) => authPage({ title: 'Verify your email', sub: 'One last step before you can log in', body });
  app.innerHTML = page(stateBlock('wait', 'Checking your link...', ''));
  try {
    const r = await api('/auth/verify', { body: { token: params.get('token') || '' } });
    app.innerHTML = page(stateBlock('ok', 'Email verified', esc(r.message),
      '<a href="#/login"><button type="button" class="block">Go to log in</button></a>'));
  } catch (err) {
    // Expired or used link: offer a new one right here
    app.innerHTML = page(stateBlock('bad', 'This link does not work', esc(err.message), `
      <form id="resend" class="state-form">
        <div class="field"><label for="rEmail">Get a new link</label>
          <input id="rEmail" name="email" type="email" required placeholder="you@example.com" autocomplete="email"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block">Send new link</button>
      </form>`));
    bindForm('#resend', async (data) => (await api('/auth/resend-verification', { body: data })).message);
  }
}

// ---------- home and condo ----------
function home() {
  $('#app').innerHTML = `
    <section class="hero">
      <div class="hero-bg" aria-hidden="true"></div>
      <span class="eyebrow">Swimming academy · Malaysia</span>
      <h1>Learn to swim <em>at your condo</em></h1>
      <p>Pick your condo, choose a class, pay and start your journey. No travel, no traffic.</p>
      <form id="search" class="row" role="search">
        <input id="q" class="inline-input" type="search" placeholder="Search your condo..." aria-label="Search condo">
        <button type="submit">Search</button>
      </form>
      <ul class="hero-points">
        <li>${icon('check')} Private &amp; group classes</li>
        <li>${icon('check')} QR attendance</li>
        <li>${icon('check')} Coach feedback</li>
      </ul>
    </section>
    <div class="section-head">
      <div><span class="eyebrow">Find your pool</span><h2>Condos with classes</h2></div>
    </div>
    <div id="results"></div>
    <div class="section-head">
      <div><span class="eyebrow">How it works</span><h2>From sign-up to first splash</h2></div>
    </div>
    <div class="steps">
      <div class="step-card"><div class="icon">${icon('building')}</div><h3>Find your condo</h3><p>Search for your building and see the classes running at its pool.</p></div>
      <div class="step-card"><div class="icon">${icon('calendar')}</div><h3>Join a class</h3><p>Choose private or group lessons and a package that fits your week.</p></div>
      <div class="step-card"><div class="icon">${icon('qr')}</div><h3>Scan &amp; swim</h3><p>Check in with a QR code at the pool and get feedback from your coach.</p></div>
    </div>`;
  const load = async (q) => {
    let condos;
    try {
      ({ condos } = await api(`/condos?q=${encodeURIComponent(q)}`));
    } catch (err) {
      $('#results').innerHTML = `<p class="error">Cannot load condos right now (${esc(err.message)}). Please try again in a moment.</p>`;
      return;
    }
    // Ignore an old answer if the user has typed something else since
    if (q !== ($('#q')?.value.trim() ?? '')) return;
    $('#results').innerHTML = condos.length
      ? `<div class="condo-list">${condos.map((c) => `
          <a class="card" href="#/condo/${esc(c.id)}">
            ${c.image_url ? `<img src="${esc(c.image_url)}" alt="">` : `<span class="condo-tile">${icon('building')}</span>`}
            <span class="condo-info"><h3>${esc(c.name)}</h3><div class="muted">${esc(c.address || '')}</div></span>
            <span class="condo-go">${icon('arrow')}</span>
          </a>`).join('')}</div>`
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
  const filters = [['', 'All classes'], ['one_to_one', 'Private'], ['group', 'Group']];
  $('#app').innerHTML = `
    <p class="crumbs"><a href="#/">Condos</a><span>/</span>${esc(c.name)}</p>
    <section class="condo-hero${c.image_url ? ' has-photo' : ''}">
      ${c.image_url ? `<div class="hero-bg" style="background-image:url('${esc(c.image_url)}')" aria-hidden="true"></div>` : ''}
      <div class="condo-hero-main">
        <span class="condo-tile lg">${icon('building')}</span>
        <div>
          <span class="eyebrow">Swimming at your condo</span>
          <h1>${esc(c.name)}</h1>
          ${c.address ? `<p class="condo-address">${icon('pin')}${esc(c.address)}</p>` : ''}
        </div>
      </div>
      <a href="#/new-class/${esc(id)}" class="hero-action"><button type="button">${icon('plus')} Add class</button></a>
    </section>
    <div class="section-head">
      <div><span class="eyebrow">Timetable</span><h2>Classes at this condo</h2></div>
      <div class="pills" role="group" aria-label="Class type">
        ${filters.map(([v, label]) => `<a href="#/condo/${esc(id)}${v ? `?type=${v}` : ''}" class="pill${type === v ? ' active' : ''}"${type === v ? ' aria-current="true"' : ''}>${label}</a>`).join('')}
      </div>
    </div>
    ${classes.length
      ? `<div class="class-grid">${classes.map((k) => classCard(k)).join('')}</div>`
      : `<div class="empty-state">
          <span class="empty-icon">${icon('wave')}</span>
          <h3>No classes here yet</h3>
          <p class="muted">Be the first: request a class for this condo and we will set it up.</p>
          <a href="#/new-class/${esc(id)}"><button type="button">Add a class</button></a>
        </div>`}
    `;
  if (can_chat) startChat(id);
}

// Chat state ('open' or 'min') is kept in this browser only. Default: open on desktop, minimized on mobile.
const CHAT_STATE_KEY = 'osa_chat_state';
const isMobile = () => window.matchMedia('(max-width: 700px)').matches;
function getChatState() {
  try {
    const saved = localStorage.getItem(CHAT_STATE_KEY);
    if (saved === 'open' || saved === 'min') return saved;
  } catch (err) {
    console.warn('[chat] could not read the saved chat state, using the default:', err.message);
  }
  return isMobile() ? 'min' : 'open';
}
function saveChatState(value) {
  try {
    localStorage.setItem(CHAT_STATE_KEY, value);
  } catch (err) {
    console.warn('[chat] could not remember the chat state:', err.message);
  }
}

// Condo chat: refreshes every 5 seconds (simple polling, no extra server needed)
function startChat(condoId) {
  // Floating widget: fixed on the right on desktop, a chat button bottom-right on mobile
  document.body.insertAdjacentHTML('beforeend', `
    <div class="chat-widget" id="chatWidget">
      <div class="chat-head">
        <div class="chat-avatar">${LOGO}</div>
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

  // First load gets the latest messages; every poll after that asks only for messages newer than the
  // last one shown and appends them (no full redraw). seen guards against the same message twice.
  let lastAt = null;
  const seen = new Set();
  const load = async () => {
    try {
      const after = lastAt ? `?after=${encodeURIComponent(lastAt)}` : '';
      const { messages, retention_days } = await api(`/condos/${encodeURIComponent(condoId)}/chat${after}`);
      const retEl = $('#retDays');
      if (retEl && retention_days) retEl.textContent = retention_days;
      const list = $('#chatList');
      if (!list) return;
      const fresh = messages.filter((m) => !seen.has(m.id));
      fresh.forEach((m) => seen.add(m.id));
      if (messages.length) lastAt = messages[messages.length - 1].created_at;
      const nearBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 60;
      const first = !list.dataset.ready;
      if (first) {
        list.innerHTML = fresh.length
          ? fresh.map(chatItem).join('')
          : '<p class="chat-empty">No messages yet. Say hi 👋</p>';
      } else if (fresh.length) {
        list.querySelector('.chat-empty')?.remove();
        list.insertAdjacentHTML('beforeend', fresh.map(chatItem).join(''));
      }
      if (first || (fresh.length && nearBottom)) list.scrollTop = list.scrollHeight;
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
  poll(load, 5000);
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
  const left = k.capacity - k.enrolled;
  const isPrivate = k.class_type === 'one_to_one';
  // A private class is for 1 person; a group class is charged at the 4-person price (see pricing.js)
  const price = k.prices ? (isPrivate ? k.prices['1'] : k.prices['4-6']) : k.price_cents;
  return `
    <article class="card offer-card">
      <div class="offer-top">
        <span class="type-chip ${isPrivate ? 'private' : 'group'}">${icon(isPrivate ? 'user' : 'users')}${isPrivate ? 'Private 1:1' : 'Group'}</span>
        ${full ? '<span class="badge full">Full</span>' : `<span class="badge ok">${left} ${left === 1 ? 'seat' : 'seats'} left</span>`}
      </div>
      <h3>${esc(groupName(k.upcoming_times, k.name, k.class_type))}</h3>
      ${statusBadge(k)}
      <div class="offer-tags"><span class="badge level">${esc(k.skill_level)}</span><span class="badge">Age ${k.min_age}–${k.max_age}</span>${k.classes_per_month ? `<span class="badge">${k.classes_per_month === 8 ? 'Twice a week' : 'Once a week'}</span>` : ''}</div>
      <ul class="offer-facts">
        <li>${icon('whistle')}<span>Coach <strong>${esc(k.coach_name || 'to be assigned')}</strong></span></li>
        <li>${icon('calendar')}<span>${esc(dayLabels(k.upcoming_times)) || 'No upcoming sessions'}${k.schedule_text ? ` · ${esc(k.schedule_text)}` : ''}</span></li>
        <li>${icon('clock')}<span>${k.duration_min} min${k.classes_per_month ? ` · ${k.classes_per_month} classes/month` : ''}</span></li>
        <li>${icon('arrow')}<span>Next: ${k.next_session_at ? `<strong>${esc(fmtTime(k.next_session_at))}</strong>` : 'No session scheduled'}</span></li>
      </ul>
      <div class="offer-foot">
        <div class="offer-price"><strong>${rm(price)}</strong><span>${k.prices ? 'package · per person' : 'per person'}</span></div>
        ${full ? '<button disabled>Class full</button>' : `<a href="#/join/${esc(k.id)}"><button type="button">Join class</button></a>`}
      </div>
    </article>`;
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

// Shared layout of the two request forms: steps on the left, "what happens next" on the right.
// Field names stay the same (per_week, days, start_time, skill_level, people, unit_number) for wirePriceBox.
function requestFormHtml({ formId, condoStep, backHref, backLabel }) {
  const days = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];
  let n = 0;
  const step = (title) => `<div class="join-step"><span class="step-no">${++n}</span><h3>${title}</h3></div>`;
  return `
    <div class="join-grid">
      <form id="${formId}" class="panel join-form">
        ${condoStep ? `${step('Your condo')}${condoStep}` : ''}
        ${step('When')}
        <div class="row join-top">
          <div class="field"><label for="${formId}-pw">Times a week</label>
            <select id="${formId}-pw" name="per_week"><option value="1">Once a week</option><option value="2">Twice a week</option></select></div>
          <div class="field" style="flex:1"><label for="${formId}-time">Start time (Malaysia time)</label>
            <input id="${formId}-time" name="start_time" type="time" required></div>
        </div>
        <div class="field"><label>Days <span class="muted">(1 day for once a week, 2 for twice a week)</span></label>${dayChips(days, isWeekendCode)}</div>
        ${step('Who')}
        <div class="row join-top">
          <div class="field" style="flex:1"><label for="${formId}-level">Swimming level</label><select id="${formId}-level" name="skill_level">${levelOptions()}</select></div>
          <div class="field" style="flex:1"><label for="${formId}-people">How many people?</label>
            <select id="${formId}-people" name="people">
              <option value="1">Private (1 person)</option><option value="2">2 people</option><option value="3">3 people</option><option value="4">4 people</option><option value="5">5 or more</option>
            </select></div>
        </div>
        <div class="field"><label for="${formId}-unit">Unit number</label>
          <input id="${formId}-unit" name="unit_number" required maxlength="20" placeholder="e.g. A-12-3"></div>
        <p class="muted small" style="margin:-6px 0 14px">The unit number lets the coach register as your visitor at the condo gate.</p>
        <div id="priceBox" class="price-box result-box"></div>
        <p data-msg class="error"></p>
        <button type="submit" class="block">Send request</button>
        <p class="auth-foot"><a href="${backHref}">${icon('arrow')} ${backLabel}</a></p>
      </form>
      <aside class="panel join-help">
        <div class="panel-head"><span class="panel-icon">${icon('inbox')}</span><div><h3>What happens next</h3><p class="muted">No payment now.</p></div></div>
        <ul class="offer-facts">
          <li>${icon('shield')}<span>The academy reviews your request and finds a coach.</span></li>
          <li>${icon('calendar')}<span>Once approved, the class appears on the condo page with its dates.</span></li>
          <li>${icon('users')}<span>A group class starts when enough people join. Invite your neighbours!</span></li>
          <li>${icon('clock')}<span>You can have a limited number of requests waiting at the same time.</span></li>
        </ul>
      </aside>
    </div>`;
}

// ---------- student adds a condo that is not in the app, with a class ----------
function newCondo(_id, params) {
  const name = params.get('name') || '';
  $('#app').innerHTML = `
    <p class="crumbs"><a href="#/">Condos</a><span>/</span>Add your condo</p>
    <div class="page-head">
      <span class="page-icon">${icon('building')}</span>
      <div><h1>Add your condo and class</h1><p class="muted">Your condo is not in the app yet. Tell us where and when, and the academy will set it up.</p></div>
    </div>
    ${requestFormHtml({
      formId: 'fCondoNew',
      condoStep: `<div class="field"><label for="cName">Condo name</label>
        <input id="cName" name="condo_name" required minlength="2" maxlength="120" value="${esc(name)}"></div>`,
      backHref: '#/',
      backLabel: 'Back to home',
    })}`;
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
  $('#app').innerHTML = `
    <p class="crumbs"><a href="#/">Condos</a><span>/</span><a href="#/condo/${esc(condoId)}">Condo</a><span>/</span>Request a class</p>
    <div class="page-head">
      <span class="page-icon">${icon('plus')}</span>
      <div><h1>Request a class</h1><p class="muted">No class fits you? Tell us what works and the academy will set it up at your condo.</p></div>
    </div>
    ${requestFormHtml({ formId: 'fNew', backHref: `#/condo/${esc(condoId)}`, backLabel: 'Back to condo' })}`;
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
      <div class="participant-head"><span class="avatar" aria-hidden="true">${i + 1}</span><strong>Person ${i + 1}</strong></div>
      ${members.length ? `<div class="field"><label for="p${i}-member">From family</label><select id="p${i}-member" data-field="member"><option value="">— type manually —</option>${memberOptions}</select></div>` : ''}
      <div class="field"><label for="p${i}-name">Name</label><input id="p${i}-name" name="p${i}-name" type="text" data-field="name" required maxlength="80"></div>
      <div class="row">
        <div class="field spacer"><label for="p${i}-dob">Date of birth</label><input id="p${i}-dob" name="p${i}-dob" data-field="dob" type="date" max="${todayISO()}" required></div>
        <div class="field spacer"><label for="p${i}-skill">Swimming level</label><select id="p${i}-skill" name="p${i}-skill" data-field="skill">${levelOptions()}</select></div>
      </div>
    </div>`;

  $('#app').innerHTML = `
    <p class="crumbs"><a href="#/">Condos</a><span>/</span>Join a class</p>
    <div class="page-head">
      <span class="page-icon">${icon('wave')}</span>
      <div><h1>Join a class</h1><p class="muted">Tell us who is swimming. We check the class rules, then you join.</p></div>
    </div>
    ${invite ? `<div class="invite-note">${icon('gift')}<span>You are joining with a friend's invite link.</span></div>` : ''}
    <div class="join-grid">
      <div class="panel join-form">
        <div class="join-step"><span class="step-no">1</span><h3>Who is joining?</h3></div>
        <div class="row join-top">
          <div class="field"><label for="count">Number of people</label>
            <select id="count">${[...Array(10)].map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
          <div class="field" style="flex:1"><label for="unit">Unit number</label>
            <input id="unit" maxlength="20" required placeholder="e.g. A-12-3"></div>
        </div>
        <p class="muted small" style="margin:-4px 0 14px">The unit number lets the coach register as your visitor at the condo gate.</p>
        <div id="people"></div>
        <div class="join-step"><span class="step-no">2</span><h3>Check and join</h3></div>
        <button id="check" type="button" class="block">Check eligibility</button>
        <div id="result"></div>
      </div>
      <aside class="panel join-help">
        <div class="panel-head"><span class="panel-icon">${icon('check')}</span><div><h3>How joining works</h3><p class="muted">Takes about a minute.</p></div></div>
        <ul class="offer-facts">
          <li>${icon('users')}<span>Add each person who will swim. Family members you saved can be picked from a list.</span></li>
          <li>${icon('shield')}<span>We check age and swimming level against the class rules.</span></li>
          <li>${icon('calendar')}<span>Group classes start once enough people join. You will see the status on your profile.</span></li>
          <li>${icon('qr')}<span>At the pool, check in by scanning your coach's QR code.</span></li>
        </ul>
      </aside>
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
    out.innerHTML = '<p class="muted" style="margin-top:12px">Checking...</p>';
    try {
      const r = await api(`/classes/${classId}/eligibility`, { body: { participants } });
      if (r.full) {
        out.innerHTML = `<div class="result-box bad">${r.seats_left > 0
          ? `<p class="error">Only ${r.seats_left} seat${r.seats_left === 1 ? '' : 's'} left in this class. Choose fewer people.</p>`
          : '<p class="error">Sorry, this class is full.</p>'}</div>`;
        return;
      }
      const list = r.participants.map((p) => `<li><strong>${esc(p.name)}</strong> ${p.eligible
        ? '<span class="badge ok">Eligible</span>'
        : `<span class="badge full">Not eligible</span> <span class="muted">${esc(p.reason)}</span>`}</li>`).join('');
      if (r.eligible) {
        out.innerHTML = `
          <div class="result-box">
            <div class="label">${esc(r.class_name)}</div>
            <ul class="result-list">${list}</ul>
            <div class="offer-foot">
              <div class="offer-price"><strong>${rm(r.price_cents)}</strong><span>total · ${rm(r.price_per_person_cents)} per person</span></div>
              <button id="pay" type="button">Join class</button>
            </div>
            <p class="muted small" style="margin:10px 0 0">Online payment is not connected yet. After you join, the academy will contact you to arrange payment.</p>
            <p data-msg class="error"></p>
          </div>`;
        $('#pay').onclick = async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'Joining...';
          const ok = await enroll(classId, participants, unit, invite);
          if (!ok) { e.target.disabled = false; e.target.textContent = 'Join class'; }
        };
      } else {
        out.innerHTML = `
          <div class="result-box bad">
          <ul class="result-list">${list}</ul>
          <p>You are not eligible for this class. Create a class for your group instead:</p>
          <form id="req">
            <div class="field"><label for="days">How often?</label>
              <select id="days" name="days"><option value="once_a_week">Once a week</option><option value="twice_a_week">Twice a week</option></select></div>
            <button type="submit">Create class</button>
            <p data-msg class="error"></p>
          </form>
          </div>`;
        const condoId = r.condo_id;
        bindForm('#req', async (form) => {
          const res = await api('/class-requests', { body: { condo_id: condoId, participants, unit_number: unit, days: form.days } });
          showDialog(res.message, () => (location.hash = `#/condo/${condoId}`));
        });
      }
    } catch (err) {
      out.innerHTML = `<div class="result-box bad"><p class="error">${esc(err.message)}</p></div>`;
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
  } catch (err) {
    // Private mode: the invite link just has to be opened again after login
    console.warn('[invite] could not remember the invite link:', err.message);
  }
}

// Friend's invite landing page: shows the class and whether this account can accept it
async function invite(code) {
  if (!state.user) {
    pendingInviteSet(code);
    $('#app').innerHTML = `
      <section class="invite-hero">
        <span class="invite-gift">${icon('gift')}</span>
        <span class="eyebrow">You are invited</span>
        <h1>A friend saved you a spot in the pool</h1>
        <p>Create an account or log in first. After you log in, this invite opens again by itself.</p>
        <div class="row invite-actions">
          <a href="#/register"><button type="button">Create account</button></a>
          <a href="#/login"><button type="button" class="ghost">I have an account</button></a>
        </div>
      </section>`;
    return;
  }
  pendingInviteSet(null);
  let info;
  try {
    info = await api(`/invites/${encodeURIComponent(code)}`);
  } catch (err) {
    $('#app').innerHTML = `<div class="narrow">${stateBlock('bad', 'This invite does not work', esc(err.message),
      '<a href="#/"><button type="button">Find a class</button></a>')}</div>`;
    return;
  }
  $('#app').innerHTML = `
    <section class="invite-hero">
      <span class="invite-gift">${icon('gift')}</span>
      <span class="eyebrow">You are invited</span>
      <h1>${esc(info.inviter_name)} invited you to swim</h1>
      <p>Join their group class at ${esc(info.condo_name)}.</p>
    </section>
    <article class="card offer-card invite-card">
      <div class="offer-top">
        <span class="type-chip group">${icon('users')}Group</span>
        <span class="badge ${info.seats_left ? 'ok' : 'full'}">${info.seats_left} seat${info.seats_left === 1 ? '' : 's'} left</span>
      </div>
      <h3>${esc(info.class_name)}</h3>
      <div class="offer-tags"><span class="badge level">${esc(info.skill_level)}</span><span class="badge">Age ${info.min_age}–${info.max_age}</span></div>
      <ul class="offer-facts">
        <li>${icon('pin')}<span>${esc(info.condo_name)}</span></li>
        <li>${icon('user')}<span>Invited by <strong>${esc(info.inviter_name)}</strong></span></li>
      </ul>
      <div class="offer-foot">
        <div class="offer-price"><strong>${rm(info.price_per_person_cents)}</strong><span>package · per person</span></div>
        ${info.can_accept ? `<a href="#/join/${esc(info.class_id)}?invite=${esc(code)}"><button type="button">Join this class</button></a>` : ''}
      </div>
      ${info.can_accept ? '' : `<p class="error" style="margin:12px 0 0">${esc(info.reason)}</p>`}
    </article>`;
}

async function enroll(classId, participants, unit, invite = null) {
  try {
    const r = await api(`/classes/${classId}/enroll`, { body: { participants, unit_number: unit, ...(invite ? { invite } : {}) } });
    toast(r.message);
    location.hash = '#/me';
    return true;
  } catch (err) {
    const msg = document.querySelector('#result [data-msg]');
    if (msg) msg.textContent = err.message;
    else toast(err.message);
    return false;
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
  const classCount = new Set(sessions.map((s) => s.enrollment_id)).size;
  $('#app').innerHTML = `
    ${profileHero(user, [['stClasses', classCount, classCount === 1 ? 'Class' : 'Classes'], ['stFamily', members.length, 'Family'], ['stFree', '–', 'Free months']])}
    ${payNotice}
    <div class="profile-grid">
      <div class="profile-main">
        <div class="section-head">
          <div><span class="eyebrow">Schedule</span><h2>My classes</h2></div>
          <a href="#/" class="link-btn">Find a class ${icon('arrow')}</a>
        </div>
        <div id="classes"></div>
      </div>
      <aside class="profile-side">
        <div class="panel">
          <div class="panel-head"><span class="panel-icon">${icon('users')}</span><div><h3>Family members</h3><p class="muted">Everyone who joins under your account.</p></div></div>
          <div id="family"></div>
          <details class="add-member"${members.length ? '' : ' open'}>
            <summary>+ Add family member</summary>
            <form id="addFamily">
              <div class="field"><label for="fmName">Full name</label><input id="fmName" name="full_name" required maxlength="80"></div>
              <div class="row">
                <div class="field" style="flex:1"><label for="fmDob">Date of birth</label><input id="fmDob" name="date_of_birth" type="date" max="${todayISO()}" required></div>
                <div class="field" style="flex:1"><label for="fmLevel">Level</label><select id="fmLevel" name="skill_level">${levelOptions()}</select></div>
              </div>
              <p data-msg class="error"></p>
              <button type="submit" class="block">Add family member</button>
            </form>
          </details>
        </div>
        <div class="panel">
          <div class="panel-head"><span class="panel-icon coral">${icon('gift')}</span><div><h3>Invite rewards</h3><p class="muted">Friends who joined with your link.</p></div></div>
          <div id="referrals"></div>
        </div>
      </aside>
    </div>`;

  $('#family').innerHTML = members.length
    ? `<div class="member-list">${members.map((m) => `
        <div class="member">
          <span class="avatar" aria-hidden="true">${esc(initials(m.full_name))}</span>
          <div class="spacer"><strong>${esc(m.full_name)}</strong><div class="muted">${m.age} years · <span class="level">${esc(m.skill_level)}</span></div></div>
          <button class="icon-btn" data-remove="${esc(m.id)}" type="button" aria-label="Remove ${esc(m.full_name)}" title="Remove">${icon('trash')}</button>
        </div>`).join('')}</div>`
    : '<p class="muted empty-note">No family members yet.</p>';
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
  // Countdown refreshes once a minute; the list is re-fetched every 30 s so the check-in button appears on time.
  // Both pause while the tab is hidden and catch up as soon as it is shown again.
  poll(updateCountdowns, COUNTDOWN_EVERY_MS);
  poll(async () => {
    // Someone is typing in the class list (e.g. a reason for not attending): skip this refresh,
    // redrawing now would wipe what they are writing. The next refresh catches up.
    const active = document.activeElement;
    if (active && active.closest && active.closest('#classes') && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    // A failed refresh keeps the list on screen instead of emptying it
    const res = await api('/me/classes').catch((err) => { console.warn('[classes] refresh failed:', err.message); return null; });
    if (res) renderMySessions(res.sessions);
  }, 30000);
}

// Friends who joined with my invite link, and the free months earned from them
async function loadReferrals() {
  const box = $('#referrals');
  if (!box) return;
  try {
    const { invited, free_months: freeMonths } = await api('/me/referrals');
    const stat = $('#stFree');
    if (stat) stat.textContent = freeMonths;
    box.innerHTML = `
      <div class="reward">
        <strong>${freeMonths}</strong>
        <span>free month${freeMonths === 1 ? '' : 's'} earned</span>
      </div>
      <p class="muted small">One free month for each class that is confirmed only because of the friends you invited (per class, not per person).</p>
      ${invited.length ? `<div class="member-list">${invited.map((r) => `
          <div class="member">
            <span class="avatar" aria-hidden="true">${esc(initials(r.participant_name))}</span>
            <div class="spacer"><strong>${esc(r.participant_name)}</strong><div class="muted">${esc(r.class_name)}</div></div>
            ${r.paid ? '<span class="badge ok">Paid</span>' : '<span class="badge late">Not paid yet</span>'}
          </div>`).join('')}</div>`
        : '<p class="muted empty-note">No friends have joined with your link yet. Use “Invite a friend” on a group class.</p>'}`;
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
    box.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">${icon('wave')}</span>
        <h3>No classes yet</h3>
        <p class="muted">Find your condo and join a private or group class.</p>
        <a href="#/"><button type="button">Find your condo</button></a>
      </div>`;
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
      <div class="class-head" data-toggle="${esc(enrId)}" role="button" tabindex="0" aria-expanded="${open}" title="${open ? 'Hide all dates' : 'Show all dates'}">
        <div class="class-top">
          <span class="class-icon">${icon('wave')}</span>
          <div class="spacer">
            <h3>${esc(next.class_name)}</h3>
            <div class="class-meta">
              <span>${icon('user')}${esc(next.participant_name)}</span>
              <span>${icon('pin')}${esc(next.condo_name)}</span>
              <span>${icon('whistle')}Coach ${esc(next.coach_name || 'TBA')}</span>
            </div>
          </div>
          <span class="chev${open ? ' up' : ''}">${icon('chev')}</span>
        </div>
      </div>
      <div class="next-box">
        <div class="next-when"><span class="label">Next class</span><strong>${esc(fmtTime(next.starts_at))}</strong><span class="muted small">Malaysia time</span></div>
        <div class="countdown-slot"></div>
      </div>
      ${rsvpRow(next)}
      ${next.class_type === 'group' && next.enrollment_id ? `
        <div class="row" style="margin-top:8px">
          <button type="button" class="secondary" data-invite="${esc(next.enrollment_id)}">Invite a friend</button>
          <div class="invite-slot" style="width:100%"></div>
        </div>` : ''}
      ${open ? `<div class="all-dates">${list.map(sessionRow).join('')}</div>` : ''}
    </div>`;
  }).join('');

  // Invite links already shown stay open when the list is redrawn (the 30 s refresh used to wipe them)
  state.inviteLinks = state.inviteLinks || new Map();
  const showInvite = (slot, link) => {
    slot.innerHTML = `
      <div class="row" style="width:100%">
        <input readonly value="${esc(link)}" class="inline-input" aria-label="Invite link">
        <button type="button" class="secondary" data-copy>Copy link</button>
      </div>
      <p class="muted" style="margin:4px 0 0">Send this link to a friend who is new to the academy. They can join the class with it.</p>`;
    const input = slot.querySelector('input');
    input.onclick = () => input.select();
    slot.querySelector('[data-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copied');
      } catch (err) {
        console.warn('[invite] clipboard not available:', err.message);
        input.select();
        toast('Copy the link from the box');
      }
    };
  };
  box.querySelectorAll('[data-invite]').forEach((b) => {
    const slot = b.parentElement.querySelector('.invite-slot');
    if (state.inviteLinks.has(b.dataset.invite)) showInvite(slot, state.inviteLinks.get(b.dataset.invite));
    b.onclick = async () => {
      try {
        const { link } = await api(`/me/enrollments/${b.dataset.invite}/invite`, { method: 'POST', body: {} });
        state.inviteLinks.set(b.dataset.invite, link);
        showInvite(slot, link);
      } catch (err) {
        toast(err.message);
      }
    };
  });

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
      slot.innerHTML = `<span class="label">Starts in</span><span class="countdown">${formatRemaining(start - now)}</span>`;
    } else if (now <= end) {
      slot.innerHTML = `<a href="#/checkin"><button type="button">Scan coach QR code</button></a>`;
    } else {
      slot.innerHTML = '<span class="muted">Class finished</span>';
    }
  });
}

// The countdown is only a reminder, so it shows days/hours (minutes in the last hours), no seconds:
// "4d 17h", "5h 20m", "45 min". It is refreshed once a minute.
const COUNTDOWN_EVERY_MS = 60 * 1000;
function formatRemaining(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m} min`;
}

// ---------- check-in (student scans the coach QR) ----------
async function checkin(_id, params) {
  const app = $('#app');
  const token = params.get('token') || sessionStorage.getItem('pendingCheckin');
  app.innerHTML = `
    <div class="page-head">
      <span class="page-icon">${icon('qr')}</span>
      <div><h1>Check in</h1><p class="muted">Scan your coach's QR code at the pool. Check-in opens 30 minutes before the class.</p></div>
    </div>
    <div class="narrow">
      <div class="panel" id="status">${token
        ? stateBlock('wait', 'Checking you in...', '')
        : stateBlock('info', 'Ready to scan', 'Point your camera at the QR code your coach shows you.')}</div>
      ${token ? '' : `
        <div class="panel scan-panel">
          <button type="button" id="cam" class="block scan-btn">${icon('qr')} Open camera to scan</button>
          <video id="video" hidden playsinline muted></video>
          <p class="muted small" id="camNote"></p>
          <div class="or-line"><span>or</span></div>
          <label for="manual">Paste the QR link or code</label>
          <div class="row" style="flex-wrap:nowrap"><input id="manual" class="inline-input" placeholder="Paste link or code"><button type="button" id="manualGo">Check in</button></div>
        </div>`}
    </div>`;
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
    status.innerHTML = stateBlock(r.status === 'late' ? 'wait' : 'ok', esc(r.message),
      `Checked in: <strong>${esc(r.participants.join(', '))}</strong>`,
      '<a href="#/me"><button type="button" class="secondary">Go to my classes</button></a>');
  } catch (err) {
    status.innerHTML = stateBlock('bad', 'Could not check you in', esc(err.message));
  }
}

// ---------- coach panel ----------
async function coach() {
  clearTimers();
  const { sessions } = await api('/coach/sessions');
  const upcoming = sessions.filter((s) => new Date(s.ends_at).getTime() > Date.now()).length;
  const classTotal = new Set(sessions.map((s) => s.class_id)).size;
  $('#app').innerHTML = `
    ${profileHero(state.user, [['stClasses', classTotal, classTotal === 1 ? 'Class' : 'Classes'], ['stUpcoming', upcoming, 'Upcoming']])}
    <div class="section-head"><div><span class="eyebrow">Teaching</span><h2>My classes</h2></div></div>
    <div class="card next-card" id="nextClass"></div>
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
  poll(() => renderNextClass(sessions), COUNTDOWN_EVERY_MS);
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
    ? `<div class="next-box">
         <div class="next-when"><span class="label">Next class · ${esc(next.class_name)}</span><strong>${esc(fmtTime(next.starts_at))}</strong><span class="muted small">${esc(next.condo_name)} · Malaysia time</span></div>
         <div class="countdown-slot"><span class="label">Starts in</span><span class="countdown">${formatRemaining(start - now)}</span></div>
       </div>`
    : `<div class="next-box">
         <div class="next-when"><span class="label">In progress</span><strong>${esc(next.class_name)}</strong><span class="muted small">${esc(next.condo_name)}</span></div>
         <span class="badge ok">Class is running</span>
       </div>`;
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

  // The panel's own message line: cleared before each save so an old error never sits next to a success
  const panelMsg = $('#panel [data-msg]');
  const showMsg = (text) => { if (panelMsg) panelMsg.textContent = text; };

  $('#saveAtt').onclick = async () => {
    showMsg('');
    const rows = [...document.querySelectorAll('tr[data-enr]')].filter((tr) => tr.querySelector('[data-att]').value);
    try {
      for (const tr of rows) {
        await api(`/coach/sessions/${sessionId}/attendance`, { body: { enrollment_id: tr.dataset.enr, status: tr.querySelector('[data-att]').value } });
      }
      toast('Attendance saved');
    } catch (err) { showMsg(err.message); }
  };

  $('#saveRate').onclick = async () => {
    const ratings = [...document.querySelectorAll('tr[data-enr]')]
      .filter((tr) => tr.querySelector('[data-stars]').value)
      .map((tr) => ({
        enrollment_id: tr.dataset.enr,
        stars: Number(tr.querySelector('[data-stars]').value),
        reason: tr.querySelector('[data-reason]').value.trim(),
      }));
    showMsg('');
    if (!ratings.length) return toast('Choose stars for at least one student');
    try {
      await api(`/coach/sessions/${sessionId}/ratings`, { body: { ratings } });
      toast('Ratings saved');
    } catch (err) { showMsg(err.message); }
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
