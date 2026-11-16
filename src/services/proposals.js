const { query } = require('../db');
const { getNumber } = require('./settings');

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric' });

// Returns null if the student may send a new class proposal, otherwise { status, error }.
// Rules: a declined proposal blocks new ones for waitDays after the decline;
// and at most `limit` proposals may be waiting for an answer within the last waitDays.
async function checkProposalLimit(userId) {
  const limit = await getNumber('class_request_limit', 2);
  const waitDays = await getNumber('class_request_wait_days', 15);

  const { rows: [declined] } = await query(
    // Rejected requests are deleted; only the decline date is kept in class_request_rejections
    `SELECT max(rejected_at) AS last_declined FROM class_request_rejections
     WHERE user_id = $1 AND rejected_at > now() - make_interval(days => $2::int)`,
    [userId, waitDays]
  );
  if (declined.last_declined) {
    const retryAt = new Date(new Date(declined.last_declined).getTime() + waitDays * 24 * 60 * 60 * 1000);
    return {
      status: 429,
      error: `Your last class request was declined. You can send a new request after ${waitDays} days, on ${fmtDate(retryAt)}.`,
    };
  }

  const { rows: waiting } = await query(
    `SELECT created_at FROM class_requests
     WHERE user_id = $1 AND details->>'kind' = 'new_class' AND status IN ('new', 'in_progress')
       AND created_at > now() - make_interval(days => $2::int)
     ORDER BY created_at LIMIT $3`,
    [userId, waitDays, limit]
  );
  if (waiting.length >= limit) {
    const retryAt = new Date(new Date(waiting[0].created_at).getTime() + waitDays * 24 * 60 * 60 * 1000);
    return {
      status: 429,
      error: `You already have ${limit} class requests waiting for the academy's reply. Please try again after ${waitDays} days, on ${fmtDate(retryAt)}.`,
    };
  }
  return null;
}

module.exports = { checkProposalLimit };
