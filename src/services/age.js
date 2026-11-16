// Age in full years today (Malaysia time) from a date of birth 'YYYY-MM-DD'.
// Returns NaN if the date is not a real calendar date.
function ageFromDob(dob) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return NaN;

  const kl = new Date(Date.now() + 8 * 60 * 60 * 1000); // Asia/Kuala_Lumpur, UTC+8
  let age = kl.getUTCFullYear() - y;
  if ((kl.getUTCMonth() + 1) * 100 + kl.getUTCDate() < mo * 100 + d) age -= 1;
  return age;
}

module.exports = { ageFromDob };
