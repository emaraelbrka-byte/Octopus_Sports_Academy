const config = require('../config');

// The address put inside emailed links, invite links and the check-in QR.
//
// APP_URL=https://your-domain.com  -> always that address (use this for the real site).
// APP_URL=auto                     -> the address the visitor is using right now, e.g. a temporary
//                                     tunnel like https://abc.trycloudflare.com or http://localhost:3001.
//
// "auto" only trusts host names listed in ALLOWED_HOSTS (default: localhost, 127.0.0.1, *.trycloudflare.com).
// Without that list, someone could send a fake Host header and make the server email a password-reset
// link that points to their own site. Anything not on the list falls back to http://localhost:PORT.
const DEFAULT_ALLOWED = ['localhost', '127.0.0.1', '*.trycloudflare.com'];
const allowed = (process.env.ALLOWED_HOSTS ? process.env.ALLOWED_HOSTS.split(',') : DEFAULT_ALLOWED)
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function hostAllowed(hostname) {
  return allowed.some((pattern) =>
    pattern.startsWith('*.') ? hostname.endsWith(pattern.slice(1)) && hostname.length > pattern.length - 1 : hostname === pattern
  );
}

function publicBaseUrl(req) {
  if (config.appUrl !== 'auto') return config.appUrl.replace(/\/+$/, '');
  const fallback = `http://localhost:${config.port}`;
  // The raw Host header (not X-Forwarded-Host, which a visitor could set themselves)
  const host = String((req && req.get('host')) || '').toLowerCase();
  const m = /^([a-z0-9.-]+)(:\d{1,5})?$/.exec(host);
  if (!m || !hostAllowed(m[1])) return fallback;
  // req.protocol is "https" behind the tunnel (X-Forwarded-Proto from the trusted proxy), "http" on localhost
  const proto = req.protocol === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

module.exports = { publicBaseUrl };
