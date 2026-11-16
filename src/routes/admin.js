const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { refreshClassStatus } = require('../services/classStatus');
const { getNumber } = require('../services/settings');
const { isUuid } = require('./public');
const { planPrices } = require('../services/pricing');
const { weeklySessions } = require('../services/schedule');
// Monday-first order for class names ("Monday & Thursday ...")
const DOW_ORDER = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

const router = express.Router();
const adminOnly = [requireAuth, requireRole('admin')];
const SKILLS = ['beginner', 'intermediate', 'professional', 'champion'];

// ---------- Dashboard ----------

router.get('/admin/stats', ...adminOnly, async (_req, res) => {
  const { rows } = await query(`
    SELECT
      (SELECT count(*) FROM users)::int AS users,
      (SELECT count(*) FROM users WHERE role = 'coach')::int AS coaches,
      (SELECT count(*) FROM condos)::int AS condos,
      (SELECT count(*) FROM classes)::int AS classes,
      (SELECT count(*) FROM class_requests WHERE status = 'new')::int AS open_requests,
      (SELECT count(*) FROM ratings WHERE stars < 3)::int AS low_ratings`);
  res.json(rows[0]);
});

// ---------- Condos ----------

const condoSchema = z.object({
  name: z.string({ error: 'Condo name is required' }).trim()
    .min(2, 'Condo name must be at least 2 letters')
    .max(120, 'Condo name is too long (120 characters at most)'),
  address: z.string().trim().max(300, 'Address is too long (300 characters at most)').optional().nullable(),
  // The form sends an empty string when the image is left blank
  // Only http(s) links: a "javascript:" URL in an <img> or link would be unsafe
  image_url: z.union([
    z.literal(''),
    z.string().url().regex(/^https?:\/\//i, 'Image URL must start with http:// or https://'),
  ]).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

// All condos, including hidden ones (students only see published condos)
router.get('/admin/condos', ...adminOnly, async (req, res) => {
  const { rows } = await query(
    `SELECT co.id, co.name, co.address, co.image_url, co.description, co.is_published,
            (SELECT count(*) FROM classes c WHERE c.condo_id = co.id)::int AS class_count
     FROM condos co ORDER BY co.name`
  );
  res.json({ condos: rows });
});

router.post('/admin/condos', ...adminOnly, async (req, res) => {
  const parsed = condoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { rows } = await query(
    'INSERT INTO condos (name, address, image_url, description) VALUES ($1, $2, $3, $4) RETURNING *',
    [d.name, d.address || null, d.image_url || null, d.description || null]
  );
  res.status(201).json({ condo: rows[0] });
});

router.put('/admin/condos/:id', ...adminOnly, async (req, res) => {
  const parsed = condoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { rows } = await query(
    `UPDATE condos SET name = $2, address = $3, image_url = $4, description = $5 WHERE id = $1 RETURNING *`,
    [req.params.id, d.name, d.address || null, d.image_url || null, d.description || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Condo not found' });
  res.json({ condo: rows[0] });
});

// Deleting a condo also deletes its classes, sessions, enrolments and chat (ON DELETE CASCADE)
router.delete('/admin/condos/:id', ...adminOnly, async (req, res) => {
  const { rows } = await query('DELETE FROM condos WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Condo not found' });
  res.json({ message: 'Condo deleted' });
});

// ---------- Classes and sessions ----------

const classSchema = z.object({
  condo_id: z.string().uuid(),
  coach_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(120),
  class_type: z.enum(['one_to_one', 'group']),
  skill_level: z.enum(SKILLS),
  min_age: z.coerce.number().int().min(0).max(120),
  max_age: z.coerce.number().int().min(0).max(120),
  capacity: z.coerce.number().int().min(1).max(200),
  price_cents: z.coerce.number().int().min(0),
  duration_min: z.coerce.number().int().min(15).max(240),
  // 'mixed' = weekdays and weekends together; its price is the average of the two packages
  day_group: z.enum(['weekdays', 'weekends', 'mixed']).optional().nullable(),
  classes_per_month: z.union([z.literal(4), z.literal(8)]).optional().nullable(),
  schedule_text: z.string().trim().max(120).optional().nullable(),
});

router.post('/admin/classes', ...adminOnly, async (req, res) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (parsed.data.min_age > parsed.data.max_age) return res.status(400).json({ error: 'Minimum age cannot be greater than maximum age' });
  const d = parsed.data;
  const { rows } = await query(
    `INSERT INTO classes (condo_id, coach_id, name, class_type, skill_level, min_age, max_age, capacity, price_cents, duration_min,
                          day_group, classes_per_month, schedule_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [d.condo_id, d.coach_id || null, d.name, d.class_type, d.skill_level, d.min_age, d.max_age, d.capacity, d.price_cents, d.duration_min,
     d.day_group || null, d.classes_per_month || null, d.schedule_text || null]
  );
  rows[0].status = await refreshClassStatus(rows[0].id);
  res.status(201).json({ class: rows[0] });
});

router.put('/admin/classes/:id', ...adminOnly, async (req, res) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const d = parsed.data;
  const { rows } = await query(
    `UPDATE classes SET condo_id=$2, coach_id=$3, name=$4, class_type=$5, skill_level=$6, min_age=$7,
            max_age=$8, capacity=$9, price_cents=$10, duration_min=$11,
            day_group=$12, classes_per_month=$13, schedule_text=$14
     WHERE id = $1 RETURNING *`,
    [req.params.id, d.condo_id, d.coach_id || null, d.name, d.class_type, d.skill_level, d.min_age, d.max_age, d.capacity, d.price_cents, d.duration_min,
     d.day_group || null, d.classes_per_month || null, d.schedule_text || null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Class not found' });
  rows[0].status = await refreshClassStatus(rows[0].id);
  res.json({ class: rows[0] });
});

// All classes for the manage list
router.get('/admin/classes', ...adminOnly, async (_req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.class_type, c.skill_level, c.min_age, c.max_age, c.capacity, c.price_cents,
            c.duration_min, c.day_group, c.classes_per_month, c.schedule_text, c.condo_id, c.coach_id,
            co.name AS condo_name, u.username AS coach_name,
            (SELECT count(*) FROM sessions s WHERE s.class_id = c.id)::int AS sessions,
            (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active')::int AS enrolled,
            (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active' AND e.paid)::int AS paid,
            c.status
     FROM classes c
     JOIN condos co ON co.id = c.condo_id
     LEFT JOIN users u ON u.id = c.coach_id
     ORDER BY co.name, c.name`
  );
  // Real package price per person, the same one the condo page shows (price_cents is only a fallback and is 0 for packages)
  for (const c of rows) {
    const prices = await planPrices(c.day_group, c.classes_per_month);
    c.price_per_person_cents = prices ? prices[c.class_type === 'one_to_one' ? '1' : '4-6'] : c.price_cents;
  }
  res.json({ classes: rows, min_size: await getNumber('class_min_size', 4) });
});

// Deleting a class also deletes its sessions, enrolments, attendance and ratings (ON DELETE CASCADE)
router.delete('/admin/classes/:id', ...adminOnly, async (req, res) => {
  const { rows } = await query('DELETE FROM classes WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Class not found' });
  res.json({ message: 'Class deleted' });
});

// Participants of one class with their payment state (for the Payments list)
router.get('/admin/classes/:id/enrollments', ...adminOnly, async (req, res) => {
  const { rows } = await query(
    `SELECT e.id, e.participant_name, e.paid, u.username, u.phone
     FROM enrollments e JOIN users u ON u.id = e.user_id
     WHERE e.class_id = $1 AND e.status = 'active'
     ORDER BY e.created_at`,
    [req.params.id]
  );
  res.json({ enrollments: rows });
});

// Mark a participant as paid (or not). Until online payment is connected, the admin confirms payments here.
router.patch('/admin/enrollments/:id/paid', ...adminOnly, async (req, res) => {
  const parsed = z.object({ paid: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'paid must be true or false' });
  const { rows } = await query(
    'UPDATE enrollments SET paid = $2 WHERE id = $1 RETURNING class_id',
    [req.params.id, parsed.data.paid]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Enrolment not found' });
  const status = await refreshClassStatus(rows[0].class_id);
  res.json({ message: 'Saved', class_status: status });
});

// Add one or many scheduled lessons to a class
router.post('/admin/classes/:id/sessions', ...adminOnly, async (req, res) => {
  const parsed = z
    .object({
      sessions: z
        .array(z.object({ starts_at: z.string().datetime(), ends_at: z.string().datetime() }))
        .min(1)
        .max(200),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Each session needs starts_at and ends_at' });
  if (parsed.data.sessions.some((s) => new Date(s.ends_at) <= new Date(s.starts_at))) {
    return res.status(400).json({ error: 'ends_at must be after starts_at' });
  }
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Class not found' });
  const { rows: found } = await query('SELECT 1 FROM classes WHERE id = $1', [req.params.id]);
  if (!found[0]) return res.status(404).json({ error: 'Class not found' });
  await withTransaction(async (client) => {
    for (const s of parsed.data.sessions) {
      await client.query('INSERT INTO sessions (class_id, starts_at, ends_at) VALUES ($1, $2, $3)', [
        req.params.id,
        s.starts_at,
        s.ends_at,
      ]);
    }
  });
  res.status(201).json({ message: `${parsed.data.sessions.length} session(s) added` });
});

// ---------- Users and roles ----------

router.get('/admin/users', ...adminOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await query(
    `SELECT id, username, email, phone, role, email_verified FROM users
     WHERE $1 = '' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%'
     ORDER BY username LIMIT 100`,
    [q]
  );
  res.json({ users: rows });
});

// Admin turns a student account into a coach (then links the coach to classes above)
router.put('/admin/users/:id/role', ...adminOnly, async (req, res) => {
  const parsed = z.object({ role: z.enum(['student', 'coach', 'admin']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role' });
  // An admin cannot take the admin role away from themselves (they would be locked out of this page)
  if (req.params.id === req.user.id && parsed.data.role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own admin role' });
  }
  const { rows } = await query('UPDATE users SET role = $2 WHERE id = $1 RETURNING id, username, role', [
    req.params.id,
    parsed.data.role,
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ user: rows[0] });
});

// ---------- Requests and ratings ----------

router.get('/admin/class-requests', ...adminOnly, async (_req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.status, r.details, r.created_at, u.username, u.phone, u.email, co.name AS condo_name
     FROM class_requests r JOIN users u ON u.id = r.user_id JOIN condos co ON co.id = r.condo_id
     -- Approved / finished requests leave this list (the class now lives on the Classes page)
     WHERE r.status <> 'done'
     ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json({ requests: rows });
});

// Price list: price per person (RM) for each package and group size
router.get('/admin/price-plans', ...adminOnly, async (_req, res) => {
  const { rows } = await query(
    'SELECT day_group, classes_per_month, group_tier, price_cents FROM price_plans ORDER BY day_group, classes_per_month, group_tier'
  );
  res.json({ plans: rows });
});

router.put('/admin/price-plans', ...adminOnly, async (req, res) => {
  const parsed = z
    .object({
      plans: z
        .array(
          z.object({
            day_group: z.enum(['weekdays', 'weekends']),
            classes_per_month: z.union([z.literal(4), z.literal(8)]),
            group_tier: z.enum(['1', '2', '3', '4-6']),
            rm: z.coerce.number().min(0).max(100000),
          })
        )
        .min(1)
        .max(32),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Each price must be a number from 0 to 100000' });

  await withTransaction(async (client) => {
    for (const p of parsed.data.plans) {
      await client.query(
        `INSERT INTO price_plans (day_group, classes_per_month, group_tier, price_cents) VALUES ($1, $2, $3, $4)
         ON CONFLICT (day_group, classes_per_month, group_tier) DO UPDATE SET price_cents = EXCLUDED.price_cents`,
        [p.day_group, p.classes_per_month, p.group_tier, Math.round(p.rm * 100)]
      );
    }
  });
  res.json({ message: 'Saved' });
});

// Coaches list, for assigning a coach to a proposed class
router.get('/admin/coaches', ...adminOnly, async (_req, res) => {
  const { rows } = await query("SELECT id, username FROM users WHERE role = 'coach' ORDER BY username");
  res.json({ coaches: rows });
});

// Admin edits a student's proposal before publishing it (days, times, level, people, coach)
router.patch('/admin/class-requests/:id/details', ...adminOnly, async (req, res) => {
  const parsed = z
    .object({
      per_week: z.union([z.literal(1), z.literal(2)]),
      days: z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).min(1).max(2),
      skill_level: z.enum(['beginner', 'intermediate', 'professional', 'champion']),
      people: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      coach_id: z.string().uuid().nullable(),
      start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose the class start time').optional(),
      // Only used for proposals that add a new condo
      condo_name: z.string().trim().min(2).max(120).optional(),
      condo_address: z.string().trim().max(300).nullable().optional(),
    })
    .refine((p) => new Set(p.days).size === p.days.length && p.days.length === p.per_week, {
      message: 'Days must match the times per week (one day, or two different days)',
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { rows } = await query(
    `SELECT id FROM class_requests
     WHERE id = $1 AND details->>'kind' = 'new_class' AND details->>'class_id' IS NULL`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Open class proposal not found' });

  const { condo_name, condo_address, ...classFields } = parsed.data;
  const updates = { ...classFields };
  if (condo_name !== undefined) {
    updates.condo_name = condo_name;
    updates.address = condo_address || null;
    // Update the hidden condo row too (only while it is still unpublished)
    await query(
      `UPDATE condos SET name = $2, address = $3
       WHERE id = (SELECT condo_id FROM class_requests WHERE id = $1) AND is_published = FALSE`,
      [req.params.id, condo_name, condo_address || null]
    );
  }
  await query('UPDATE class_requests SET details = details || $2::jsonb WHERE id = $1', [
    req.params.id,
    JSON.stringify(updates),
  ]);
  res.json({ message: 'Saved' });
});

const DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

// Approves a student's new-class proposal: creates the class and publishes it on the condo page
router.post('/admin/class-requests/:id/approve', ...adminOnly, async (req, res) => {
  const { rows } = await query('SELECT * FROM class_requests WHERE id = $1', [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'Request not found' });
  const d = r.details;
  if (d.kind !== 'new_class') return res.status(400).json({ error: 'This request is not a new class proposal' });
  if (d.class_id) return res.status(409).json({ error: 'Already published' });

  // The class is created exactly as the customer asked, including their start time (Malaysia time).
  // Older requests made before the time field existed get the time from the admin when approving.
  const startTime = String(d.start_time || (req.body && req.body.start_time) || '');
  const tm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!tm) return res.status(400).json({ error: 'Choose the class start time' });

  const isPrivate = d.people === 1;
  const weekend = (x) => x === 'sat' || x === 'sun';
  const days = Object.keys(DOW_ORDER).filter((x) => d.days.includes(x)); // Monday first, like the Add class page
  const dayGroup = !days.some(weekend) ? 'weekdays' : days.every(weekend) ? 'weekends' : 'mixed';
  const perMonth = d.per_week === 2 ? 8 : 4;
  const capacity = isPrivate ? 1 : d.people === 5 ? 6 : d.people; // "5 or more" starts with 6 seats
  const duration = isPrivate ? 60 : 40;
  const level = d.skill_level ? ` - ${d.skill_level[0].toUpperCase()}${d.skill_level.slice(1)}` : '';
  const name = `${days.map((x) => DAY_NAMES[x]).join(' & ')} ${isPrivate ? 'Private One to One' : 'Group'}${level}`;
  // Same schedule as a class made on the Add class page: one month of lessons from today
  const sessions = weeklySessions(days, startTime, perMonth, duration);

  const classId = await withTransaction(async (client) => {
    const { rows: [cls] } = await client.query(
      `INSERT INTO classes (condo_id, name, class_type, skill_level, min_age, max_age, capacity, price_cents, duration_min,
                            day_group, classes_per_month, coach_id)
       VALUES ($1, $2, $3, $4, 4, 80, $5, 0, $6, $7, $8, $9) RETURNING id`,
      [r.condo_id, name, isPrivate ? 'one_to_one' : 'group', d.skill_level, capacity, duration, dayGroup, perMonth, d.coach_id || null]
    );
    for (const s of sessions) {
      await client.query('INSERT INTO sessions (class_id, starts_at, ends_at) VALUES ($1, $2, $3)', [cls.id, s.starts_at, s.ends_at]);
    }
    await client.query(
      `UPDATE class_requests SET status = 'done', status_changed_at = now(),
              details = details || jsonb_build_object('class_id', $2::text) WHERE id = $1`,
      [r.id, cls.id]
    );
    // A student-added condo becomes visible when its first class is approved
    await client.query('UPDATE condos SET is_published = TRUE WHERE id = $1', [r.condo_id]);
    await refreshClassStatus(cls.id, client);
    return cls.id;
  });
  res.status(201).json({ message: `Class published with ${sessions.length} sessions`, class_id: classId, sessions: sessions.length });
});

router.patch('/admin/class-requests/:id', ...adminOnly, async (req, res) => {
  const parsed = z.object({ status: z.enum(['new', 'in_progress', 'done', 'rejected']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid status' });

  if (parsed.data.status === 'rejected') {
    // A rejected request is deleted with all its details. Only who was declined and when is kept,
    // for the "wait N days after a decline" rule.
    const deleted = await withTransaction(async (client) => {
      const { rows: [r] } = await client.query('DELETE FROM class_requests WHERE id = $1 RETURNING user_id, condo_id, details', [req.params.id]);
      if (!r) return false;
      if (r.details.kind === 'new_class') {
        await client.query('INSERT INTO class_request_rejections (user_id) VALUES ($1)', [r.user_id]);
      }
      // A condo the student added only for this request goes too (still hidden, no classes, no other requests)
      await client.query(
        `DELETE FROM condos c WHERE c.id = $1 AND c.is_published = FALSE
           AND NOT EXISTS (SELECT 1 FROM classes cl WHERE cl.condo_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM class_requests q WHERE q.condo_id = c.id)`,
        [r.condo_id]
      );
      return true;
    });
    if (!deleted) return res.status(404).json({ error: 'Request not found' });
    return res.json({ message: 'Request rejected and deleted', deleted: true });
  }

  const { rowCount } = await query('UPDATE class_requests SET status = $2, status_changed_at = now() WHERE id = $1', [
    req.params.id,
    parsed.data.status,
  ]);
  if (!rowCount) return res.status(404).json({ error: 'Request not found' });
  res.json({ message: parsed.data.status === 'done' ? 'Marked as done' : 'Updated' });
});

// Admin sees every rating and its reason
router.get('/admin/ratings', ...adminOnly, async (req, res) => {
  const maxStars = Number(req.query.max_stars) || 5;
  const { rows } = await query(
    `SELECT r.stars, r.reason, r.created_at, e.participant_name, c.name AS class_name, coach.username AS coach_name
     FROM ratings r
     JOIN enrollments e ON e.id = r.enrollment_id
     JOIN sessions s ON s.id = r.session_id
     JOIN classes c ON c.id = s.class_id
     JOIN users coach ON coach.id = r.coach_id
     WHERE r.stars <= $1
     ORDER BY r.created_at DESC LIMIT 200`,
    [maxStars]
  );
  res.json({ ratings: rows });
});

module.exports = router;
