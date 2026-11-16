const crypto = require('crypto');
const { query } = require('../db');

const TTL_MS = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

// Creates a random one-time token, stores only its hash, and returns the raw token for the email link.
async function createAuthToken(userId, purpose) {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  // Invalidate older unused tokens of the same purpose
  await query('UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [userId, purpose]);
  await query(
    'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, purpose, hash, new Date(Date.now() + TTL_MS[purpose])]
  );
  return raw;
}

// Consumes a token and returns the user id, or null if invalid, expired or already used.
async function consumeAuthToken(raw, purpose) {
  const hash = crypto.createHash('sha256').update(String(raw || '')).digest('hex');
  const { rows } = await query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hash, purpose]
  );
  return rows[0] ? rows[0].user_id : null;
}

module.exports = { createAuthToken, consumeAuthToken };
