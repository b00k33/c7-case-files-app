// A musician's works — albums, EPs, singles, songs with their release dates —
// from Wikidata, as the record (her ask, 2026-09-04: "songs released dates,
// album release dates etc."; four popup answers). The rules below come from
// a four-agent probe of Wikidata against Taylor Swift, Dolly Parton, Lily
// Allen and Elvis (2026-09-04); what it found, and what each rule answers:
//
// - Wikidata splits one song into a COMPOSITION (Q105543609), a RECORDING
//   (Q55850593 / Q7302866), a SINGLE (Q134556) and sometimes a plain SONG
//   (Q7366): the same title appears up to five times. Rows are deduped by
//   the item's tracklist / composition links first, then by title, inside
//   one "pool" (album / ep / single / song) — never across pools: Dolly has
//   nine compilations all titled "Dolly Parton" and three albums "Jolene".
// - 92 of Taylor's items carry no English label, only a "mul" one: the
//   label service asks for "en,mul".
// - A year-only date comes back as YYYY-01-01 through wdt:P577; the value
//   node's timePrecision (9 year / 10 month / 11 day) comes along so a
//   date is shown and stored at its real precision — never an invented day.
// - Several release dates (regional, reissue, format): "best date" =
//   genuinely earlier wins; overlapping ranges → the more precise one.
// - Studio albums are typed plain "album"; live / compilation / box set
//   lives in P7937 (form) or P31 — "Compilations & live" is a sub-switch,
//   off by default, so Dolly's 178 compilations don't drown her albums.
// - A recording with no date takes its ALBUM's date ("via album" badge).
// - A duet, a cover or a standard lists her among several performers and
//   its P577 is the song's first release, not hers: "shared", unticked.
// - A date before her career start (P2031, else birth + 10) is flagged
//   "before career start?" and unticked — Wikidata has "Our Song" in 2001.

import { getJSON, SPARQL } from './lookup.js';

const FAMILY_QIDS = {
  album: ['Q482994', 'Q208569', 'Q222910', 'Q209939', 'Q10590726', 'Q4176708', 'Q963099', 'Q1892995', 'Q394970', 'Q723849', 'Q220935'],
  ep: ['Q169930'],
  single: ['Q134556', 'Q6128115', 'Q108352496', 'Q56599584', 'Q59847891', 'Q6124900'],
  song: ['Q7366', 'Q2894096', 'Q105543609', 'Q55850593', 'Q7302866', 'Q856713', 'Q23691', 'Q503354', 'Q7148059', 'Q13582719', 'Q64027488', 'Q207628', 'Q2188189'],
};
const FAMILY_ORDER = ['album', 'ep', 'single', 'song'];
const COMPILATION_QIDS = new Set(['Q222910', 'Q209939', 'Q723849', 'Q10590726', 'Q394970']); // compilation · live · box set · video album · remix album
const FORM_LABEL = { Q209939: 'Live album', Q222910: 'Compilation', Q723849: 'Box set', Q10590726: 'Video album', Q394970: 'Remix album' };
export const WORK_GROUPS = [
  { key: 'album', label: 'Albums' }, { key: 'ep', label: 'EPs' }, { key: 'single', label: 'Singles' }, { key: 'song', label: 'Songs' },
];
const familyOf = (q) => FAMILY_ORDER.find((f) => FAMILY_QIDS[f].includes(q)) || null;
const ALL_TYPE_QIDS = FAMILY_ORDER.flatMap((f) => FAMILY_QIDS[f]);

