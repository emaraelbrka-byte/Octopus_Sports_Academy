const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { z } = require('zod');
const config = require('../config');
const { query, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { httpError } = require('./public');

const router = express.Router();

// Check-in is open from 30 minutes before the start until the class ends
const CHECKIN_OPENS_BEFORE_MIN = 30;

// Returns the session if the user is an admin or the coach of its class, otherwise throws 403/404.
async function assertCanManageSession(user, sessionId) {
  const { rows } = await query(
    `SELECT s.*, c.coach_id, c.name AS class_name FROM sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`,
    [sessionId]
  );
  const session = rows[0];
  if (!session) throw httpError(404, 'Session not found');
  if (user.role !== 'admin' && session.coach_id !== user.id) throw httpError(403, 'This is not your class');
  return session;
}

// ---------- Coach: sessions and QR ----------

router.get('/coach/sessions', requireAuth, requireRole('coach', 'admin'), async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.starts_at, s.ends_at, c.id AS class_id, c.name AS class_name, co.name AS condo_name,
            c.status,
            (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS enrolled,
            (SELECT count(*) FROM session_rsvps rv WHERE rv.session_id = s.id AND rv.will_attend)::int AS will_attend,
            (SELECT count(*) FROM session_rsvps rv WHERE rv.session_id = s.id AND NOT rv.will_attend)::int AS will_not_attend
     FROM sessions s
     JOIN classes c ON c.id = s.class_id
     JOIN condos co ON co.id = c.condo_id
     WHERE ($1 = 'admin' OR c.coach_id = $2) AND s.ends_at > now() - interval '1 day'
     ORDER BY s.starts_at LIMIT 100`,
    [req.user.role, req.user.id]
  );
  res.json({ sessions: rows });
});

// The class's check-in QR. It is created once and stays the same; students scan it for any session of the class.
router.post('/coach/sessions/:id/qr', requireAuth, requireRole('coach', 'admin'), async (req, res) => {
  const session = await assertCanManageSession(req.user, req.params.id);
  const { rows } = await query(
    `UPDATE classes SET qr_token = COALESCE(qr_token, $2) WHERE id = $1 RETURNING qr_token`,
    [session.class_id, crypto.randomBytes(16).toString('hex')]
  );
  const url = `${config.appUrl}/#/checkin?token=${rows[0].qr_token}`;
  const png = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  res.json({ qr_image: png, class_name: session.class_name });
});

router.get('/coach/sessions/:id/roster', requireAuth, requireRole('coach', 'admin'), async (req, res) => {
  const session = await assertCanManageSession(req.user, req.params.id);
  const { rows } = await query(
    `SELECT e.id AS enrollment_id, e.participant_name, a.status AS attendance_status, a.method,
            a.checked_in_at, r.stars, r.reason, rv.will_attend, rv.reason AS rsvp_reason
     FROM enrollments e
     JOIN sessions s ON s.class_id = e.class_id
     LEFT JOIN attendance a ON a.session_id = s.id AND a.enrollment_id = e.id
     LEFT JOIN ratings r ON r.session_id = s.id AND r.enrollment_id = e.id
     LEFT JOIN session_rsvps rv ON rv.session_id = s.id AND rv.enrollment_id = e.id
     WHERE s.id = $1 AND e.status = 'active'
     ORDER BY e.participant_name`,
    [req.params.id]
  );
  res.json({ session: { id: session.id, starts_at: session.starts_at, class_name: session.class_name }, roster: rows });
});

// Emergency fallback when a student has no phone or the QR cannot be scanned
router.post('/coach/sessions/:id/attendance', requireAuth, requireRole('coach', 'admin'), async (req, res) => {
  const parsed = z
    .object({
      enrollment_id: z.string().uuid(),
      status: z.enum(['on_time', 'late', 'absent']),
      note: z.string().max(300).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid attendance data' });
  await assertCanManageSession(req.user, req.params.id);
  await query(
    `INSERT INTO attendance (session_id, enrollment_id, status, method, checked_in_at, marked_by, note)
     VALUES ($1, $2, $3, 'manual', CASE WHEN $3 = 'absent' THEN NULL ELSE now() END, $4, $5)
     ON CONFLICT (session_id, enrollment_id)
     DO UPDATE SET status = EXCLUDED.status, method = 'manual', marked_by = EXCLUDED.marked_by, note = EXCLUDED.note`,
    [req.params.id, parsed.data.enrollment_id, parsed.data.status, req.user.id, parsed.data.note || null]
  );
  res.json({ message: 'Attendance saved' });
});

// Coach rates students after the session. Reason is required for anything below 3 stars.
router.post('/coach/sessions/:id/ratings', requireAuth, requireRole('coach', 'admin'), async (req, res) => {
  const parsed = z
    .object({
      ratings: z
        .array(
          z.object({
            enrollment_id: z.string().uuid(),
            stars: z.coerce.number().int().min(1).max(5),
            reason: z.string().trim().max(500).optional(),
          })
        )
        .min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid ratings' });
  for (const r of parsed.data.ratings) {
    if (r.stars < 3 && !(r.reason && r.reason.length)) {
      return res.status(400).json({ error: 'A reason is required for ratings below 3 stars' });
    }
  }
  const session = await assertCanManageSession(req.user, req.params.id);
  await withTransaction(async (client) => {
    for (const r of parsed.data.ratings) {
      await client.query(
        `INSERT INTO ratings (session_id, enrollment_id, coach_id, stars, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (session_id, enrollment_id)
         DO UPDATE SET stars = EXCLUDED.stars, reason = EXCLUDED.reason, coach_id = EXCLUDED.coach_id`,
        [session.id, r.enrollment_id, req.user.id, r.stars, r.stars >= 3 ? null : r.reason]
      );
    }
  });
  res.json({ message: 'Ratings saved' });
});

// ---------- Student: scan the QR ----------

// Body: { token, enrollment_ids?: [] } - defaults to every active participant on the account
router.post('/attendance/checkin', requireAuth, async (req, res) => {
  const token = String(req.body.token || '');
  if (!/^[a-f0-9]{32}$/.test(token)) return res.status(400).json({ error: 'Invalid QR code' });

  // The QR belongs to the class; find its next session that has not ended yet
  const { rows: found } = await query(
    `SELECT s.id, s.class_id, s.starts_at, s.ends_at, c.name AS class_name
     FROM classes c JOIN sessions s ON s.class_id = c.id
     WHERE c.qr_token = $1 AND s.ends_at > now()
     ORDER BY s.starts_at LIMIT 1`,
    [token]
  );
  if (!found[0]) return res.status(410).json({ error: 'No class is open for check-in right now' });
  const session = found[0];
  const now = Date.now();
  if (now < new Date(session.starts_at).getTime() - CHECKIN_OPENS_BEFORE_MIN * 60000) {
    return res.status(425).json({ error: 'Check-in opens 30 minutes before the class' });
  }

  const lateCutoff = new Date(session.starts_at).getTime() + config.lateAfterMinutes * 60000;
  const status = now > lateCutoff ? 'late' : 'on_time';

  const { rows: mine } = await query(
    `SELECT id, participant_name FROM enrollments
     WHERE class_id = $1 AND user_id = $2 AND status = 'active'
       AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[]))`,
    [session.class_id, req.user.id, Array.isArray(req.body.enrollment_ids) ? req.body.enrollment_ids : null]
  );
  if (!mine.length) return res.status(403).json({ error: 'You are not enrolled in this class' });

  for (const e of mine) {
    await query(
      `INSERT INTO attendance (session_id, enrollment_id, status, method, checked_in_at)
       VALUES ($1, $2, $3, 'qr', now())
       ON CONFLICT (session_id, enrollment_id) DO NOTHING`,
      [session.id, e.id, status]
    );
  }
  res.json({
    message: status === 'late' ? 'Checked in - you are late' : 'Checked in - on time',
    status,
    participants: mine.map((m) => m.participant_name),
  });
});

module.exports = router;
