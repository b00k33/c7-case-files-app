// A person's dated life events from Wikidata, as the record (her ask,
// 2026-09-07: "i dont know how the board works. its all empty for
// everyone" — the Board and the life line read events, and nothing put any
// there). One query reads the statements that carry dates: spouse (P26,
// start P580 / end P582), award received (P166, point in time P585),
// position held (P39), residence (P551), educated at (P69), employer
// (P108). Each picked row becomes an event citing its statement; a spouse
// row also dates the relationship in the case (start / end) — the tree's
// "m. YYYY" and the circle's "♥ 1996 · ✕ 1999" come from there.
import { getJSON, SPARQL } from './lookup.js';

const PROPS = { P26: 'spouse', P166: 'award', P39: 'position', P551: 'residence', P69: 'education', P108: 'employer' };
export const LIFE_GROUPS = [
  { key: 'spouse', label: 'Marriages' }, { key: 'award', label: 'Awards' }, { key: 'position', label: 'Positions' },
  { key: 'employer', label: 'Work' }, { key: 'residence', label: 'Homes' }, { key: 'education', label: 'Schools' },
];

const QUERY = (qid) => `SELECT ?p ?item ?itemLabel ?start ?startPrec ?end ?endPrec ?point ?pointPrec WHERE {
  VALUES ?p { ${Object.keys(PROPS).map((p) => 'wd:' + p).join(' ')} }
  ?p wikibase:claim ?pc ; wikibase:statementProperty ?ps .
  wd:${qid} ?pc ?st . ?st ?ps ?item .
  FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }
  OPTIONAL { ?st pq:P580 ?start . OPTIONAL { ?st pqv:P580/wikibase:timePrecision ?startPrec . } }
  OPTIONAL { ?st pq:P582 ?end . OPTIONAL { ?st pqv:P582/wikibase:timePrecision ?endPrec . } }
  OPTIONAL { ?st pq:P585 ?point . OPTIONAL { ?st pqv:P585/wikibase:timePrecision ?pointPrec . } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
} LIMIT 400`;

// "1996-11-14T00:00:00Z" + precision 11/10/9 → honest {date, precision, year}; never an invented day
function toDate(v, prec) {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (!m) return null;
  const year = parseInt(m[1], 10);
  if (!year || year < 1000 || year > 2200) return null;
  const p = prec != null ? parseInt(prec, 10) : 11;
  if (p >= 11 && m[2] !== '00' && m[3] !== '00') return { date: `${m[1]}-${m[2]}-${m[3]}`, precision: 'day', year };
  if (p === 10 && m[2] !== '00') return { date: `${m[1]}-${m[2]}-01`, precision: 'month', year };
  return { date: null, precision: 'year', year };
}
const qidOf = (url) => { const m = /Q\d+$/.exec(String(url || '')); return m ? m[0] : null; };
const sortKey = (c) => (c.date ? (c.date.date || `${c.date.year}-99-99`) : '9999');

/**
 * Read the dated statements on one item → candidate events, sorted by date,
 * undated last. Each: { key, group, kind, title, date, item: {qid, label}, spouse? }.
 */