const WORKS_QUERY = (qid, offset) => `SELECT ?item ?itemLabel ?typeQs ?formQs ?dates ?links ?albumDates ?np ?careerStart ?born WHERE {
  { SELECT ?item (GROUP_CONCAT(DISTINCT ?tyQ; separator="|") AS ?typeQs) (GROUP_CONCAT(DISTINCT ?fQ; separator="|") AS ?formQs)
           (GROUP_CONCAT(DISTINCT ?dp; separator="|") AS ?dates) (GROUP_CONCAT(DISTINCT ?lk; separator="|") AS ?links)
           (GROUP_CONCAT(DISTINCT ?adp; separator="|") AS ?albumDates) (COUNT(DISTINCT ?perf) AS ?np) WHERE {
      ?item wdt:P175 wd:${qid} ; wdt:P31 ?ty ; wdt:P175 ?perf .
      VALUES ?ty { ${ALL_TYPE_QIDS.map((q) => 'wd:' + q).join(' ')} }
      BIND(STRAFTER(STR(?ty), "entity/") AS ?tyQ)
      OPTIONAL { ?item wdt:P7937 ?f . BIND(STRAFTER(STR(?f), "entity/") AS ?fQ) }
      OPTIONAL { ?item wdt:P577 ?t . ?item p:P577 ?st . ?st ps:P577 ?t ; psv:P577/wikibase:timePrecision ?pr . BIND(CONCAT(SUBSTR(STR(?t), 1, 10), "/", STR(?pr)) AS ?dp) }
      OPTIONAL { ?item wdt:P2550|wdt:P658 ?comp . BIND(STRAFTER(STR(?comp), "entity/") AS ?lk) }
      OPTIONAL { ?item wdt:P1433|wdt:P361|^wdt:P658 ?alb . ?alb wdt:P577 ?at . ?alb p:P577 ?ast . ?ast ps:P577 ?at ; psv:P577/wikibase:timePrecision ?apr . BIND(CONCAT(SUBSTR(STR(?at), 1, 10), "/", STR(?apr)) AS ?adp) }
    } GROUP BY ?item }
  OPTIONAL { wd:${qid} wdt:P2031 ?careerStart . }
  OPTIONAL { wd:${qid} wdt:P569 ?born . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
} LIMIT 1000${offset ? ' OFFSET ' + offset : ''}`;

