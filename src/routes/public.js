const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const config = require('../config');
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { checkEligibility } = require('../services/eligibility');
const { quote, planPrices } = require('../services/pricing');
const { ageFromDob } = require('../services/age');
const { canUseCondoChat } = require('../services/chat');
const { getNumber } = require('../services/settings');
const { checkProposalLimit } = require('../services/proposals');
const { refreshClassStatus } = require('../services/classStatus');

const router = express.Router();

const SKILLS = ['beginner', 'intermediate', 'professional', 'champion'];
// A participant gives a date of birth; the age is calculated from it on the server.
const participantSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required').optional(),
    age: z.coerce.number().int().min(1).max(120).optional(),
    skill_level: z.enum(SKILLS),
    family_member_id: z.string().uuid().optional(),
  })
  .refine((p) => p.date_of_birth || p.age, { message: 'Date of birth is required' })
  .transform((p) => ({ ...p, age: p.date_of_birth ? ageFromDob(p.date_of_birth) : p.age }))
  .refine((p) => p.age >= 1 && p.age <= 120, { message: 'Date of birth is not valid' });
const participantsSchema = z.array(participantSchema).min(1).max(10);

// ---------- Condos ----------

// Search condos by name (the home-page search bar, also used while typing).
// Names that START with the text come first. If no name starts with it, names that contain it are returned.
router.get('/condos', async (req, res) => {
  // % and _ are LIKE wildcards: escape them (and the escape character) so they match literally
  const q = String(req.query.q || '').trim().replace(/[\\%_]/g, '\\$&');
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const { rows } = await query(
    `SELECT id, name, address, image_url FROM condos
     WHERE is_published AND ($1 = '' OR name ILIKE $1 || '%'
       OR (NOT EXISTS (SELECT 1 FROM condos c2 WHERE c2.is_published AND c2.name ILIKE $1 || '%')
           AND name ILIKE '%' || $1 || '%'))
     ORDER BY (name ILIKE $1 || '%') DESC, name LIMIT $2`,
    [q, limit]
  );
  res.json({ condos: rows });
});

// Condo page: name, image and the classes running in it, with seats left and next session
router.get('/condos/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Condo not found' });
  const { rows: condos } = await query(
    'SELECT id, name, address, image_url, description, is_published FROM condos WHERE id = $1',
    [req.params.id]
  );
  // Condos waiting for approval are only visible to admins
  if (!condos[0] || (!condos[0].is_published && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'Condo not found' });
  }
  const type = req.query.type; // optional: one_to_one | group
  const { rows: classes } = await query(
    `SELECT c.id, c.name, c.class_type, c.skill_level, c.min_age, c.max_age, c.capacity, c.price_cents, c.duration_min,
            c.day_group, c.classes_per_month, c.schedule_text, c.status,
            (SELECT json_agg(t.starts_at ORDER BY t.starts_at)
               FROM (SELECT starts_at FROM sessions WHERE class_id = c.id AND starts_at > now() ORDER BY starts_at LIMIT 8) t
            ) AS upcoming_times,
            u.username AS coach_name,
            (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS enrolled,
            (SELECT min(s.starts_at) FROM sessions s WHERE s.class_id = c.id AND s.starts_at > now()) AS next_session_at
     FROM classes c
     LEFT JOIN users u ON u.id = c.coach_id
     WHERE c.condo_id = $1 AND ($2::text IS NULL OR c.class_type = $2)
     ORDER BY c.name`,
    [req.params.id, type || null]
  );
  for (const k of classes) k.prices = await planPrices(k.day_group, k.classes_per_month);
  res.json({
    condo: condos[0],
    classes,
    min_size: await getNumber('class_min_size', 4),
    can_chat: await canUseCondoChat(req.user, req.params.id),
  });
});

// ---------- Joining a class ----------

// Step 1 of joining: check each participant against the class rules and capacity (no booking yet)
router.post('/classes/:id/eligibility', requireAuth, async (req, res) => {
  const parsed = participantsSchema.safeParse(req.body.participants);
  if (!parsed.success) return res.status(400).json({ error: 'Add at least one participant with name, age and level' });
  const cls = await loadClassWithCount(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });

  const results = parsed.data.map((p) => ({ name: p.name, ...checkEligibility(cls, p) }));
  const price = await quote(cls, parsed.data.length);
  const seatsLeft = Math.max(cls.capacity - cls.enrolled, 0);
  const full = seatsLeft < parsed.data.length;
  res.json({
    class_name: cls.name,
    condo_id: cls.condo_id,
    eligible: results.every((r) => r.eligible) && !full,
    full,
    seats_left: seatsLeft,
    price_cents: price.total_cents,
    price_per_person_cents: price.per_person_cents,
    participants: results,
  });
});

