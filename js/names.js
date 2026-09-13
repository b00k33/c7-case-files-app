// Name casing (her rule, 2026-09-13 synth22): every typed name and case
// name gets its first letters capitalised — but only when it looks typed in
// a hurry. A name with ANY real capitalisation already is left exactly as
// typed (her rule: "Henry VIII" stays "Henry VIII", not further touched),
// and a Wikidata label is never run through this — callers decide when a
// value came from her, not from the record.
//
// Particles stay lowercase unless they lead the name ("Vincent van Gogh",
// "Leonardo da Vinci", but "Van Gogh" if that's literally all she typed).
// Roman-numeral words go fully upper ("henry viii" -> "Henry VIII"). "Mc"
// gets its internal capital ("mcdonald" -> "McDonald"). Apostrophes and
// hyphens each cap their own piece ("o'brien" -> "O'Brien", "jean-paul" ->
// "Jean-Paul").

const PARTICLES = new Set([
  'van', 'von', 'der', 'den', 'de', 'da', 'du', 'del', 'della', 'di',
  'la', 'le', 'bin', 'ibn', 'al', 'of', 'the', 'y', 'e',
]);

const ROMAN = /^(m{0,4})(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

function isRomanNumeral(word) {
  const w = word.toLowerCase();
  return w.length >= 2 && ROMAN.test(w);
}

function titleCaseWord(word) {
  if (!word) return word;
  if (isRomanNumeral(word)) return word.toUpperCase();
  if (/^mc[a-z]{2,}$/i.test(word)) return `Mc${word.slice(2, 3).toUpperCase()}${word.slice(3).toLowerCase()}`;
  if (word.includes("'")) return word.split("'").map((p) => titleCaseWord(p)).join("'");
  if (word.includes('-')) return word.split('-').map((p) => titleCaseWord(p)).join('-');
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** "harry potter" -> "Harry Potter"; "vincent van gogh" -> "Vincent van Gogh". */
export function titleCaseName(raw) {
  const words = String(raw || '').trim().split(/\s+/).filter(Boolean);
  return words.map((w, i) => {
    if (i > 0 && PARTICLES.has(w.toLowerCase())) return w.toLowerCase();
    return titleCaseWord(w);
  }).join(' ');
}

/**
 * True when a name carries no real capitalisation at all — "jk rowling",
 * "HENRY VIII" — the shape of a name typed in a hurry, not a deliberate
 * editorial choice. "Henry VIII" and "King Charles" (an intentional
 * shorter name than Wikidata's "Charles III") both stay untouched: they're
 * already properly cased, just a different name. (Moved here from
 * lookup.js, 2026-09-13, so the typed-name chokepoint and the Wikidata
 * relabel guard share one definition.)
 */
export function looksHurried(name) {
  const letters = String(name || '').replace(/[^a-zA-Z]/g, '');
  return letters.length > 0 && (letters === letters.toLowerCase() || letters === letters.toUpperCase());
}

/** The one call typed-input sites make: cases it if (and only if) it looks hurried. */
export function autoCaseName(raw) {
  const v = String(raw || '').trim();
  return looksHurried(v) ? titleCaseName(v) : v;
}