// --- dates: {iso, prec} with the overlap rule ---------------------------
const parseDp = (s) => { const [iso, p] = String(s).split('/'); return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? { iso, prec: parseInt(p, 10) || 11 } : null; };
export function dateRange(d) {
  const y = d.iso.slice(0, 4), m = d.iso.slice(0, 7);
  if (d.prec >= 11) return [d.iso, d.iso];
  if (d.prec === 10) return [`${m}-01`, `${m}-31`];
  if (d.prec === 9) return [`${y}-01-01`, `${y}-12-31`];
  return [`${y.slice(0, 3)}0-01-01`, `${y.slice(0, 3)}9-12-31`];
}
/** Genuinely earlier wins; overlapping ranges → the more precise one (never a plain MIN, which prefers a padded year). */
export function bestDate(cands) {
  let keep = null;
  for (const c of cands) {
    if (!c) continue;
    if (!keep) { keep = c; continue; }
    const [ks, ke] = dateRange(keep), [cs, ce] = dateRange(c);
    if (ce < ks) keep = c;
    else if (cs > ke) continue;
    else if (c.prec > keep.prec) keep = c;
  }
  return keep;
}
export function displayDate(d) {
  if (!d) return null;
  if (d.prec >= 11) return new Date(`${d.iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (d.prec === 10) return new Date(`${d.iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (d.prec === 9) return d.iso.slice(0, 4);
  return `${d.iso.slice(0, 3)}0s`;
}
export const normTitle = (s) => String(s || '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s*\([^()]*\b(song|single|album|ep)\b[^()]*\)\s*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Every work Wikidata lists for the performer, deduped and dated. Rows:
 * { qid (lead item), memberQids, label, group ('album'|'ep'|'single'|'song'),
 *   families (Set), typeLabel, compilation, date {iso, prec} | null, display,
 *   dateSource ('item'|'album'|null), shared, suspect }.
 */
export async function fetchWorks(qid) {
  const bindings = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const data = await getJSON(`${SPARQL}?format=json&query=${encodeURIComponent(WORKS_QUERY(qid, offset))}`);
    const b = (data.results && data.results.bindings) || [];
    bindings.push(...b);
    if (b.length < 1000) break;
  }
  const split = (v) => (v && v.value ? v.value.split('|').filter(Boolean) : []);
  const items = bindings.map((b) => ({
    qid: /Q\d+$/.exec(b.item.value)[0],
    label: b.itemLabel ? b.itemLabel.value : '',
    typeQs: split(b.typeQs), formQs: split(b.formQs),
    dates: split(b.dates).map(parseDp).filter(Boolean), albumDates: split(b.albumDates).map(parseDp).filter(Boolean),
    links: split(b.links), np: b.np ? parseInt(b.np.value, 10) : 1,
  }));
  const first = bindings[0] || {};
  const careerStart = first.careerStart ? parseInt(first.careerStart.value.slice(0, 4), 10) : null;
  const born = first.born ? parseInt(first.born.value.slice(0, 4), 10) : null;
  const floor = careerStart || (born ? born + 10 : null);
  const byQid = new Map(items.map((i) => [i.qid, i]));
  for (const i of items) {
    i.families = new Set(i.typeQs.map(familyOf).filter(Boolean));
    i.pool = FAMILY_ORDER.find((f) => i.families.has(f)) || null;
    i.unlabelled = !i.label || /^Q\d+$/.test(i.label);
  }
  // a single's tracklist points at the TRACK, whose P2550 points at the composition — one hop
  const resolveLink = (i) => {
    if (i.links.length !== 1) return null;
    let t = i.links[0];
    const hop = byQid.get(t);
    if (hop && !hop.typeQs.includes('Q105543609') && hop.links.length === 1) t = hop.links[0];
    return t;
  };
  const groups = new Map();
  const titleKey = new Map(); // pool:normTitle -> group key, from keyed groups first
  const add = (key, i) => {
    let g = groups.get(key);
    if (!g) { g = { key, pool: i.pool, members: [] }; groups.set(key, g); }
    g.members.push(i);
    if (!i.unlabelled) { const tk = `${i.pool}:${normTitle(i.label)}`; if (!titleKey.has(tk)) titleKey.set(tk, key); }
  };
  const keyless = [];
  for (const i of items) {
    if (!i.pool) continue;
    if (i.pool === 'album' || i.pool === 'ep') { add(`${i.pool}:${i.qid}`, i); continue; }
    if (i.pool === 'song' && i.typeQs.includes('Q105543609')) { add(`song:${i.qid}`, i); continue; }
    const lk = resolveLink(i);
    if (lk) add(`${i.pool}:${lk}`, i); else keyless.push(i);
  }
  for (const i of keyless) {
    const tk = `${i.pool}:${normTitle(i.label)}`;
    add((!i.unlabelled && titleKey.get(tk)) || `${i.pool}:t:${i.unlabelled ? i.qid : normTitle(i.label)}`, i);
  }
  const assemble = (g) => {
    const m = g.members;
    const lead = m.find((x) => x.typeQs.includes('Q105543609') && !x.unlabelled) || m.find((x) => x.dates.length && !x.unlabelled) || m.find((x) => !x.unlabelled) || m[0];
    const own = bestDate(m.flatMap((x) => x.dates));
    const viaAlbum = !own && g.pool !== 'album' && g.pool !== 'ep' ? bestDate(m.flatMap((x) => x.albumDates)) : null;
    const date = own || viaAlbum;
    const typeQs = new Set(m.flatMap((x) => x.typeQs)), formQs = new Set(m.flatMap((x) => x.formQs));
    const compQ = [...formQs, ...typeQs].find((q) => COMPILATION_QIDS.has(q));
    const compilation = g.pool === 'album' && !!compQ;
    const typeLabel = g.pool === 'album' ? (compilation ? FORM_LABEL[compQ] || 'Compilation' : 'Album') : g.pool === 'ep' ? 'EP' : g.pool === 'single' ? 'Single' : 'Song';
    return {
      qid: lead.qid, memberQids: m.map((x) => x.qid), label: lead.unlabelled ? lead.qid : lead.label, group: g.pool,
      families: new Set(m.flatMap((x) => [...x.families])), typeLabel, compilation,
      date, display: displayDate(date), dateSource: own ? 'item' : viaAlbum ? 'album' : null,
      shared: m.some((x) => x.np > 1),
      suspect: !!(floor && date && parseInt(date.iso.slice(0, 4), 10) < floor),
    };
  };
  let rows = [...groups.values()].map(assemble);
  // a song row with the same title as a single: undated or overlapping → it IS that single
  const singlesByTitle = new Map(rows.filter((r) => r.group === 'single').map((r) => [normTitle(r.label), r]));
  rows = rows.filter((r) => {
    if (r.group !== 'song') return true;
    const s = singlesByTitle.get(normTitle(r.label));
    if (!s) return true;
    const overlap = !r.date || (s.date && (() => { const [rs, re] = dateRange(r.date), [ss, se] = dateRange(s.date); return !(re < ss || rs > se); })());
    if (!overlap) return true; // two real release events (Mean: track 2010, single 2011)
    s.families.add('song'); s.memberQids.push(...r.memberQids);
    if (r.date) { s.date = bestDate([s.date, r.date]); s.display = displayDate(s.date); s.dateSource = s.dateSource || r.dateSource; }
    return false;
  });
  rows.sort((a, b) => {
    const ka = a.date ? dateRange(a.date)[0] : '9999', kb = b.date ? dateRange(b.date)[0] : '9999';
    return ka < kb ? -1 : ka > kb ? 1 : ((b.date && b.date.prec) || 0) - ((a.date && a.date.prec) || 0) || a.label.localeCompare(b.label);
  });
  return rows;
}

/** The counts the picker's toggles show, over deduped rows. */
export function countByFamily(rows) {
  const n = {};
  for (const g of WORK_GROUPS) n[g.key] = rows.filter((r) => r.families.has(g.key)).length;
  n.compilation = rows.filter((r) => r.compilation).length;
  return n;
}

/**
 * Add the picked works to the person as 'release' events — the record, an
 * accepted claim citing Wikidata (P577) per work; a work already in the case
 * (any of its Wikidata items) is left alone. Returns { added, skipped, undated }.
 */
export async function addWorks(store, caseId, personId, works, onProgress = () => {}) {
  const existing = new Set((await store.listEventsForCase(caseId)).map((e) => e.wikidata_id).filter(Boolean));
  const todo = works.filter((w) => !(w.memberQids || [w.qid]).some((q) => existing.has(q)));
  const result = { added: 0, skipped: works.length - todo.length, undated: 0 };
  let i = 0;
  for (const w of todo) {
    i += 1;
    if (i % 20 === 0) onProgress(`${i} of ${todo.length}`);
    const d = w.date;
    if (!d) result.undated++;
    const year = d ? parseInt(d.iso.slice(0, 4), 10) : null;
    const title = `${w.typeLabel} · ${w.label}`;
    const cite = `Source: Wikidata https://www.wikidata.org/wiki/${w.qid} (P577${w.dateSource === 'album' ? ', via the album' : ''})`;
    const id = await store.createEvent({
      case_id: caseId, person_id: personId, title, kind: 'release',
      date: d && d.prec >= 11 ? d.iso : d && d.prec === 10 ? `${d.iso.slice(0, 7)}-01` : null,
      date_precision: !d ? 'unknown' : d.prec >= 11 ? 'day' : d.prec === 10 ? 'month' : 'year',
      date_year_min: year, date_year_max: year,
      notes: cite, wikidata_id: w.qid,
    });
    await store.createAcceptedClaim({ case_id: caseId, target_type: 'person', target_id: personId, field: 'release', value: { event_id: id, title, qid: w.qid, date: d, via: w.dateSource }, origin: 'lookup', rationale: cite });
    result.added++;
  }
  return result;
}
