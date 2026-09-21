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
  { key: 'other', label: 'Other works' },
];
const familyOf = (q) => FAMILY_ORDER.find((f) => FAMILY_QIDS[f].includes(q)) || null;
const ALL_TYPE_QIDS = FAMILY_ORDER.flatMap((f) => FAMILY_QIDS[f]);

// Two queries, not one: a single query carrying the date-precision path, the
// tracklist links and the album fallback inside the GROUP BY ran 40–65 s and
// hit the service's 60 s limit (504) on 2026-09-04. The light list query takes
// ~15 s for a prolific artist; the detail query, bounded by VALUES to 200
// items, takes ~2 s a batch.
// The list query itself dropped ?itemLabel and its SERVICE wikibase:label
// clause (found live, 2026-09-21: pairing the label service with the GROUP
// BY subquery above reliably 500s Blazegraph with a StackOverflowError once
// an artist has enough real catalogue to aggregate — reproduced twice
// against Lily Allen's actual discography, not a rare fluke). Labels are
// fetched separately, flat, in the same per-200 batch pass as the details.
const LIST_QUERY = (qid, offset) => `SELECT ?item ?typeQs ?formQs ?rough ?careerStart ?born WHERE {
  { SELECT ?item (GROUP_CONCAT(DISTINCT ?tyQ; separator="|") AS ?typeQs) (GROUP_CONCAT(DISTINCT ?fQ; separator="|") AS ?formQs) (MIN(?t) AS ?rough) WHERE {
      ?item wdt:P175 wd:${qid} ; wdt:P31 ?ty .
      VALUES ?ty { ${ALL_TYPE_QIDS.map((q) => 'wd:' + q).join(' ')} }
      BIND(STRAFTER(STR(?ty), "entity/") AS ?tyQ)
      OPTIONAL { ?item wdt:P7937 ?f . BIND(STRAFTER(STR(?f), "entity/") AS ?fQ) }
      OPTIONAL { ?item wdt:P577 ?t }
    } GROUP BY ?item }
  OPTIONAL { wd:${qid} wdt:P2031 ?careerStart . }
  OPTIONAL { wd:${qid} wdt:P569 ?born . }
} LIMIT 1000${offset ? ' OFFSET ' + offset : ''}`;
const DETAIL_QUERY = (qids) => `SELECT ?item (COUNT(DISTINCT ?perf) AS ?np) (GROUP_CONCAT(DISTINCT ?dp; separator="|") AS ?dates) (GROUP_CONCAT(DISTINCT ?lk; separator="|") AS ?links) (GROUP_CONCAT(DISTINCT ?adp; separator="|") AS ?albumDates) WHERE {
  VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} }
  ?item wdt:P175 ?perf .
  OPTIONAL { ?item p:P577 ?st . ?st ps:P577 ?t ; psv:P577/wikibase:timePrecision ?pr . FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank } BIND(CONCAT(SUBSTR(STR(?t), 1, 10), "/", STR(?pr)) AS ?dp) }
  OPTIONAL { ?item wdt:P2550|wdt:P658 ?comp . BIND(STRAFTER(STR(?comp), "entity/") AS ?lk) }
  OPTIONAL { ?item wdt:P1433|wdt:P361|^wdt:P658 ?alb . ?alb p:P577 ?ast . ?ast ps:P577 ?at ; psv:P577/wikibase:timePrecision ?apr . BIND(CONCAT(SUBSTR(STR(?at), 1, 10), "/", STR(?apr)) AS ?adp) }
} GROUP BY ?item`;
// Flat — no GROUP BY alongside the label service, for the same reason as
// above.
const LABEL_QUERY = (qids) => `SELECT ?item ?itemLabel WHERE {
  VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" . }
}`;
const CACHE_KEY = (qid) => `c7-works:${qid}`;
const CACHE_MS = 15 * 60 * 1000; // the same artist twice in a sitting must not cost another minute

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
 * Every musical work Wikidata lists for the performer, deduped and dated.
 * Rows: { qid (lead item), memberQids, label, group ('album'|'ep'|'single'|'song'),
 *   families (Set), typeLabel, compilation, date {iso, prec} | null, display,
 *   dateSource ('item'|'album'|null), shared, suspect }.
 */
