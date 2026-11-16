// Demo data for testing: five condos, the academy price list, example classes,
// upcoming sessions and a verified coach account.
// Safe to run more than once: existing items are reused, not duplicated.
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');
const { refreshClassStatus } = require('../src/services/classStatus');

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

// Demo condos. The first one also gets the example classes below.
const CONDOS = [
  { name: 'Demo Sunway Condo', address: 'Jalan Lagoon Demo, Petaling Jaya, Selangor, Malaysia', description: 'Test condo with swimming pool. Demo data for testing only.' },
  { name: 'Demo Bangsar Condo', address: 'Jalan Demo Bangsar, Kuala Lumpur, Malaysia', description: 'Test condo with swimming pool. Demo data for testing only.' },
  { name: 'Demo Mont Kiara Condo', address: 'Jalan Demo Mont Kiara, Kuala Lumpur, Malaysia', description: 'Test condo with swimming pool. Demo data for testing only.' },
  { name: 'Demo Puchong Condo', address: 'Jalan Demo Puchong, Selangor, Malaysia', description: 'Test condo with swimming pool. Demo data for testing only.' },
  { name: 'Demo Subang Condo', address: 'Jalan Demo Subang, Selangor, Malaysia', description: 'Test condo with swimming pool. Demo data for testing only.' },
];

const COACH = {
  username: 'demo_coach',
  email: 'coach@demo.local',
  phone: '+60111111111',
  password: 'Coach12345',
};

// Academy price list (RM, price per person for the package)
const PRICE_LIST = [
  // weekdays, 4 classes a month (once weekly)
  ['weekdays', 4, '1', 580], ['weekdays', 4, '2', 325], ['weekdays', 4, '3', 280], ['weekdays', 4, '4-6', 180],
  // weekdays, 8 classes a month (twice weekly)
  ['weekdays', 8, '1', 1100], ['weekdays', 8, '2', 600], ['weekdays', 8, '3', 500], ['weekdays', 8, '4-6', 320],
  // weekends, 4 classes a month (once weekly)
  ['weekends', 4, '1', 650], ['weekends', 4, '2', 450], ['weekends', 4, '3', 335], ['weekends', 4, '4-6', 220],
  // weekends, 8 classes a month (twice weekly)
  ['weekends', 8, '1', 1100], ['weekends', 8, '2', 700], ['weekends', 8, '3', 550], ['weekends', 8, '4-6', 390],
];

// dows: weekdays of the sessions (0 = Sunday ... 6 = Saturday, Malaysia time).
// Sessions are spread evenly across the days: classes_per_month / number of days per week.
const CLASSES = [
  // Example group, once a week
  { name: 'Monday Group 1:00pm', class_type: 'group', capacity: 6, dows: [1], hour: 13, minute: 0,
    day_group: 'weekdays', classes_per_month: 4, schedule_text: 'Monday 1:00pm–1:40pm', min_age: 4, max_age: 80, skill_level: 'beginner' },
  // Example group, twice a week: weekdays + weekends
  { name: 'Monday & Wednesday Group 6:00pm', class_type: 'group', capacity: 6, dows: [1, 3], hour: 18, minute: 0,
    day_group: 'weekdays', classes_per_month: 8, schedule_text: 'Monday & Wednesday 6:00pm–6:40pm', min_age: 4, max_age: 80, skill_level: 'beginner' },
  // Example weekend group
  { name: 'Saturday Group 2:00pm', class_type: 'group', capacity: 6, dows: [6], hour: 14, minute: 0,
    day_group: 'weekends', classes_per_month: 4, schedule_text: 'Saturday 2:00pm–2:40pm', min_age: 4, max_age: 80, skill_level: 'beginner' },
  // Example one to one, once a week
  { name: 'Tuesday One to One 5:00pm', class_type: 'one_to_one', capacity: 1, dows: [2], hour: 17, minute: 0,
    day_group: 'weekdays', classes_per_month: 4, schedule_text: 'Tuesday 5:00pm–6:00pm', min_age: 4, max_age: 80, skill_level: 'beginner', duration_min: 60 },
];

