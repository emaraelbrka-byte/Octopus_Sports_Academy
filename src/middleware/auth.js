const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');

const COOKIE = 'osa_session';

function setSessionCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '7d' });
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
      'SELECT id, username, email, phone, role, email_verified FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows[0]) req.user = rows[0];
  } catch (_) {
    // invalid or expired token: treat as anonymous
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
