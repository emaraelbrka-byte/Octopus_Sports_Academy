const { query } = require('../db');

// Group size tier used by the price list: 1, 2, 3, or 4/6 people
function tierFor(count) {
  if (count <= 3) return String(count);
  return '4-6';
}

// Price per person for each tier of one package: { '1': cents, '2': cents, '3': cents, '4-6': cents }
// dayGroup: 'weekdays', 'weekends', or 'mixed' (average of weekday and weekend prices)
async function planPrices(dayGroup, perMonth) {
  if (!dayGroup || !perMonth) return null;
  if (dayGroup === 'mixed') return mixedPrices(perMonth);
  const { rows } = await query(
    'SELECT group_tier, price_cents FROM price_plans WHERE day_group = $1 AND classes_per_month = $2',
    [dayGroup, perMonth]
  );
  if (!rows.length) return null;
  return Object.fromEntries(rows.map((r) => [r.group_tier, r.price_cents]));
}

// Mixed weekday and weekend days: each tier is the average of the two packages
async function mixedPrices(perMonth) {
  const weekday = await planPrices('weekdays', perMonth);
  const weekend = await planPrices('weekends', perMonth);
  if (!weekday || !weekend) return null;
  return Object.fromEntries(
    Object.keys(weekday).map((tier) => [tier, Math.round(((weekday[tier] || 0) + (weekend[tier] || 0)) / 2)])
  );
}

// Returns the price per person and the total for `count` people in this class.
// Classes with a package plan use the price list; others use their own price_cents.
async function quote(cls, count) {
  if (cls.day_group && cls.classes_per_month) {
    const prices = await planPrices(cls.day_group, cls.classes_per_month);
    // Group classes are priced at the 4-person tier, so a class that has few people yet still shows the 4-person price
    const tier = cls.class_type === 'group' ? '4-6' : tierFor(count);
    if (prices && prices[tier] != null) {
      return { per_person_cents: prices[tier], total_cents: prices[tier] * count };
    }
  }
  return { per_person_cents: cls.price_cents, total_cents: cls.price_cents * count };
}

module.exports = { quote, planPrices, tierFor };
