const express = require('express');
const { z } = require('zod');
const { query } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getRetentionDays, purgeOldMessages, canUseCondoChat } = require('../services/chat');
const { getNumber, setNumber } = require('../services/settings');

const router = express.Router();

// Messages of a condo, oldest first.
// - First load (no ?after): the newest 200 messages + the retention setting.
// - Polling (?after=<created_at of the last message the browser has>): only messages newer than that.
//   The browser asks every few seconds, so this keeps each poll to one small indexed read.
// Expired messages are deleted by the hourly purge in server.js; until then they are filtered out here.
router.get('/condos/:id/chat', requireAuth, async (req, res) => {
  if (!(await canUseCondoChat(req.user, req.params.id))) {
    return res.status(403).json({ error: 'The chat is for people who joined or requested a class in this condo' });
  }
  const days = await getRetentionDays();
  const after = req.query.after ? new Date(String(req.query.after)) : null;
  if (after && !Number.isNaN(after.getTime())) {
    // created_at has microseconds but the browser only knows milliseconds, so the last message
    // can come back once more; the browser skips ids it already shows.
    const { rows } = await query(
      `SELECT m.id, m.body, m.created_at, m.user_id, u.username, u.role
       FROM condo_messages m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.condo_id = $1 AND m.created_at >= $2
         AND m.created_at > now() - make_interval(days => $3::int)
       ORDER BY m.created_at ASC LIMIT 200`,
      [req.params.id, after, days]
    );
    return res.json({ messages: rows });
  }
  const { rows } = await query(
    `SELECT m.id, m.body, m.created_at, m.user_id, u.username, u.role
     FROM condo_messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.condo_id = $1 AND m.created_at > now() - make_interval(days => $2::int)
     ORDER BY m.created_at DESC LIMIT 200`,
    [req.params.id, days]
  );
  res.json({ messages: rows.reverse(), retention_days: days });
});

router.post('/condos/:id/chat', requireAuth, async (req, res) => {
  const parsed = z.object({ body: z.string().trim().min(1).max(500) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Write a message (up to 500 characters)' });
  if (!(await canUseCondoChat(req.user, req.params.id))) {
    return res.status(403).json({ error: 'The chat is for people who joined or requested a class in this condo' });
  }
  await query('INSERT INTO condo_messages (condo_id, user_id, body) VALUES ($1, $2, $3)', [
    req.params.id,
    req.user.id,
    parsed.data.body,
  ]);
  res.status(201).json({ message: 'Sent' });
});

// Admin: all editable settings
router.get('/admin/settings', requireAuth, requireRole('admin'), async (_req, res) => {
  res.json({
    chat_retention_days: await getRetentionDays(),
    class_request_limit: await getNumber('class_request_limit', 2),
    class_request_wait_days: await getNumber('class_request_wait_days', 15),
  });
});

// Admin: how many new-class requests a student can have waiting, and after how many days they can try again
router.put('/admin/settings/class-requests', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(20),
      days: z.coerce.number().int().min(1).max(365),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Limit must be 1 to 20, days must be 1 to 365' });
  await setNumber('class_request_limit', parsed.data.limit);
  await setNumber('class_request_wait_days', parsed.data.days);
  res.json({ class_request_limit: parsed.data.limit, class_request_wait_days: parsed.data.days });
});

// Admin: change how many days chat messages are kept
router.put('/admin/settings/chat-retention', requireAuth, requireRole('admin'), async (req, res) => {
  const parsed = z.object({ days: z.coerce.number().int().min(1).max(365) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a number of days between 1 and 365' });
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('chat_retention_days', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [String(parsed.data.days)]
  );
  await purgeOldMessages();
  res.json({ chat_retention_days: parsed.data.days });
});

module.exports = router;
