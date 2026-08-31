// Pure sun-sign function. No DOM, no database, no globals.

// [sign, startMonth, startDay] — the day each sign begins (tropical, standard cutoffs).
const SIGN_STARTS = [
  ['Aquarius', 1, 20], ['Pisces', 2, 19], ['Aries', 3, 21], ['Taurus', 4, 20],
  ['Gemini', 5, 21], ['Cancer', 6, 21], ['Leo', 7, 23], ['Virgo', 8, 23],
  ['Libra', 9, 23], ['Scorpio', 10, 23], ['Sagittarius', 11, 22], ['Capricorn', 12, 22],
];

// Day-of-year on a fixed leap year (2000) so Feb 29 birthdays are safe.
function dayOfYear(month, day) {
  return Math.round((Date.UTC(2000, month - 1, day) - Date.UTC(2000, 0, 1)) / 86400000);
}

const ENTRIES = SIGN_STARTS.map(([name, m, d]) => ({ name, doy: dayOfYear(m, d) }));
const YEAR_LENGTH = 366; // 2000 is a leap year

function circularDistance(a, b, total) {
  const diff = Math.abs(a - b);
  return Math.min(diff, total - diff);
}

function parseMonthDay(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return null;
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(2000, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { month, day };
}

/**
 * Sun sign for a birth date. Needs a full date (day and month); refuses to
 * guess otherwise. cusp is true when the date falls within 1 day of a
 * sign boundary in either direction.
 */
export function sunSign(dateISO) {
  const parts = parseMonthDay(dateISO);
  if (!parts) return { ok: false, reason: 'needs a day and month' };
  const doy = dayOfYear(parts.month, parts.day);

  let sign = 'Capricorn'; // wraps the year end; the default until a later start is found
  for (const e of ENTRIES) {
    if (doy >= e.doy) sign = e.name;
  }

  const cusp = ENTRIES.some((e) => circularDistance(doy, e.doy, YEAR_LENGTH) <= 1);

  return { ok: true, sign, cusp };
}
