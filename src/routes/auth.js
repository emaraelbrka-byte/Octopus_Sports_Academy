const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { query } = require('../db');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { createAuthToken, consumeAuthToken } = require('../services/tokens');
const { sendMail } = require('../services/mailer');
const { verifyEmail, resetEmail } = require('../services/emailTemplates');
const { publicBaseUrl } = require('../services/url');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// Brute-force guard: at most 10 wrong passwords per account in 15 minutes (successful logins are not counted)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `login:${String((req.body && req.body.identifier) || '').trim().toLowerCase()}`,
  message: { error: 'Too many wrong attempts. Please wait 15 minutes and try again.' },
});
// Wider guard per IP address (many accounts tried from one place). Only real wrong passwords count:
// successful logins and the 429s already sent by the per-account limit are not counted.
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400 || res.statusCode === 429,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many wrong attempts. Please wait 15 minutes and try again.' },
});

// Keep phone numbers in one format: digits with an optional leading +
const normalizePhone = (p) => String(p).replace(/[\s()-]/g, '');

const registerSchema = z.object({
  username: z.string({ error: 'Username is required' }).trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username is too long (30 characters at most)')
    .regex(/^[A-Za-z0-9_.]+$/, 'Username: letters, numbers, _ and . only'),
  email: z.string({ error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address'),
  phone: z.string({ error: 'Phone number is required' }).transform(normalizePhone)
    .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Invalid phone number')),
  password: z.string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3), // email or phone
  password: z.string().min(1),
});

async function sendVerifyEmail(user, req) {
  const raw = await createAuthToken(user.id, 'verify');
  const link = `${publicBaseUrl(req)}/#/verify?token=${raw}`;
  await sendMail({ to: user.email, ...verifyEmail({ username: user.username, link }) });
}

router.post('/register', authLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { username, email, phone, password } = parsed.data;
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO users (username, email, phone, password_hash) VALUES ($1, $2, $3, $4)
       RETURNING id, username, email`,
      [username, email, phone, hash]
    );
    // The account exists now even if the email fails; tell the person so they can ask for a new link
    try {
      await sendVerifyEmail(rows[0], req);
    } catch (mailErr) {
      return res.status(201).json({
        message: 'Account created, but we could not send the verification email right now. Use "Send the link again" on the log-in page in a few minutes.',
        email_sent: false,
      });
    }
    res.status(201).json({ message: 'Account created. Check your email (and the spam folder) to verify it.', email_sent: true });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username, email or phone is already registered' });
    }
    throw err;
  }
});

router.post('/verify', async (req, res) => {
  const userId = await consumeAuthToken(req.body.token, 'verify');
  if (!userId) return res.status(400).json({ error: 'This link is invalid or expired' });
  await query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
  res.json({ message: 'Email verified. You can log in now.' });
});

router.post('/resend-verification', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT id, username, email, email_verified FROM users WHERE email = $1', [email]);
  // Same answer whether or not the account exists (and even if sending fails), so nobody can test which
  // emails are registered. A sending problem is still written to the logs.
  if (rows[0] && !rows[0].email_verified) {
    try {
      await sendVerifyEmail(rows[0], req);
    } catch (err) {
      console.error('[auth] resend verification failed:', err.message);
    }
  }
  res.json({ message: 'If that account exists and is not verified, a new email was sent.' });
});

router.post('/login', loginIpLimiter, loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter your email or phone and password' });
  const id = parsed.data.identifier;
  // Decide whether the identifier is an email or a phone number
  const isEmail = id.includes('@');
  const key = isEmail ? id.toLowerCase() : normalizePhone(id);
  const { rows } = await query(
    `SELECT id, username, email, phone, role, email_verified, password_hash, session_version FROM users
     WHERE ${isEmail ? 'email' : 'phone'} = $1`,
    [key]
  );
  const user = rows[0];
  // Same message for unknown user and wrong password, to avoid account enumeration
  const ok = user && (await bcrypt.compare(parsed.data.password, user.password_hash));
  if (!ok) return res.status(401).json({ error: 'Wrong email/phone or password' });
  if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email first' });
  setSessionCookie(res, user.id, user.session_version);
  res.json({ user: { id: user.id, username: user.username, role: user.role } });
});

// Logging out ends every session of this account (all devices, and any copied cookie)
router.post('/logout', async (req, res) => {
  if (req.user) await query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [req.user.id]);
  clearSessionCookie(res);
  res.json({ message: 'Logged out' });
});

router.post('/forgot-password', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { rows } = await query('SELECT id, username, email FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    const raw = await createAuthToken(rows[0].id, 'reset');
    const link = `${publicBaseUrl(req)}/#/reset?token=${raw}`;
    try {
      await sendMail({ to: rows[0].email, ...resetEmail({ username: rows[0].username, link }) });
    } catch (err) {
      console.error('[auth] reset email failed:', err.message); // same answer below, so accounts cannot be discovered
    }
  }
  // Same response either way, so this form cannot be used to discover accounts
  res.json({ message: 'If the email exists, a reset link was sent.' });
});

router.post('/reset-password', authLimiter, async (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
  }
  const userId = await consumeAuthToken(req.body.token, 'reset');
  if (!userId) return res.status(400).json({ error: 'This link is invalid or expired' });
  const hash = await bcrypt.hash(password, 12);
  // New password: every session made with the old one is logged out
  await query('UPDATE users SET password_hash = $1, session_version = session_version + 1 WHERE id = $2', [hash, userId]);
  res.json({ message: 'Password changed. You can log in with the new password.' });
});

module.exports = router;
