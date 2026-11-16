const { query } = require('../db');
const { getNumber } = require('./settings');

// Status of a class, recalculated after every enrolment or payment change:
//   forming  (red)    group class with fewer than class_min_size people
//   payment  (orange) minimum reached, but someone has not paid yet
//   active   (green)  minimum reached and everyone has paid
// One-to-one classes are always active.
// Pass a transaction client when calling inside withTransaction, so the new counts are visible.
async function refreshClassStatus(classId, client = null) {
  const run = (sql, params) => (client ? client.query(sql, params) : query(sql, params));
  const { rows: [cls] } = await run('SELECT class_type FROM classes WHERE id = $1', [classId]);
  if (!cls) return null;

  let status = 'active';
  if (cls.class_type === 'group') {
    const min = await getNumber('class_min_size', 4);
    const { rows: [c] } = await run(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE paid)::int AS paid
       FROM enrollments WHERE class_id = $1 AND status = 'active'`,
      [classId]
    );
    if (c.n < min) status = 'forming';
    else if (c.paid < c.n) status = 'payment';
  }
  await run('UPDATE classes SET status = $2 WHERE id = $1', [classId, status]);
  return status;
}

module.exports = { refreshClassStatus };
