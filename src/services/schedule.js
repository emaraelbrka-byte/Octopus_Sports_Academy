// Builds the upcoming lesson times for a weekly class, in Malaysia time (UTC+8, no daylight saving).
// Same rule as the admin "Add class" page: classes_per_month is spread over the chosen days,
// e.g. 2 days and 8 classes = the next 4 of each day.

const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const KL_MS = 8 * 3600 * 1000;

// days: ['mon', 'thu'], hhmm: '17:30', total: 8, durationMin: 40
// Returns [{ starts_at: Date, ends_at: Date }] sorted by time, all in the future.
function weeklySessions(days, hhmm, total, durationMin, now = Date.now()) {
  const [h, m] = hhmm.split(':').map(Number);
  const perDay = Math.ceil(total / days.length);
  const starts = [];
  for (const code of days) {
    let from = now;
    for (let i = 0; i < perDay; i++) {
      const kl = new Date(from + KL_MS);
      let found = null;
      for (let add = 0; add < 8 && found === null; add++) {
        const cand = Date.UTC(kl.getUTCFullYear(), kl.getUTCMonth(), kl.getUTCDate() + add, h, m) - KL_MS;
        if (cand > from && new Date(cand + KL_MS).getUTCDay() === DOW[code]) found = cand;
      }
      starts.push(found);
      from = found;
    }
  }
  return starts
    .sort((a, b) => a - b)
    .map((s) => ({ starts_at: new Date(s), ends_at: new Date(s + durationMin * 60000) }));
}

module.exports = { weeklySessions, DOW };