const DURATION_MIN = 40;
const KL_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Kuala_Lumpur is UTC+8, no daylight saving
const MIN = 60 * 1000;

// Next date (after afterMs) with the given weekday and time in Malaysia time, returned as a UTC timestamp
function nextOccurrence(dow, hour, minute, afterMs) {
  const klNow = new Date(afterMs + KL_OFFSET_MS);
  for (let add = 0; add < 8; add++) {
    const klDay = new Date(Date.UTC(klNow.getUTCFullYear(), klNow.getUTCMonth(), klNow.getUTCDate() + add, hour, minute));
    if (klDay.getUTCDay() === dow) {
      const utc = klDay.getTime() - KL_OFFSET_MS;
      if (utc > afterMs) return utc;
    }
  }
  throw new Error('No occurrence found');
}

(async () => {
  const hash = await bcrypt.hash(COACH.password, 12);
  const { rows: [coach] } = await pool.query(
    `INSERT INTO users (username, email, phone, password_hash, role, email_verified)
     VALUES ($1, $2, $3, $4, 'coach', TRUE)
     ON CONFLICT (email) DO UPDATE SET role = 'coach', email_verified = TRUE
     RETURNING id`,
    [COACH.username, COACH.email, COACH.phone, hash]
  );

  for (const [dayGroup, perMonth, tier, rm] of PRICE_LIST) {
    await pool.query(
      `INSERT INTO price_plans (day_group, classes_per_month, group_tier, price_cents) VALUES ($1, $2, $3, $4)
       ON CONFLICT (day_group, classes_per_month, group_tier) DO UPDATE SET price_cents = EXCLUDED.price_cents`,
      [dayGroup, perMonth, tier, rm * 100]
    );
  }

  let condo = null;
  for (const c of CONDOS) {
    let { rows: [row] } = await pool.query('SELECT id FROM condos WHERE name = $1', [c.name]);
    if (!row) {
      ({ rows: [row] } = await pool.query(
        'INSERT INTO condos (name, address, description) VALUES ($1, $2, $3) RETURNING id',
        [c.name, c.address, c.description]
      ));
    }
    if (!condo) condo = row;
  }

  for (const c of CLASSES) {
    const duration = c.duration_min || DURATION_MIN;
    let { rows: [cls] } = await pool.query('SELECT id FROM classes WHERE condo_id = $1 AND name = $2', [condo.id, c.name]);
    if (!cls) {
      ({ rows: [cls] } = await pool.query(
        `INSERT INTO classes (condo_id, coach_id, name, class_type, skill_level, min_age, max_age, capacity, price_cents, duration_min,
                              day_group, classes_per_month, schedule_text)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12) RETURNING id`,
        [condo.id, coach.id, c.name, c.class_type, c.skill_level, c.min_age, c.max_age, c.capacity, duration,
         c.day_group, c.classes_per_month, c.schedule_text]
      ));
    }
    await refreshClassStatus(cls.id); // forming / payment / active from the current enrolments
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM sessions WHERE class_id = $1', [cls.id]);
    if (n === 0) {
      const perDay = Math.ceil(c.classes_per_month / c.dows.length);
      for (const dow of c.dows) {
        let from = Date.now();
        for (let i = 0; i < perDay; i++) {
          const start = nextOccurrence(dow, c.hour, c.minute, from);
          await pool.query('INSERT INTO sessions (class_id, starts_at, ends_at) VALUES ($1, $2, $3)', [
            cls.id,
            new Date(start),
            new Date(start + duration * MIN),
          ]);
          from = start;
        }
      }
    }
  }

  console.log('Demo data ready: price list, example classes, sessions and coach account.');
  console.log(`Coach login: ${COACH.email} / ${COACH.password}`);
  await pool.end();
})().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await pool.end();
  process.exit(1);
});