// Step 2: enroll after eligibility passed and payment succeeded
router.post('/classes/:id/enroll', requireAuth, async (req, res) => {
  const parsed = participantsSchema.safeParse(req.body.participants);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid participants' });
  const unit = String(req.body.unit_number || '').trim();
  if (!unit || unit.length > 20) return res.status(400).json({ error: 'Unit number is required' });
  const invite = req.body.invite ? String(req.body.invite).trim() : null;

  // Payment (Visa) is not wired yet. In production we refuse rather than enroll people for free.
  if (config.env === 'production') {
    return res.status(501).json({ error: 'Payment provider is not configured yet' });
  }

  try {
    const enrolled = await withTransaction(async (client) => {
      const { rows: classRows } = await client.query('SELECT * FROM classes WHERE id = $1 FOR UPDATE', [req.params.id]);
      const cls = classRows[0];
      if (!cls) throw httpError(404, 'Class not found');

      const { rows: count } = await client.query(
        "SELECT count(*)::int AS n FROM enrollments WHERE class_id = $1 AND status = 'active'",
        [cls.id]
      );
      const seatsLeft = Math.max(cls.capacity - count[0].n, 0);
      if (seatsLeft < parsed.data.length) {
        throw httpError(409, seatsLeft ? `Only ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left in this class` : 'This class is full');
      }

      // Invited joins: only a group class, only a new person (the account has no active class yet), not the inviter
      let inviter = null;
      if (invite) {
        inviter = await checkInvite(client, invite, cls, req.user.id);
      }

      const out = [];
      for (const p of parsed.data) {
        const verdict = checkEligibility(cls, p);
        if (!verdict.eligible) throw httpError(422, `${p.name}: ${verdict.reason}`);
        if (p.family_member_id) {
          const { rows: owned } = await client.query(
            'SELECT 1 FROM family_members WHERE id = $1 AND owner_id = $2',
            [p.family_member_id, req.user.id]
          );
          if (!owned[0]) throw httpError(403, 'Family member not found on your account');
        }
        const { rows } = await client.query(
          `INSERT INTO enrollments (class_id, user_id, family_member_id, participant_name, unit_number, referred_by)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (class_id, user_id, participant_name) DO NOTHING
           RETURNING id, participant_name`,
          [cls.id, req.user.id, p.family_member_id || null, p.name, unit, inviter ? inviter.id : null]
        );
        if (rows[0]) out.push(rows[0]);
      }
      // Recalculate forming / payment / active now that the counts changed
      await refreshClassStatus(cls.id, client);
      return out;
    });
    res.status(201).json({ message: 'You are enrolled', enrollments: enrolled });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// Checks an invite code for joining `cls` and returns the inviter's enrolment (throws 4xx if not allowed)
async function checkInvite(client, code, cls, userId) {
  const { rows } = await client.query(
    `SELECT e.id, e.user_id, e.class_id, e.participant_name, e.status
     FROM enrollments e WHERE e.invite_code = $1`,
    [code]
  );
  const inviter = rows[0];
  if (!inviter || inviter.status !== 'active' || inviter.class_id !== cls.id) {
    throw httpError(404, 'This invite link is not valid for this class');
  }
  if (cls.class_type !== 'group') throw httpError(422, 'Invites are only for group classes');
  if (inviter.user_id === userId) throw httpError(422, 'You cannot use your own invite link');
  const { rows: active } = await client.query(
    "SELECT 1 FROM enrollments WHERE user_id = $1 AND status = 'active' LIMIT 1",
    [userId]
  );
  if (active[0]) throw httpError(422, 'Invites are only for new people. Your account already has a class.');
  return inviter;
}

// Create or reuse the invite link of one of my group enrolments
router.post('/me/enrollments/:id/invite', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.invite_code, c.class_type FROM enrollments e JOIN classes c ON c.id = e.class_id
     WHERE e.id = $1 AND e.user_id = $2 AND e.status = 'active'`,
    [req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Class not found on your account' });
  if (rows[0].class_type !== 'group') return res.status(422).json({ error: 'Invites are only for group classes' });
  let code = rows[0].invite_code;
  if (!code) {
    code = crypto.randomBytes(5).toString('hex');
    await query('UPDATE enrollments SET invite_code = $2 WHERE id = $1', [req.params.id, code]);
  }
  res.json({ code, link: `${config.appUrl}/#/invite/${code}` });
});

// What an invite link offers: the class, and whether this account can accept it
router.get('/invites/:code', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.class_id, e.status, e.participant_name AS inviter_name, c.name AS class_name, c.class_type,
            c.skill_level, c.min_age, c.max_age, c.capacity, c.status AS class_status, c.day_group, c.classes_per_month,
            co.name AS condo_name,
            (SELECT count(*) FROM enrollments x WHERE x.class_id = c.id AND x.status = 'active')::int AS enrolled,
            e.user_id = $2 AS is_me
     FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN condos co ON co.id = c.condo_id
     WHERE e.invite_code = $1`,
    [req.params.code, req.user.id]
  );
  const inv = rows[0];
  if (!inv || inv.status !== 'active') return res.status(404).json({ error: 'This invite link is not valid' });
  let reason = null;
  if (inv.class_type !== 'group') reason = 'Invites are only for group classes';
  else if (inv.is_me) reason = 'This is your own invite link';
  else {
    const { rows: active } = await query(
      "SELECT 1 FROM enrollments WHERE user_id = $1 AND status = 'active' LIMIT 1",
      [req.user.id]
    );
    if (active[0]) reason = 'Invites are only for new people. Your account already has a class.';
  }
  const price = await quote({ ...inv, id: inv.class_id, price_cents: 0, class_type: inv.class_type }, 4);
  res.json({
    class_id: inv.class_id,
    class_name: inv.class_name,
    condo_name: inv.condo_name,
    skill_level: inv.skill_level,
    min_age: inv.min_age,
    max_age: inv.max_age,
    seats_left: Math.max(inv.capacity - inv.enrolled, 0),
    class_status: inv.class_status,
    inviter_name: inv.inviter_name,
    price_per_person_cents: price.per_person_cents,
    can_accept: !reason,
    reason,
  });
});

// My referrals: people who joined with my invite link, and the free months I have earned.
// One free month per CLASS (not per person): the class is confirmed (active) and it would not have
// reached the minimum size without the people I invited.
router.get('/me/referrals', requireAuth, async (req, res) => {
  const min = await getNumber('class_min_size', 4);
  const { rows } = await query(
    `SELECT e2.participant_name, e2.paid, e2.class_id, c.name AS class_name, c.status AS class_status,
            e1.participant_name AS inviter_name,
            (SELECT count(*) FROM enrollments x WHERE x.class_id = c.id AND x.status = 'active' AND x.referred_by IS NULL)::int AS direct_members
     FROM enrollments e1
     JOIN enrollments e2 ON e2.referred_by = e1.id AND e2.status = 'active'
     JOIN classes c ON c.id = e2.class_id
     WHERE e1.user_id = $1
     ORDER BY e2.created_at`,
    [req.user.id]
  );
  const earnedClasses = new Set(
    rows.filter((r) => r.class_status === 'active' && r.direct_members < min).map((r) => r.class_id)
  );
  res.json({ invited: rows, free_months: earnedClasses.size, min_size: min });
});

// "Create a class" request for people who are not eligible for any open class
router.post('/class-requests', requireAuth, async (req, res) => {
  const schema = z.object({
    condo_id: z.string().uuid(),
    participants: participantsSchema,
    unit_number: z.string().trim().min(1).max(20),
    days: z.enum(['once_a_week', 'twice_a_week']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Please fill in all fields' });
  await query('INSERT INTO class_requests (user_id, condo_id, details) VALUES ($1, $2, $3)', [
    req.user.id,
    parsed.data.condo_id,
    JSON.stringify(parsed.data),
  ]);
  res.status(201).json({
    message: 'We will work on your group make it start as soon as possible',
  });
});

// Student proposes a new class in a condo. The academy approves it, then it appears on the condo page.
const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const proposalSchema = z
  .object({
    per_week: z.union([z.literal(1), z.literal(2)]),
    unit_number: z.string().trim().min(1).max(20),
    days: z
      .array(z.enum(DAY_CODES))
      .min(1, 'Choose one day for once a week, or two different days for twice a week')
      .max(2, 'Choose one day for once a week, or two different days for twice a week'),
    skill_level: z.enum(SKILLS),
    people: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), // 5 = 5 or more
    // Class start time in Malaysia time, "HH:MM". The class is created with this time when approved.
    start_time: z.string({ error: 'Choose the class start time' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose the class start time'),
  })
  .refine((p) => new Set(p.days).size === p.days.length && p.days.length === p.per_week, {
    message: 'Choose one day for once a week, or two different days for twice a week',
  });

router.post('/condos/:id/class-proposals', requireAuth, async (req, res) => {
  const parsed = proposalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { rows } = await query('SELECT id FROM condos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Condo not found' });

  // Wait after a decline, and the limit on waiting requests (both set in the admin page)
  const blocked = await checkProposalLimit(req.user.id);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  await query(
    `INSERT INTO class_requests (user_id, condo_id, details) VALUES ($1, $2, $3)`,
    [req.user.id, req.params.id, JSON.stringify({ kind: 'new_class', ...parsed.data })]
  );
  res.status(201).json({
    message: 'We will work on your group, make it start as soon as possible. It will appear on this condo page shortly after the academy approves it.',
  });
});

// Student adds a condo that is not in the app, together with a class proposal.
// The condo stays hidden until the academy approves it.
router.post('/condo-proposals', requireAuth, async (req, res) => {
  const condoPart = z
    .object({
      condo_name: z.string().trim().min(2, 'Enter the condo name').max(120),
      address: z.string().trim().max(300).optional(),
    })
    .safeParse(req.body);
  if (!condoPart.success) return res.status(400).json({ error: condoPart.error.issues[0].message });
  const classPart = proposalSchema.safeParse(req.body);
  if (!classPart.success) return res.status(400).json({ error: classPart.error.issues[0].message });

  const { rows: existing } = await query(
    'SELECT id FROM condos WHERE lower(name) = lower($1) AND is_published',
    [condoPart.data.condo_name]
  );
  if (existing[0]) {
    return res.status(409).json({ error: 'This condo is already in the app. Search for it on the home page.' });
  }
  const blocked = await checkProposalLimit(req.user.id);
  if (blocked) return res.status(blocked.status).json({ error: blocked.error });

  await withTransaction(async (client) => {
    const { rows: [condo] } = await client.query(
      'INSERT INTO condos (name, address, is_published) VALUES ($1, $2, FALSE) RETURNING id',
      [condoPart.data.condo_name, condoPart.data.address || null]
    );
    await client.query('INSERT INTO class_requests (user_id, condo_id, details) VALUES ($1, $2, $3)', [
      req.user.id,
      condo.id,
      JSON.stringify({
        kind: 'new_class',
        new_condo: true,
        condo_name: condoPart.data.condo_name,
        address: condoPart.data.address || null,
        ...classPart.data,
      }),
    ]);
  });
  res.status(201).json({
    message: 'We will work on your group, make it start as soon as possible. Your condo and class will appear in the app shortly after the academy approves them.',
  });
});

// Academy price list, for showing the package price while a student fills the add-class form
router.get('/price-plans', async (_req, res) => {
  const { rows } = await query('SELECT day_group, classes_per_month, group_tier, price_cents FROM price_plans');
  const plans = {};
  for (const r of rows) {
    const key = `${r.day_group}-${r.classes_per_month}`;
    plans[key] = plans[key] || {};
    plans[key][r.group_tier] = r.price_cents;
  }
  res.json({ plans });
});

// ---------- Student profile ----------

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.get('/me/family', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT id, full_name, age, skill_level, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth
     FROM family_members WHERE owner_id = $1 ORDER BY created_at`,
    [req.user.id]
  );
  res.json({ members: rows });
});

