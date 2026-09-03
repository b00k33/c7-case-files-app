// The one gate between a stored date and a calculation.
//
// The schema stores a date plus how sure it is: `1923-06-01` with
// birth_precision `month` means "June 1923", and the day is a placeholder
// the file does not actually hold. Every calculation module refuses to
// guess when a day or month is missing — but only if it is handed nothing.
// Hand it the placeholder and it answers confidently from a fabricated day.
//
// Found 2026-09-03 by review: a Wikidata relative born "June 1923" was
// drawing a life path, an animal and a sun sign on the tree, in the
// life-path grid and inside the observed-vs-expected pattern counts, while
// their own profile correctly said the chart could not be drawn. SPEC §5
// and §8: nothing is computed from a date the file does not hold.
//
// So: read birth and death dates for calculation ONLY through these.

/** The birth date to calculate from — null unless the file holds the full day. */
export function exactBirth(person) {
  if (!person) return null;
  return person.birth_precision === 'day' ? (person.birth_date || null) : null;
}

/** The death date to calculate from — same rule. */
export function exactDeath(person) {
  if (!person) return null;
  return person.death_precision === 'day' ? (person.death_date || null) : null;
}

/** The same gate for an event row, which carries its own date_precision. */
export function exactEventDate(event) {
  if (!event) return null;
  return event.date_precision === 'day' ? (event.date || null) : null;
}
