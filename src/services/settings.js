const { query } = require('../db');

// Reads a positive number from app_settings, or returns the fallback if missing/invalid
async function getNumber(key, fallback) {
  const { rows } = await query('SELECT value FROM app_settings WHERE key = $1', [key]);
  const n = Number(rows[0] && rows[0].value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function setNumber(key, value) {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}

module.exports = { getNumber, setNumber };