router.post('/me/family', requireAuth, async (req, res) => {
  const parsed = z
    .object({
      full_name: z.string({ error: 'Name is required' }).trim()
        .min(1, 'Name is required')
        .max(80, 'Name is too long (80 characters at most)'),
      date_of_birth: z.string({ error: 'Date of birth is required' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required'),
      skill_level: z.enum(SKILLS, { error: 'Choose a swimming level' }),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const age = ageFromDob(parsed.data.date_of_birth);
  if (!(age >= 1 && age <= 120)) return res.status(400).json({ error: 'Date of birth is not valid' });
  const { rows } = await query(
    `INSERT INTO family_members (owner_id, full_name, age, skill_level, date_of_birth) VALUES ($1, $2, $3, $4, $5)
     RETURNING id, full_name, age, skill_level, to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth`,
    [req.user.id, parsed.data.full_name, age, parsed.data.skill_level, parsed.data.date_of_birth]
  );
  res.status(201).json({ member: rows[0] });
});

router.delete('/me/family/:id', requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Family member not found' });
  const { rowCount } = await query('DELETE FROM family_members WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  if (!rowCount) return res.status(404).json({ error: 'Family member not found' });
  res.json({ message: 'Removed' });
});

// My classes: upcoming sessions with a countdown target, plus my attendance and ratings
router.get('/me/classes', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT e.id AS enrollment_id, e.participant_name, c.id AS class_id, c.name AS class_name,
            co.name AS condo_name, u.username AS coach_name,
            s.id AS session_id, s.starts_at, s.ends_at,
            a.status AS attendance_status,
            r.stars AS rating_stars, r.reason AS rating_reason,
            rv.will_attend AS rsvp_will_attend, rv.reason AS rsvp_reason, c.class_type, e.invite_code, c.status AS class_status, e.paid
     FROM enrollments e
     JOIN classes c ON c.id = e.class_id
     JOIN condos co ON co.id = c.condo_id
     LEFT JOIN users u ON u.id = c.coach_id
     JOIN sessions s ON s.class_id = c.id AND s.ends_at > now() - interval '1 day'
     LEFT JOIN attendance a ON a.session_id = s.id AND a.enrollment_id = e.id
     LEFT JOIN ratings r ON r.session_id = s.id AND r.enrollment_id = e.id
     LEFT JOIN session_rsvps rv ON rv.session_id = s.id AND rv.enrollment_id = e.id
     WHERE e.user_id = $1 AND e.status = 'active'
     ORDER BY s.starts_at
     LIMIT 100`,
    [req.user.id]
  );
  res.json({ sessions: rows });
});

// "Will you attend this session?" answer, for an upcoming session of one of my enrolments
router.put('/me/sessions/:sessionId/rsvp/:enrollmentId', requireAuth, async (req, res) => {
  const parsed = z.object({
    will_attend: z.boolean({ error: 'Choose yes or no' }),
    // Optional, only for "No". Left out = keep the reason already saved; empty = remove it.
    reason: z.string().trim().max(300, 'Reason is too long (300 characters at most)').optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { will_attend: willAttend, reason } = parsed.data;
  const { rows } = await query(
    `SELECT s.id FROM sessions s
     JOIN enrollments e ON e.class_id = s.class_id
     WHERE s.id = $1 AND e.id = $2 AND e.user_id = $3 AND e.status = 'active' AND s.ends_at > now()`,
    [req.params.sessionId, req.params.enrollmentId, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Session not found or already finished' });
  // "Yes" clears any reason. "No" sets the reason when one is sent, otherwise keeps the saved one.
  const newReason = willAttend ? null : reason === undefined ? undefined : reason || null;
  await query(
    `INSERT INTO session_rsvps (session_id, enrollment_id, will_attend, reason) VALUES ($1, $2, $3, $4)
     ON CONFLICT (session_id, enrollment_id) DO UPDATE SET
       will_attend = EXCLUDED.will_attend,
       reason = CASE WHEN $5 THEN EXCLUDED.reason ELSE session_rsvps.reason END,
       updated_at = now()`,
    [req.params.sessionId, req.params.enrollmentId, willAttend, newReason ?? null, newReason !== undefined]
  );
  res.json({ message: reason ? 'Reason saved' : 'Saved' });
});

// Shared helpers
async function loadClassWithCount(classId) {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS enrolled
     FROM classes c WHERE c.id = $1`,
    [classId]
  );
  return rows[0];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return UUID_RE.test(String(v || ''));
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { router, httpError, isUuid };
