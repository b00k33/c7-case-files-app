// Pure numerology functions. No DOM, no database, no globals.
// Runs unmodified in a browser, in Node, or in a worker.

const MASTER_NUMBERS = new Set([11, 22, 33]);

function digitSum(n) {
  let s = 0;
  let v = Math.abs(Math.trunc(n));
  while (v > 0) {
    s += v % 10;
    v = Math.floor(v / 10);
  }
  return s;
}

/**
 * Reduce a number to a single digit, optionally preserving 11/22/33.
 * @returns {{value:number, master:boolean}}
 */
export function reduce(n, keepMaster = true) {
  let value = Math.trunc(n);
  while (true) {
    if (keepMaster && MASTER_NUMBERS.has(value)) return { value, master: true };
    if (value < 10) return { value, master: false };
    value = digitSum(value);
  }
}

/**
 * Parse a strict ISO 'YYYY-MM-DD' date into numeric parts, or null if
 * the string isn't a complete, valid calendar date.
 */
export function parseDateParts(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

/**
 * Life path number. Day, month and year are each fully reduced
 * (master numbers NOT kept at this stage — 11 reduces to 2, 22 to 4)
 * then summed; only the final total preserves a master number.
 * Refuses to guess: a date missing day or month returns {ok:false}.
 */
export function lifePath(dateISO) {
  const parts = parseDateParts(dateISO);
  if (!parts) return { ok: false, reason: 'needs a day and month' };
  const dayReduced = reduce(parts.day, false).value;
  const monthReduced = reduce(parts.month, false).value;
  const yearReduced = reduce(parts.year, false).value;
  const total = dayReduced + monthReduced + yearReduced;
  const final = reduce(total, true);
  return {
    ok: true,
    value: final.value,
    master: final.master,
    parts: {
      day: parts.day, dayReduced,
      month: parts.month, monthReduced,
      year: parts.year, yearReduced,
      total,
    },
  };
}

const PYTHAGOREAN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function letterValue(letter) {
  const idx = PYTHAGOREAN.indexOf(letter);
  if (idx < 0) return 0;
  return (idx % 9) + 1; // A=1..I=9, J=1..R=9, S=1..Z=8
}

// Vowel test for soul-urge / personality splits.
// A E I O U are always vowels. Y is treated as a consonant UNLESS neither
// letter next to it (within the name, spaces stripped) is itself a vowel —
// i.e. Y counts as a vowel only when it is carrying a syllable alone
// ("Lynn", "Glyn"). This is a documented simplification of "the only vowel
// in the syllable": true syllable boundaries aren't computed, Y's immediate
// neighbours are used as a proxy.
const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);
function isVowelAt(letters, i) {
  const letter = letters[i];
  if (VOWELS.has(letter)) return true;
  if (letter === 'Y') {
    const prev = letters[i - 1];
    const next = letters[i + 1];
    const prevIsVowel = prev != null && VOWELS.has(prev);
    const nextIsVowel = next != null && VOWELS.has(next);
    return !prevIsVowel && !nextIsVowel;
  }
  return false;
}

function cleanLetters(fullName) {
  return (fullName || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
}

/** Expression number: every letter, Pythagorean values, reduced. */
export function expression(fullName) {
  const letters = cleanLetters(fullName);
  if (!letters.length) return { ok: false, reason: 'needs a name' };
  const total = letters.reduce((sum, l) => sum + letterValue(l), 0);
  const final = reduce(total, true);
  return { ok: true, value: final.value, master: final.master, total };
}

/** Soul urge number: vowels only. */
export function soulUrge(fullName) {
  const letters = cleanLetters(fullName);
  if (!letters.length) return { ok: false, reason: 'needs a name' };
  const total = letters.reduce(
    (sum, l, i) => (isVowelAt(letters, i) ? sum + letterValue(l) : sum),
    0
  );
  const final = reduce(total, true);
  return { ok: true, value: final.value, master: final.master, total };
}

/** Personality number: consonants only. */
export function personality(fullName) {
  const letters = cleanLetters(fullName);
  if (!letters.length) return { ok: false, reason: 'needs a name' };
  const total = letters.reduce(
    (sum, l, i) => (!isVowelAt(letters, i) ? sum + letterValue(l) : sum),
    0
  );
  const final = reduce(total, true);
  return { ok: true, value: final.value, master: final.master, total };
}

/** Birthday number: the day of birth, reduced. */
export function birthdayNumber(dateISO) {
  const parts = parseDateParts(dateISO);
  if (!parts) return { ok: false, reason: 'needs a day and month' };
  const final = reduce(parts.day, true);
  return { ok: true, value: final.value, master: final.master, day: parts.day };
}

/** Universal year: the calendar year itself, reduced. */
export function universalYear(year) {
  if (!Number.isInteger(year)) return { ok: false, reason: 'needs a year' };
  const final = reduce(year, true);
  return { ok: true, value: final.value, master: final.master, year };
}

/**
 * Personal year: reduce(birthDay + birthMonth + reduce(year)).
 * Needs a full birth date (day and month); the target year stands alone.
 */
export function personalYear(birthISO, year) {
  const parts = parseDateParts(birthISO);
  if (!parts) return { ok: false, reason: 'needs a day and month' };
  if (!Number.isInteger(year)) return { ok: false, reason: 'needs a year' };
  const yearReduced = reduce(year, true).value;
  const total = parts.day + parts.month + yearReduced;
  const final = reduce(total, true);
  return {
    ok: true,
    value: final.value,
    master: final.master,
    parts: { day: parts.day, month: parts.month, year, yearReduced, total },
  };
}