export async function fetchLifeEvents(qid) {
  const data = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(QUERY(qid))}`);
  const rows = (data.results && data.results.bindings) || [];
  const out = new Map();
  const add = (c) => { if (!out.has(c.key)) out.set(c.key, c); };
  for (const b of rows) {
    const prop = qidOf(b.p && b.p.value) || (b.p && b.p.value.split('/').pop());
    const group = PROPS[prop];
    const itemQid = qidOf(b.item && b.item.value);
    const label = b.itemLabel && b.itemLabel.value;
    if (!group || !itemQid || !label || /^Q\d+$/.test(label)) continue;
    const start = toDate(b.start && b.start.value, b.startPrec && b.startPrec.value);
    const end = toDate(b.end && b.end.value, b.endPrec && b.endPrec.value);
    const point = toDate(b.point && b.point.value, b.pointPrec && b.pointPrec.value);
    const item = { qid: itemQid, label };
    const base = `${qid}/${prop}/${itemQid}`;
    if (group === 'spouse') {
      add({ key: `${base}/start`, group, kind: 'marriage', title: `Married ${label}`, date: start, item, spouse: item, prop, qual: start ? 'P580' : '' });
      if (end) add({ key: `${base}/end`, group, kind: 'divorce', title: `Ended with ${label}`, date: end, item, spouse: item, prop, qual: 'P582' });
    } else if (group === 'award') {
      add({ key: base, group, kind: 'award', title: label, date: point || start || end, item, prop, qual: point ? 'P585' : start ? 'P580' : end ? 'P582' : '' });
    } else if (group === 'residence') {
      add({ key: base, group, kind: 'move', title: `Moved to ${label}`, date: start || point, item, prop, qual: start ? 'P580' : point ? 'P585' : '' });
    } else if (group === 'education') {
      const d = start || point || null;
      add({ key: base, group, kind: 'other', title: d || !end ? `Studied at ${label}` : `Finished at ${label}`, date: d || end, item, prop, qual: d ? (start ? 'P580' : 'P585') : end ? 'P582' : '' });
    } else {
      // position held, employer: the start is the event; only an end → "Left"
      const d = start || point || null;
      const verb = group === 'position' ? 'Became' : 'Joined';
      add({ key: base, group, kind: 'business', title: d || !end ? `${verb} ${label}` : `Left ${label}`, date: d || end, item, prop, qual: d ? (start ? 'P580' : 'P585') : end ? 'P582' : '' });
    }
  }
  return [...out.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function countByGroup(list) {
  const n = {};
  for (const g of LIFE_GROUPS) n[g.key] = list.filter((c) => c.group === g.key).length;
  return n;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const eventYear = (e) => (e.date ? parseInt(e.date.slice(0, 4), 10) : e.date_year_min);

/**
 * Is this candidate already on the record? By its Wikidata key on any event
 * in the case, or by an event of this person's in the same year that names
 * the same thing — so "Married Debbie Rowe" typed by hand and the Wikidata
 * spouse statement never sit on the life line twice (found on the first
 * real run, 2026-09-07). An undated candidate can only match by key.
 */
export function alreadyHere(c, existing, personId) {
  const label = norm(c.item && c.item.label);
  const title = norm(c.title);
  for (const e of existing) {
    if (e.wikidata_id && e.wikidata_id === c.key) return true;
    if (e.person_id !== personId || !c.date || eventYear(e) !== c.date.year) continue;
    const t = norm(e.title);
    if (t === title) return true;
    if (!label || !t.includes(label)) continue;
    if (c.group !== 'spouse') return true;
    // a spouse row must also match its direction: married vs ended
    const ends = e.kind === 'divorce' || /\b(divorc|ended|separat|split|annul)/.test(t);
    const starts = e.kind === 'marriage' || /\b(married|wed|wedding|marriage)\b/.test(t);
    if (c.kind === 'divorce' ? ends : starts) return true;
  }
  return false;
}

/**
 * Add the picked candidates as events — the record, an accepted claim citing
 * the Wikidata statement each — and date the spouse relationships they name.
 * Returns { added, skipped, undated, dated: number of relationships dated }.
 */
export async function addLifeEvents(store, caseId, personId, picks, onProgress = () => {}) {
  const existing = await store.listEventsForCase(caseId);
  const todo = picks.filter((c) => !alreadyHere(c, existing, personId));
  const result = { added: 0, skipped: picks.length - todo.length, undated: 0, dated: 0 };
  const people = await store.listPeople(caseId);
  const byName = (n) => people.find((p) => p.display_name.trim().toLowerCase() === String(n).trim().toLowerCase());
  const rels = await store.listRelationshipsForPerson(personId);
  const subject = await store.getPerson(personId);
  let i = 0;
  for (const c of todo) {
    i += 1;
    onProgress(`${i} of ${todo.length}`);
    const d = c.date;
    if (!d) result.undated++;
    const cite = `Source: Wikidata https://www.wikidata.org/wiki/${subject && subject.wikidata_id ? subject.wikidata_id : c.key.split('/')[0]} (${c.prop}${c.qual ? ' · ' + c.qual : ''}) → https://www.wikidata.org/wiki/${c.item.qid}`;
    const id = await store.createEvent({
      case_id: caseId, person_id: personId, title: c.title, kind: c.kind,
      date: d ? d.date : null, date_precision: d ? d.precision : 'unknown',
      date_year_min: d ? d.year : null, date_year_max: d ? d.year : null,
      notes: cite, wikidata_id: c.key,
    });
    await store.createAcceptedClaim({ case_id: caseId, target_type: 'person', target_id: personId, field: 'life_event', value: { event_id: id, title: c.title, kind: c.kind, qid: c.item.qid, date: d }, origin: 'lookup', rationale: cite });
    result.added++;
    // a marriage dates the relationship — filled only where the relationship is still blank
    if (c.spouse && d) {
      const other = store.findPersonByWikidata(caseId, c.spouse.qid) || byName(c.spouse.label);
      if (!other) continue;
      const iso = d.date || `${d.year}-01-01`;
      const field = c.kind === 'marriage' ? 'start_date' : 'end_date';
      const rel = rels.find((r) => r.kind === 'spouse' && ((r.a_id === personId && r.b_id === other.id) || (r.b_id === personId && r.a_id === other.id)));
      if (rel) {
        if (!rel[field]) { await store.upsertRelationship({ id: rel.id, [field]: iso }); rel[field] = iso; result.dated++; }
      } else {
        const created = { case_id: caseId, a_id: personId, b_id: other.id, kind: 'spouse', [field]: iso, confidence: 70, confirmed: 0, notes: cite };
        const rid = await store.upsertRelationship(created);
        rels.push({ id: rid, ...created });
        result.dated++;
      }
    }
  }
  return result;
}
