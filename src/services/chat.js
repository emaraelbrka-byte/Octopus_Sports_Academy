const { query } = require('../db');

async function getRetentionDays() {
  const { rows } = await query("SELECT value FROM app_settings WHERE key = 'chat_retention_days'");
  return Number(rows[0] && rows[0].value) || 15;
}

// Deletes messages older than the retention period. Runs on every chat read and once an hour.
async function purgeOldMessages() {
  const days = await getRetentionDays();
  const { rowCount } = await query(
    "DELETE FROM condo_messages WHERE created_at < now() - make_interval(days => $1::int)",
    [days]
  );
  return rowCount;
}

// Chat is open to: admins, coaches with a class in the condo, students enrolled in a class there,
// and people who sent a class request for that condo.
async function canUseCondoChat(user, condoId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const { rows } = await query(
    `SELECT (
        EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON c.id = e.class_id
                WHERE e.user_id = $1 AND c.condo_id = $2 AND e.status = 'active')
     OR EXISTS (SELECT 1 FROM classes c WHERE c.coach_id = $1 AND c.condo_id = $2)
     OR EXISTS (SELECT 1 FROM class_requests r WHERE r.user_id = $1 AND r.condo_id = $2)
     ) AS ok`,
    [user.id, condoId]
  );
  return rows[0].ok;
}

module.exports = { getRetentionDays, purgeOldMessages, canUseCondoChat };
