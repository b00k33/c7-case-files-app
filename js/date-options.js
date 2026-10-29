// The competing birth (or death) dates on one person: what is on record now
// plus every claim about it that wasn't rejected, one entry per distinct date.
// Shared by Questions (her 2026-10-29 pick: an "Unclear: birth for X" question
// answers in one tap) and the Board (pin what's there: two dates that
// disagree get a red string).

const MONTH = { month: 'short', year: 'numeric' };
const DAY = { day: 'numeric', month: 'short', year: 'numeric' };
const ORIGIN = { lookup: 'Wikipedia', paste: 'pasted', import: 'imported', user: 'added by you' };

function fmt(precision, date, year, yearMax) {
  if ((precision === 'day' || precision === 'month') && date) {
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, precision === 'day' ? DAY : MONTH);
  }
  if (precision === 'range' && year) return yearMax && yearMax !== year ? `${year}–${yearMax}` : String(year);
  if (year) return String(year);
  return null;
}

function onRecord(person, field) {
  if (field === 'birth') return fmt(person.birth_precision, person.birth_date, person.birth_year_min, person.birth_year_max);
  return person.death_date ? fmt('day', person.death_date) : null;
}

/**
 * [{ label, onRecord, claimId, source }] — the date on record first, then each
 * different date a claim offers. `source` is a short word for where it came from.
 */
export async function dateOptions(store, person, field) {
  const out = [];
  const now = onRecord(person, field);
  if (now) out.push({ label: now, onRecord: true, claimId: null, source: 'on record' });
  const claims = (await store.listClaims(person.case_id))
    .filter((c) => c.field === field && c.target_id === person.id && c.state !== 'rejected');
  for (const c of claims) {
    let v; try { v = JSON.parse(c.value); } catch (_) { continue; }
    const label = fmt(v.precision, v.date, v.year);
    if (!label) continue;
    const same = out.find((o) => o.label === label);
    if (same) { if (!same.claimId) same.claimId = c.id; continue; }
    out.push({ label, onRecord: false, claimId: c.id, source: ORIGIN[c.origin] || c.origin });
  }
  return out;
}

/** "Unclear: birth for Anne Boleyn" → { field: 'birth', name: 'Anne Boleyn' }, else null. */
export function unclearDate(text) {
  const m = /^Unclear:\s*(birth|death)\b(?:.*?\bfor\s+(.+?))?\s*\.?$/i.exec(String(text || '').trim());
  return m ? { field: m[1].toLowerCase(), name: m[2] || null } : null;
}
