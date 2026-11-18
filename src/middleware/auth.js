const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');

const COOKIE = 'osa_session';

// version = the user's session_version now; the cookie stops working when that number changes
function setSessionCookie(res, userId, version = 0) {
  const token = jwt.sign({ sub: userId, v: version }, config.jwtSecret, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE);
}

// Loads the current user from the signed cookie. Does not reject anonymous requests by itself.
async function loadUser(req, _res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(
      'SELECT id, username, email, phone, role, email_verified, session_version FROM users WHERE id = $1',
      [payload.sub]
    );
    // Cookies made before a logout / password change carry an older version: treat as logged out
    if (rows[0] && (payload.v || 0) === rows[0].session_version) {
      const { session_version: _v, ...user } = rows[0];
      req.user = user;
    }
  } catch (err) {
    // Expired or tampered cookie: normal, treat as anonymous. Anything else (e.g. database down) is a real problem.
    if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
      if (config.env !== 'production') console.warn('[auth] ignoring session cookie:', err.message);
    } else {
      console.error('[auth] could not load the user for this request:', err);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  if (!req.user.email_verified) return res.status(403).json({ error: 'Please verify your email first' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please log in' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed' });
    next();
  };
}

module.exports = { setSessionCookie, clearSessionCookie, loadUser, requireAuth, requireRole };