async function fetchMusicWorks(qid, onProgress = () => {}) {
  try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY(qid)) || 'null'); if (c && Date.now() - c.at < CACHE_MS) return c.rows.map((r) => ({ ...r, families: new Set(r.families) })); } catch (_) { /* no cache */ }
  // the query service answers a transient 429 / 502 / 503 now and then (probe, 2026-09-04); under
  // load it can also 500 the whole query, StackOverflowError-style (found live, 2026-09-21, in a
  // burst alongside 429s and 502s for the same artist — one busy moment, not a broken query): one
  // retry after 2 s covers all of them the same way.
  const ask = async (query) => { const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`; try { return await getJSON(url); } catch (e) { if (!/\((429|500|502|503|504)\)/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 2000)); return getJSON(url); } };
  onProgress('listing…');
  const bindings = [];
  for (let offset = 0; offset < 5000; offset += 1000) {
    const data = await ask(LIST_QUERY(qid, offset));
    const b = (data.results && data.results.bindings) || [];
    bindings.push(...b);
    if (b.length < 1000) break;
  }
  const split = (v) => (v && v.value ? v.value.split('|').filter(Boolean) : []);
  const items = bindings.map((b) => ({
    qid: /Q\d+$/.exec(b.item.value)[0],
    label: '',
    typeQs: split(b.typeQs), formQs: split(b.formQs),
    rough: b.rough ? b.rough.value.slice(0, 10) : null,
    dates: [], albumDates: [], links: [], np: 1,
  }));
  // the details and labels, 200 items at a time: performer count, dates with precision, links, album dates, label
  for (let i = 0; i < items.length; i += 200) {
    const chunk = items.slice(i, i + 200);
    onProgress(`details ${Math.min(i + 200, items.length)} of ${items.length}`);
    let data = null;
    try { data = await ask(DETAIL_QUERY(chunk.map((x) => x.qid))); } catch (_) { data = null; }
    const byQ = new Map(((data && data.results && data.results.bindings) || []).map((b) => [/Q\d+$/.exec(b.item.value)[0], b]));
    let labelData = null;
    try { labelData = await ask(LABEL_QUERY(chunk.map((x) => x.qid))); } catch (_) { labelData = null; }
    const byLabelQ = new Map(((labelData && labelData.results && labelData.results.bindings) || []).map((b) => [/Q\d+$/.exec(b.item.value)[0], b]));
    for (const x of chunk) {
      const b = byQ.get(x.qid);
      if (b) {
        x.np = b.np ? parseInt(b.np.value, 10) : 1;
        x.dates = split(b.dates).map(parseDp).filter(Boolean);
        x.albumDates = split(b.albumDates).map(parseDp).filter(Boolean);
        x.links = split(b.links);
      }
      const lb = byLabelQ.get(x.qid);
      if (lb && lb.itemLabel) x.label = lb.itemLabel.value;
      // the detail batch failed or the item carries no precise date: fall back to the rough one, honestly marked year-precision
      if (!x.dates.length && x.rough) x.dates = [{ iso: x.rough, prec: /-01-01$/.test(x.rough) ? 9 : 11 }];
    }
  }
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
  try { sessionStorage.setItem(CACHE_KEY(qid), JSON.stringify({ at: Date.now(), rows: rows.map((r) => ({ ...r, families: [...r.families] })) })); } catch (_) { /* storage full or blocked — fine */ }
  return rows;
}

// A non-musician has no P175 (performer) credits at all, so the music path
// above always correctly (if unhelpfully) returns nothing for a painter, a
// writer, an architect, a scientist — or a historical figure with none of
// the above but one notable thing to their name (her ask, 2026-09-20, on a
// screenshot of an 18th-century princess: "include more than just musical
// works like albums"). Four properties cover most of what Wikidata calls a
// "thing this person made": P800 (a person's own "notable work" link, any
// kind), P170 creator and P50 author (reverse — a painting or a book
// pointing back at her), P84 architect and P61 discoverer-or-inventor
// (reverse — a building, a discovery). Deliberately NOT P86 composer: that
// overlaps almost entirely with the music path's own P175 catalogue and
// would just duplicate a musician's own songs under a second label.
const GENERAL_ORIGIN_LABEL = { 'notable work': 'Notable work', creator: 'Work', author: 'Written work', architect: 'Building', inventor: 'Discovery' };
const GENERAL_LIST_QUERY = (qid) => `SELECT ?item ?itemLabel ?origin WHERE {
  { wd:${qid} wdt:P800 ?item . BIND("notable work" AS ?origin) }
  UNION { ?item wdt:P170 wd:${qid} . BIND("creator" AS ?origin) }
  UNION { ?item wdt:P50 wd:${qid} . BIND("author" AS ?origin) }
  UNION { ?item wdt:P84 wd:${qid} . BIND("architect" AS ?origin) }
  UNION { ?item wdt:P61 wd:${qid} . BIND("inventor" AS ?origin) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul" }
} LIMIT 300`;
// Flat — no GROUP BY/aggregate alongside the label service: that combination
// reliably 500s the query service with a StackOverflowError (found live,
// 2026-09-21), even for as few as four items. A work with more than one
// P31 type or more than one candidate date just yields extra rows here,
// collapsed to one in JS below (first type, earliest date) instead.
const GENERAL_DETAIL_QUERY = (qids) => `SELECT ?item ?tyLabel ?date ?dateProp WHERE {
  VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} }
  OPTIONAL { ?item wdt:P31 ?ty }
  OPTIONAL { ?item wdt:P577 ?d1 } OPTIONAL { ?item wdt:P571 ?d2 } OPTIONAL { ?item wdt:P585 ?d3 }
  BIND(COALESCE(?d1,?d2,?d3) AS ?date)
  BIND(IF(BOUND(?d1),"P577",IF(BOUND(?d2),"P571",IF(BOUND(?d3),"P585",""))) AS ?dateProp)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}`;
const GENERAL_CACHE_KEY = (qid) => `c7-works-other:${qid}`;

async function fetchGeneralWorks(qid, onProgress = () => {}) {
  try { const c = JSON.parse(sessionStorage.getItem(GENERAL_CACHE_KEY(qid)) || 'null'); if (c && Date.now() - c.at < CACHE_MS) return c.rows.map((r) => ({ ...r, families: new Set(r.families) })); } catch (_) { /* no cache */ }
  const ask = async (query) => { const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`; try { return await getJSON(url); } catch (e) { if (!/\((429|500|502|503|504)\)/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 2000)); return getJSON(url); } };
  onProgress('checking for other works…');
  const data = await ask(GENERAL_LIST_QUERY(qid));
  const bindings = (data.results && data.results.bindings) || [];
  const byQid = new Map(); // first origin wins — a "notable work" also reachable via P170 stays "creator"
  for (const b of bindings) {
    const q = /Q\d+$/.exec(b.item.value)[0];
    if (byQid.has(q)) continue;
    byQid.set(q, { qid: q, label: b.itemLabel ? b.itemLabel.value : '', origin: b.origin.value });
  }
  const items = [...byQid.values()];
  const qids = items.map((i) => i.qid);
  const details = new Map(); // qid -> { typeLabel, date, dateProp }
  for (let i = 0; i < qids.length; i += 200) {
    const chunk = qids.slice(i, i + 200);
    onProgress(`other works ${Math.min(i + 200, qids.length)} of ${qids.length}`);
    let d = null;
    try { d = await ask(GENERAL_DETAIL_QUERY(chunk)); } catch (_) { d = null; }
    for (const b of (d && d.results && d.results.bindings) || []) {
      const q = /Q\d+$/.exec(b.item.value)[0];
      const existing = details.get(q) || { typeLabel: null, date: null, dateProp: null };
      if (!existing.typeLabel && b.tyLabel) existing.typeLabel = b.tyLabel.value;
      const iso = b.date ? b.date.value.slice(0, 10) : null;
      if (iso && (!existing.date || iso < existing.date)) { existing.date = iso; existing.dateProp = b.dateProp ? b.dateProp.value : null; }
      details.set(q, existing);
    }
  }
  const rows = items.map((it) => {
    const d = details.get(it.qid) || {};
    const date = d.date ? { iso: d.date, prec: /-01-01$/.test(d.date) ? 9 : 11 } : null;
    return {
      qid: it.qid, memberQids: [it.qid], label: it.label || it.qid, group: 'other',
      families: new Set(['other']), typeLabel: d.typeLabel || GENERAL_ORIGIN_LABEL[it.origin] || 'Work', compilation: false,
      date, display: displayDate(date), dateSource: date ? 'item' : null, dateProp: d.dateProp || null, shared: false, suspect: false,
    };
  });
  rows.sort((a, b) => {
    const ka = a.date ? dateRange(a.date)[0] : '9999', kb = b.date ? dateRange(b.date)[0] : '9999';
    return ka < kb ? -1 : ka > kb ? 1 : a.label.localeCompare(b.label);
  });
  try { sessionStorage.setItem(GENERAL_CACHE_KEY(qid), JSON.stringify({ at: Date.now(), rows: rows.map((r) => ({ ...r, families: [...r.families] })) })); } catch (_) { /* storage full or blocked — fine */ }
  return rows;
}

