const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { loadUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const { router: publicRoutes } = require('./routes/public');
const coachRoutes = require('./routes/coach');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const { purgeOldMessages } = require('./services/chat');
const { checkMailSettings } = require('./services/mailer');
const { pool } = require('./db');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // behind a load balancer / reverse proxy
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

// ---------- Static frontend ----------
// index.html is sent with "?v=<content hash>" added to its local .css/.js/.svg/.json links.
// A versioned file can be cached for a year: when the file changes, its hash and URL change,
// so browsers download the new one. index.html itself is revalidated on every load.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const isProd = config.env === 'production';
const YEAR_CACHE = 'public, max-age=31536000, immutable';

function versionedIndex() {
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  return html.replace(/(href|src)="(?!https?:|\/\/|#)([^"?#]+\.(?:css|js|svg|json))"/g, (whole, attr, file) => {
    try {
      const hash = crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC_DIR, file))).digest('hex').slice(0, 10);
      return `${attr}="${file}?v=${hash}"`;
    } catch (err) {
      console.warn('[assets] could not version', file, '-', err.message);
      return whole;
    }
  });
}
// Content-Security-Policy for the page: the browser only runs our own scripts (plus the one small inline
// theme script, allowed by its exact hash), so injected HTML like <img onerror=...> or <script> cannot run
// even if some text were ever shown without escaping. Images may come from any http(s) site (condo photos).
function contentSecurityPolicy(html) {
  // Browsers turn CRLF / CR into LF before hashing an inline script, so hash it the same way.
  // (On Windows, git can check the file out with CRLF line endings; without this the hash would not match.)
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map((m) => `'sha256-${crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`);
  return [
    "default-src 'self'",
    `script-src 'self' ${inline.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'", // style="" attributes are used for small layout tweaks
    "img-src 'self' data: blob: https: http:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
function buildIndex() {
  const html = versionedIndex();
  return { html, csp: contentSecurityPolicy(html) };
}
// Production: build once at startup (restart after deploying). Development: rebuild per request so edits show at once.
const builtIndex = isProd ? buildIndex() : null;
app.get(['/', '/index.html'], (_req, res) => {
  const page = builtIndex || buildIndex();
  res.set('Cache-Control', 'no-cache');
  res.set('Content-Security-Policy', page.csp);
  res.type('html').send(page.html);
});

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    // No caching in development so code changes show up on reload
    maxAge: isProd ? '1h' : 0,
    setHeaders: (res, file) => {
      if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      else if (isProd && res.req.query.v) res.setHeader('Cache-Control', YEAR_CACHE);
      // Font files never change in place: to update a font, save it under a new file name
      else if (isProd && file.endsWith('.woff2')) res.setHeader('Cache-Control', YEAR_CACHE);
    },
  })
);

// Health check for uptime monitors and PM2: 200 only when the server AND the database answer.
app.get('/api/health', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'up', uptime_s: Math.round(process.uptime()) });
  } catch (err) {
    console.error('[health] database check failed:', err.message);
    res.status(503).json({ ok: false, db: 'down' });
  }
});
// API answers are personal and change often: never let a browser or service worker cache them
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api', coachRoutes);
app.use('/api', adminRoutes);
app.use('/api', chatRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Central error handler: never leak stack traces to clients
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err); // the answer already started: let Express close the connection
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'The data sent is too large' });
  // Expected refusals thrown on purpose (httpError: 403 not your class, 404 not found, ...): pass them through
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) return res.status(status).json({ error: err.message || 'Request not allowed' });
  // Database errors caused by bad input: answer with a plain message, never the database text
  if (err.code === '22P02') return res.status(404).json({ error: 'Not found' });              // invalid id format
  if (err.code === '23503') return res.status(404).json({ error: 'A related item was not found' }); // foreign key
  if (err.code === '23505') return res.status(409).json({ error: 'This already exists' });      // unique
  if (err.code === '23514') return res.status(400).json({ error: 'Some values are not allowed' }); // check
  // Database too slow or unreachable (see the time limits in db.js): a short "try again", logged for us
  if (err.code === '57014' || /timeout|ECONNREFUSED|Connection terminated/i.test(err.message || '')) {
    console.error('[db busy]', err.message);
    return res.status(503).json({ error: 'The server is busy right now. Please try again in a moment.' });
  }
  console.error('[error]', err);
  // In development, return the real error message so problems are visible in the browser
  const detail = config.env === 'production' ? undefined : err.message;
  res.status(500).json({ error: 'Something went wrong. Please try again.', detail });
});

// Remove expired chat messages every hour (chat reads only hide them, see routes/chat.js)
const purgeTimer = setInterval(() => {
  purgeOldMessages().catch((err) => console.error('[chat purge]', err.message));
}, 60 * 60 * 1000);
purgeTimer.unref();

const server = app.listen(config.port, () => {
  console.log(`Octopus Sports Academy running on http://localhost:${config.port} (${config.env})`);
  checkMailSettings(); // writes to the logs whether the email settings work
});
// Close connections that sit idle a little longer than the proxy/tunnel would, so it never reuses a dead one
server.keepAliveTimeout = 65 * 1000;
server.headersTimeout = 66 * 1000;

// ---------- Graceful shutdown ----------
// On stop/restart (Ctrl+C, PM2 reload, deploy): stop taking new requests, let the ones in progress finish
// (a booking or payment is never cut in half), close the database pool, then exit.
// If something hangs, exit anyway after 10 s.
let shuttingDown = false;
function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${reason}: finishing requests in progress...`);
  const force = setTimeout(() => {
    console.error('[shutdown] still busy after 10 s, exiting now');
    process.exit(exitCode || 1);
  }, 10 * 1000);
  force.unref();
  clearInterval(purgeTimer);
  server.close(async (closeErr) => {
    if (closeErr) console.error('[shutdown] server close error:', closeErr.message);
    try {
      await pool.end();
    } catch (err) {
      console.error('[shutdown] database pool close error:', err.message);
    }
    console.log('[shutdown] done');
    process.exit(exitCode);
  });
  server.closeIdleConnections(); // keep-alive sockets with nothing running close now
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Windows has no stop signals: PM2 sends a 'shutdown' message instead (shutdown_with_message in ecosystem.config.js)
process.on('message', (msg) => {
  if (msg === 'shutdown') shutdown('PM2 shutdown message');
});

// ---------- Unexpected errors ----------
// A promise rejected with nobody handling it: log it loudly; the server keeps running.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
// A thrown error that escaped everything: the process may be in a broken state, so log it,
// finish what we can and exit with an error code. PM2 (ecosystem.config.js) starts a fresh process at once.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  shutdown('uncaughtException', 1);
});