/**
 * Everything Wikidata calls a work of this person's, music and otherwise —
 * the musician's catalogue (`fetchMusicWorks`) plus paintings, books,
 * buildings and discoveries (`fetchGeneralWorks`), merged into one list. The
 * two sources fail independently — a musician with no notable-work links
 * still sees her full discography if the general lookup errors, and vice
 * versa — UNLESS both fail, in which case the caller needs the real error,
 * not a false "no works" (silently swallowing both would tell her a subject
 * has no works at all when the truth is just that the service is down). A
 * lone failure is not swallowed either: `rows.failedSource` names which side
 * came back empty on an error (not "genuinely has none") so the picker can
 * say so instead of presenting a partial list as the whole truth (found
 * live, 2026-09-21: Wikidata's own query service intermittently 500s the
 * music list query under load — Lily Allen's discography vanished with no
 * sign anything had gone wrong until this was added).
 */
export async function fetchWorks(qid, onProgress = () => {}) {
  const [music, general] = await Promise.allSettled([
    fetchMusicWorks(qid, onProgress),
    fetchGeneralWorks(qid, onProgress),
  ]);
  if (music.status === 'rejected' && general.status === 'rejected') throw music.reason;
  const rows = [...(music.status === 'fulfilled' ? music.value : []), ...(general.status === 'fulfilled' ? general.value : [])];
  rows.sort((a, b) => {
    const ka = a.date ? dateRange(a.date)[0] : '9999', kb = b.date ? dateRange(b.date)[0] : '9999';
    return ka < kb ? -1 : ka > kb ? 1 : ((b.date && b.date.prec) || 0) - ((a.date && a.date.prec) || 0) || a.label.localeCompare(b.label);
  });
  if (music.status === 'rejected') rows.failedSource = 'music';
  else if (general.status === 'rejected') rows.failedSource = 'general';
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
    const cite = `Source: Wikidata https://www.wikidata.org/wiki/${w.qid} (${w.dateProp || 'P577'}${w.dateSource === 'album' ? ', via the album' : ''})`;
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
