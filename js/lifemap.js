// The person as a picture (her ask, 2026-09-07 — SPEC §13g): a life line
// of their years coloured by personal year with what they did on it, the
// "why" of a mark (their year, the year's animal against theirs, the pair
// they married), and the circle — who they married, who their family are —
// with the compatibility drawn on each card. Everything here is computed
// from what the record already holds; nothing is guessed. Words stay short
// (her pick: labels visible, sentences behind a tap).
import { personalYear, lifePath } from './numerology.js';
import { signFor, animalIndex, ANIMALS } from './chinese.js';
import { sunSign } from './western.js';
import { relation } from './relations.js';
import { exactBirth, exactDeath } from './person-dates.js';
import { relationGlyph, animalLabel, animalChipHtml, signChipHtml, signGlyph, signElement, emptyState } from './indicators.js';
import { resolveAssetUrl, preloadImage } from './assets.js';
import { fetchItemPhoto, saveEventPhotoFromUrl } from './lookup.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const initials = (name) => String(name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const yearOf = (iso) => { const y = parseInt(String(iso || '').slice(0, 4), 10); return Number.isFinite(y) && y > 0 ? y : null; };

// ---- personal year: tone and her GG33 gloss (one line each) ----
export const PY_GLOSS = {
  1: 'new beginnings — start, lead',
  2: 'cooperate — partnerships, patience',
  3: 'social, creative, lucky',
  4: 'hard work — law and money surface',
  5: 'change, travel, impulse',
  6: 'family asks more — mend, nurture',
  7: 'learn alone — don’t start, don’t marry',
  8: 'money & power — karma lands',
  9: 'release — finish, don’t start',
  11: 'vision or chaos — control emotion',
  22: 'build or destroy, at scale',
  33: 'a turning point — rare',
};
export function pyTone(v) {
  if (v === 1 || v === 8) return 'gold';
  if (v === 3 || v === 5) return 'teal';
  if (v === 7 || v === 9) return 'red';
  if (v === 11 || v === 22 || v === 33) return 'violet';
  return v == null ? 'none' : 'grey';
}

// ---- her GG33 life-path compatibility tiers, read from the first number's side ----
const LP = {
  1: { best: [11], good: [3, 4, 7, 8], master: [6], enemy: [9] },
  2: { best: [8], good: [3, 4, 5, 6], enemy: [9] },
  3: { best: [5], good: [1, 2, 3, 6, 8, 9, 11, 22, 33], enemy: [4], fifty: [7] },
  4: { best: [6, 8, 9], good: [1, 2, 7], enemy: [3], bad: [5] },
  5: { best: [3], good: [2, 8, 9, 33], bad: [4], enemy: [6] },
  6: { best: [4], good: [2, 3, 9], slave: [1], enemy: [5] },
  7: { best: [5, 11], good: [1, 4], enemy: [8], fifty: [3] },
  8: { best: [2, 4, 22, 33], good: [1, 3, 5], enemy: [7, 8] },
  9: { best: [4], good: [3, 5, 6], enemy: [1, 2, 11, 22] },
  11: { best: [7], good: [3, 11, 22, 33], enemy: [9] },
  22: { best: [8], good: [3, 11, 22, 33], enemy: [9] },
  33: { best: [8], good: [3, 5, 11, 22, 33], enemy: [] },
};
const TIER_LABEL = { best: 'best', good: 'good', neutral: 'neutral', enemy: 'enemy', bad: 'bad', fifty: '50/50', master: '1 leads', slave: '1 leads' };
export function lpTier(a, b) {
  const row = LP[a];
  if (!row) return 'neutral';
  for (const t of ['best', 'good', 'master', 'slave', 'fifty', 'bad', 'enemy']) if ((row[t] || []).includes(b)) return t;
  return 'neutral';
}

// ---- Western elements: the classic pairing, shown lighter — not a GG33 rule ----
export function elementPair(signA, signB) {
  const a = signElement(signA), b = signElement(signB);
  if (!a || !b) return null;
  if (a === b) return { cls: 'same', label: 'same element' };
  const pair = [a, b].sort().join('+');
  if (pair === 'air+fire' || pair === 'earth+water') return { cls: 'getson', label: 'get on' };
  if (pair === 'fire+water' || pair === 'air+earth') return { cls: 'clash', label: 'clash' };
  return { cls: 'neutral', label: 'neutral' };
}

// ---- marks: what a dated event is, as one glyph ----
const MILESTONE = new Set(['chart', 'certification', 'award', 'deal']);
export const MARK_GLYPH = { release: '♪', marriage: '♥', divorce: '✕', death: '✝', milestone: '★', trial: '⚖', crisis: '⚠', move: '⌂', business: '▣', birth: '●', other: '◆' };
export const MARK_LABEL = { release: 'release', marriage: 'married', divorce: 'ended', death: 'died', milestone: 'milestone', trial: 'trial', crisis: 'crisis', move: 'moved', business: 'business', other: 'event' };
export function markKind(ev) {
  const t = String(ev.title || '').toLowerCase();
  const k = ev.kind || 'other';
  if (k === 'divorce' || /\bdivorc|\bseparat|\bannul/.test(t)) return 'divorce';
  if (k === 'death') return 'death';
  if (k === 'marriage') return 'marriage';
  if (k === 'release') return 'release';
  if (MILESTONE.has(k)) return 'milestone';
  if (k === 'birth') return 'birth';
  if (k === 'trial' || /\btrial\b|\bcourt\b|acquit|verdict|lawsuit|\bsued\b|convict/.test(t)) return 'trial';
  if (k === 'crisis' || /allegation|accus|arrest|scandal|crisis|bankrupt|overdose|accident|hospital/.test(t)) return 'crisis';
  if (k === 'move') return 'move';
  if (k === 'business') return 'business';
  return 'other';
}
export function eventYear(ev) {
  if (ev.date) return yearOf(ev.date);
  if (ev.date_year_min) return ev.date_year_min;
  return null;
}
function fmtWhen(m) {
  if (m.precision === 'day' && m.date && /^\d{4}-\d{2}-\d{2}/.test(m.date)) return new Date(`${String(m.date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (m.precision === 'month' && m.date && /^\d{4}-\d{2}/.test(m.date)) return new Date(`${String(m.date).slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return String(m.year);
}

/**
 * The life line's data: every year from birth (or the first dated thing)
 * to death (or now) with its personal year, and the marks on it. Outcomes
 * are inferred only where the record says so — a divorce ends a marriage,
 * a milestone worked, a death is an end — and her tags win over inference.
 */
export function buildLifeLine({ person, events, rels, people, outcomes }) {
  const birth = exactBirth(person); // day precision or null — never person.birth_date raw
  const birthYear = birth ? yearOf(birth) : (person.birth_year_min || yearOf(person.birth_date));
  const deathISO = exactDeath(person) || person.death_date || null;
  const deathYear = deathISO ? yearOf(deathISO) : null;
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const marks = [];
  for (const ev of events) {
    if (ev.theory_id) continue; // a theory timeline is not the record
    const y = eventYear(ev);
    if (y == null) continue;
    const kind = markKind(ev);
    if (kind === 'birth') continue; // the ribbon starts there
    marks.push({ id: ev.id, year: y, kind, glyph: MARK_GLYPH[kind], title: ev.title, date: ev.date, precision: ev.date ? (ev.date_precision || 'day') : 'year', event: ev });
  }
  // spouses: a relationship with a start year but no ♥ that year gets one; an end year gets a ✕
  for (const r of rels || []) {
    if (r.kind !== 'spouse' || r.theory_id) continue;
    const other = byId.get(r.a_id === person.id ? r.b_id : r.a_id);
    const sy = yearOf(r.start_date), ey = yearOf(r.end_date);
    if (sy && !marks.some((m) => m.kind === 'marriage' && m.year === sy)) marks.push({ id: `rel:${r.id}`, year: sy, kind: 'marriage', glyph: '♥', title: other ? `Married ${other.display_name}` : 'Married', date: r.start_date, precision: 'year', rel: r, spouseId: other ? other.id : null });
    if (ey && !marks.some((m) => m.kind === 'divorce' && m.year === ey)) marks.push({ id: `relend:${r.id}`, year: ey, kind: 'divorce', glyph: '✕', title: other ? `Ended with ${other.display_name}` : 'Ended', date: r.end_date, precision: 'year', rel: r, spouseId: other ? other.id : null });
    for (const m of marks) {
      if (m.spouseId || !other) continue;
      if ((m.kind === 'marriage' && m.year === sy) || (m.kind === 'divorce' && m.year === ey)) m.spouseId = other.id;
      else if ((m.kind === 'marriage' || m.kind === 'divorce') && String(m.title).toLowerCase().includes(String(other.display_name).split(/\s+/)[0].toLowerCase())) m.spouseId = other.id;
    }
  }
  if (deathYear && !marks.some((m) => m.kind === 'death')) marks.push({ id: 'death', year: deathYear, kind: 'death', glyph: '✝', title: 'Died', date: deathISO, precision: exactDeath(person) ? 'day' : 'year' });
  marks.sort((a, b) => a.year - b.year || String(a.date || '').localeCompare(String(b.date || '')));
  for (const m of marks) {
    const tagged = m.event && outcomes ? outcomes.get(m.event.id) || null : null;
    let inferred = null;
    if (m.kind === 'milestone') inferred = 'worked';
    else if (m.kind === 'divorce') inferred = 'failed';
    else if (m.kind === 'death') inferred = 'end';
    else if (m.kind === 'marriage') {
      const ended = marks.some((x) => x.kind === 'divorce' && x.year >= m.year && (!m.spouseId || !x.spouseId || x.spouseId === m.spouseId));
      if (ended) inferred = 'failed';
    }
    m.tagged = tagged;
    m.outcome = tagged || inferred;
    m.inferred = !tagged && !!inferred;
  }
  const yearsFrom = birthYear || (marks.length ? Math.min(...marks.map((m) => m.year)) : null);
  const yearsTo = deathYear || Math.max(new Date().getFullYear(), ...marks.map((m) => m.year));
  const years = [];
  if (yearsFrom) {
    for (let y = yearsFrom; y <= yearsTo; y++) {
      const py = birth ? personalYear(birth, y) : null;
      years.push({ year: y, py: py && py.ok ? py.value : null, master: !!(py && py.ok && py.master), total: py && py.ok ? py.parts.total : null });
    }
  }
  return { birth, birthYear, deathYear, years, marks, yearsFrom, yearsTo };
}

// one mark standing for several of the same kind in one year
const CLUSTER_WORD = { award: 'awards', release: 'releases', chart: 'chart entries', certification: 'certifications', deal: 'deals', move: 'moves', business: 'business moves', marriage: 'marriages', divorce: 'endings', milestone: 'milestones', trial: 'trials', crisis: 'crises', birth: 'births', other: 'events' };
function clusterMark(group) {
  const first = group[0];
  const kinds = new Set(group.map((m) => (m.event && m.event.kind) || m.kind));
  const word = CLUSTER_WORD[kinds.size === 1 ? [...kinds][0] : first.kind] || CLUSTER_WORD[first.kind] || 'events';
  const outcomes = new Set(group.map((m) => m.outcome || null));
  return {
    id: `cluster:${first.year}:${first.kind}`, year: first.year, kind: first.kind, glyph: first.glyph,
    title: `${group.length} ${word}`, date: null, precision: 'year',
    cluster: group, event: null, rel: null, spouseId: null,
    tagged: null, inferred: false, outcome: outcomes.size === 1 ? [...outcomes][0] : null,
  };
}

function outcomeChip(m) {
  if (m.outcome === 'worked') return '<span class="lm-v lm-v-best">✓ worked</span>';
  if (m.outcome === 'failed') return '<span class="lm-v lm-v-enemy">✕ failed</span>';
  if (m.outcome === 'end') return '<span class="lm-v lm-v-enemy">✝ end</span>';
  return '<span class="lm-v lm-v-neutral">not yet judged</span>';
}

// life-events.js encodes a fetched item as `${personQid}/${prop}/${itemQid}`
// (a marriage/divorce candidate adds a trailing /start or /end) — the
// poster's picture fetch wants just the item on the far end: the award,
// the place, the school. Anything else (a release's own bare qid, a
// hand-typed event with none at all) has no item to look up.
function itemQidFromComposite(wid) {
  const parts = String(wid || '').split('/');
  return parts.length === 3 && /^Q\d+$/.test(parts[2]) ? parts[2] : null;
}

/**
 * The poster's picture, her rule (2026-09-13): a marriage's own spouse —
 * already in the app, no fetch — or the place/school/award's own picture,
 * read from Wikidata once and cached on the event row; a release (or
 * anything with nothing to fetch) goes without one rather than a fake.
 * Returns { src, label } or null — null always falls back to the plain glyph.
 */
async function resolveMarkPicture(m, { people, store }) {
  if (m.cluster) return null; // stands for several — no one picture is honest
  if ((m.kind === 'marriage' || m.kind === 'divorce') && m.spouseId) {
    const spouse = (people || []).find((p) => p.id === m.spouseId);
    if (!spouse) return null;
    const src = spouse.photo_path ? await resolveAssetUrl(spouse.photo_path, 'image/jpeg') : spouse.photo_url;
    return src && await preloadImage(src) ? { src, label: `${spouse.display_name}’s picture` } : null;
  }
  if (!m.event || !['award', 'move', 'other'].includes(m.kind)) return null;
  const itemQid = itemQidFromComposite(m.event.wikidata_id);
  if (!itemQid) return null;
  let src = m.event.photo_path ? await resolveAssetUrl(m.event.photo_path, 'image/jpeg') : m.event.photo_url;
  if (!src && store) {
    try {
      const { photoUrl } = await fetchItemPhoto(itemQid);
      if (photoUrl) { await saveEventPhotoFromUrl(store, m.event.id, photoUrl); src = photoUrl; }
    } catch (_) { /* the picture is a nicety, not the record */ }
  }
  const label = { award: 'the award’s picture', move: 'the place’s picture', other: 'the school’s picture' }[m.kind];
  return src && await preloadImage(src) ? { src, label } : null;
}

/**
 * The poster (her ask, 2026-09-13 — "our story"): a spine running through
 * every dated thing, each stretch toned by that card's own personal year;
 * the ring on the spine holds the number, the card carries the picture —
 * her spouse's own face, or the place/school/award's picture from
 * Wikipedia, or (mostly releases) none at all rather than a fake one.
 * Vertical on the phone, cards left/right; horizontal on the desktop,
 * cards above/below — her own words, a deliberate exception to one layout
 * everywhere (CSS carries the flip; this file builds one DOM shape).
 * onPick(mark, button) when a card is tapped; the verdict panel it drives
 * lives elsewhere on the page, unchanged.
 */
export async function renderLifeLine(el, data, { onPick, onAdd = null, store = null, people = [] } = {}) {
  el.innerHTML = '';
  if (!data.years.length) {
    el.appendChild(emptyState({ missing: 'No years to draw yet.', why: 'A birth date (even just the year) or one dated event starts the life line.', action: onAdd ? '+ Add an event' : null, onAction: onAdd }));
    return;
  }
  // same kind, same year → one mark with a count: nine Grammys in 1984 are
  // "★ ×9", not nine cards crowding one spot (seen on the first real
  // Wikidata pull, 2026-09-07)
  const groups = new Map();
  for (const m of data.marks) {
    const k = `${m.year}|${m.kind}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const shown = [...groups.values()].map((g) => (g.length === 1 ? g[0] : clusterMark(g)));
  if (!shown.length) {
    el.appendChild(emptyState({ missing: 'Nothing dated yet.', why: 'A birth date starts the years; an event or a relationship starts the story.', action: onAdd ? '+ Add an event' : null, onAction: onAdd }));
    return;
  }
  await Promise.all(shown.map(async (m) => { m._pic = await resolveMarkPicture(m, { people, store }); }));

  const poster = document.createElement('div');
  poster.className = 'lm-poster';
  shown.forEach((m, i) => {
    const y = data.years.find((x) => x.year === m.year);
    const py = y ? y.py : null;
    const tone = pyTone(py);
    const row = document.createElement('div');
    row.className = `lm-poster-row ${i % 2 ? 'side-b' : 'side-a'}`;
    const seg = document.createElement('i');
    seg.className = `lm-spine-seg lm-t-${tone}`;
    const node = document.createElement('div');
    node.className = 'lm-poster-node';
    node.innerHTML = py != null ? `<span class="lm-py lm-t-${tone}">${py}</span>` : `<span class="lm-py lm-t-none">·</span>`;
    node.title = py != null ? `${m.year} · personal year ${y.total}/${py}${y.master ? ' (master)' : ''} — ${PY_GLOSS[py] || ''}` : String(m.year);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `lm-mark lm-o-${m.outcome || 'none'}`;
    card.dataset.id = m.id;
    card.dataset.year = String(m.year);
    card.innerHTML = `
      <div class="lm-poster-pic${m._pic ? '' : ' glyph'}">${m._pic ? `<img alt="" title="${esc(m._pic.label)}" src="${m._pic.src}">` : `<span class="g">${m.glyph}</span>`}</div>
      <div class="lm-poster-body">
        <div class="lm-poster-title">${esc(m.title)}</div>
        <div class="lm-poster-date mono">${fmtWhen(m)}${m.cluster ? ` <span class="n">×${m.cluster.length}</span>` : ''}</div>
      </div>
      ${m.outcome ? `<span class="lm-poster-oc lm-o-${m.outcome}">${m.outcome === 'worked' ? '✓' : m.outcome === 'end' ? '✝' : '✕'}</span>` : ''}`;
    card.title = `${m.title} · ${m.year}${m.outcome ? ' · ' + m.outcome : ''}`;
    card.addEventListener('click', () => {
      poster.querySelectorAll('.lm-mark.on').forEach((x) => x.classList.remove('on'));
      card.classList.add('on');
      onPick(m, card);
    });
    row.append(seg, node, card);
    poster.appendChild(row);
  });
  el.appendChild(poster);
}

// ---- Their Story: a relationship's own timeline (her ask, 2026-09-15 —
// "boards and timelines of relationships like camilla and charles, when
// they met, etc etc milestones of relationship plus photos and evidence").
// A relationship has no birth date, so there is no personal year to tone
// the spine with — every segment stays neutral (lm-t-none) rather than
// faking one. Reuses the poster's own CSS and card shape; not buildLifeLine
// itself, because a milestone's picture is its own uploaded photo, never a
// spouse's face or a Wikidata fetch.
export const REL_KINDS = [
  ['met', 'Met', '☆'],
  ['engaged', 'Engaged', '◈'],
  ['married', 'Married', '♥'],
  ['separated', 'Separated', '✕'],
  ['reunited', 'Reunited', '↻'],
  ['other', 'Other', '◆'],
];
const REL_KIND_SET = new Set(REL_KINDS.map(([k]) => k));
const REL_GLYPH = Object.fromEntries(REL_KINDS.map(([k, , g]) => [k, g]));

/**
 * The relationship's own marks: her typed milestones (met, engaged, a
 * custom "on-and-off" note — each an event with relationship_id set, never
 * person_id) plus "Married" / "Separated" synthesized from the
 * relationship's own start_date/end_date — the same record the tree's "m.
 * 2005" marker and each person's own poster already read — UNLESS a typed
 * milestone already covers that year and kind, so a hand-written "Married"
 * with its own evidence is never shadowed by the bare date underneath it.
 */
export function buildRelationshipLine({ relationship, events }) {
  const marks = [];
  for (const ev of events || []) {
    if (ev.theory_id) continue;
    const y = eventYear(ev);
    if (y == null) continue;
    const kind = REL_KIND_SET.has(ev.kind) ? ev.kind : 'other';
    marks.push({ id: ev.id, year: y, kind, glyph: REL_GLYPH[kind], title: ev.title, date: ev.date, precision: ev.date ? (ev.date_precision || 'day') : 'year', event: ev });
  }
  const sy = yearOf(relationship.start_date), ey = yearOf(relationship.end_date);
  if (sy && !marks.some((m) => m.kind === 'married' && m.year === sy)) marks.push({ id: `rel:${relationship.id}:start`, year: sy, kind: 'married', glyph: REL_GLYPH.married, title: 'Married', date: relationship.start_date, precision: 'year', event: null });
  if (ey && !marks.some((m) => m.kind === 'separated' && m.year === ey)) marks.push({ id: `rel:${relationship.id}:end`, year: ey, kind: 'separated', glyph: REL_GLYPH.separated, title: 'Separated', date: relationship.end_date, precision: 'year', event: null });
  marks.sort((a, b) => a.year - b.year || String(a.date || '').localeCompare(String(b.date || '')));
  return { marks };
}

async function resolveRelMarkPicture(m) {
  if (!m.event) return null;
  const src = m.event.photo_path ? await resolveAssetUrl(m.event.photo_path, 'image/jpeg') : m.event.photo_url;
  return src && await preloadImage(src) ? { src, label: m.title } : null;
}

/** The relationship's own spine — same card shape as renderLifeLine, no outcome judging, no personal-year tone. */
export async function renderRelationshipLine(el, data, { onPick, onAdd = null } = {}) {
  el.innerHTML = '';
  if (!data.marks.length) {
    el.appendChild(emptyState({ missing: 'No milestones yet.', why: 'When they met, got engaged, married — whatever you know, each with its own evidence.', action: onAdd ? '+ Milestone' : null, onAction: onAdd }));
    return;
  }
  await Promise.all(data.marks.map(async (m) => { m._pic = await resolveRelMarkPicture(m); }));
  const poster = document.createElement('div');
  poster.className = 'lm-poster';
  data.marks.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = `lm-poster-row ${i % 2 ? 'side-b' : 'side-a'}`;
    const seg = document.createElement('i');
    seg.className = 'lm-spine-seg lm-t-none';
    const node = document.createElement('div');
    node.className = 'lm-poster-node';
    node.innerHTML = '<span class="lm-py lm-t-none">·</span>';
    node.title = String(m.year);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'lm-mark';
    card.dataset.id = m.id;
    card.innerHTML = `
      <div class="lm-poster-pic${m._pic ? '' : ' glyph'}">${m._pic ? `<img alt="" src="${m._pic.src}">` : `<span class="g">${m.glyph}</span>`}</div>
      <div class="lm-poster-body">
        <div class="lm-poster-title">${esc(m.title)}</div>
        <div class="lm-poster-date mono">${fmtWhen(m)}</div>
      </div>`;
    card.title = `${m.title} · ${m.year}`;
    card.addEventListener('click', () => {
      poster.querySelectorAll('.lm-mark.on').forEach((x) => x.classList.remove('on'));
      card.classList.add('on');
      onPick(m);
    });
    row.append(seg, node, card);
    poster.appendChild(row);
  });
  el.appendChild(poster);
}

/** The verdict chips for a pair: animals (STYLE §5 glyph + word), her GG33 life-path tier, the Western elements (lighter). */
export function verdictChips(a, b) {
  const out = [];
  const chip = (cls, glyphEl, text) => {
    const s = document.createElement('span');
    s.className = `lm-v ${cls}`;
    if (glyphEl) s.appendChild(glyphEl);
    s.appendChild(document.createTextNode(text));
    return s;
  };
  const sa = signFor(exactBirth(a)), sb = signFor(exactBirth(b));
  if (sa.ok && sb.ok && !sa.boundary && !sb.boundary) {
    const k = relation(sa.animalIndex, sb.animalIndex);
    out.push(chip(`lm-v-${k}`, relationGlyph(k), `${animalLabel(sa.animal)} · ${animalLabel(sb.animal)} ${k}`));
  } else {
    out.push(chip('lm-v-unknown', relationGlyph('neutral', { unsettled: true }), 'animals — needs both birth dates'));
  }
  const la = lifePath(exactBirth(a)), lb = lifePath(exactBirth(b));
  if (la.ok && lb.ok) {
    const t = lpTier(la.value, lb.value);
    out.push(chip(`lm-v-${t}`, null, `LP ${la.value} × ${lb.value} ${TIER_LABEL[t]}`));
  } else {
    out.push(chip('lm-v-unknown', null, 'LP — needs both full birth dates'));
  }
  const wa = sunSign(exactBirth(a)), wb = sunSign(exactBirth(b));
  if (wa.ok && wb.ok) {
    const p = elementPair(wa.sign, wb.sign);
    if (p) out.push(chip(`lm-v-el lm-v-${p.cls}`, null, `${signGlyph(wa.sign) || ''} ${wa.sign} · ${signGlyph(wb.sign) || ''} ${wb.sign} ${p.label}`));
  }
  return out;
}

/** The "why" card for a tapped mark. onOutcome(mark, 'worked'|'failed'|null) when she tags it. */
export function renderWhyCard(el, m, data, { person, people, onOutcome }) {
  const y = data.years.find((x) => x.year === m.year);
  const py = y ? y.py : null;
  const me = signFor(exactBirth(person));
  const yIdx = animalIndex(m.year);
  const yearAnimal = ANIMALS[yIdx];
  const yr = me.ok && !me.boundary ? relation(me.animalIndex, yIdx) : null;
  const spouse = m.spouseId ? (people || []).find((p) => p.id === m.spouseId) : null;
  const yearLine = yr
    ? `${m.year} = ${yearAnimal} year — ${yr === 'neutral' ? 'neutral to' : yr + ' with'} a ${animalLabel(me.animal)}`
    : `${m.year} = ${yearAnimal} year`;
  el.innerHTML = `
    <div class="lm-why">
      <span class="k">what</span>
      ${m.cluster
        ? `<span class="line" style="flex-direction:column;align-items:flex-start;gap:2px"><b>${m.glyph} ${esc(m.title)} · ${m.year}</b>${m.cluster.map((x) => `<span style="display:flex;gap:8px;align-items:baseline"><span class="mono dim" style="width:88px;flex:none">${fmtWhen(x)}</span><span>${esc(x.title)}</span>${x.outcome ? outcomeChip(x) : ''}</span>`).join('')}</span>`
        : `<span class="line"><b>${m.glyph} ${esc(m.title)}</b><span class="mono dim">${fmtWhen(m)}</span>${outcomeChip(m)}</span>`}
      <span class="k">their year</span>
      <span class="line">${py != null ? `<span class="lm-py lm-t-${pyTone(py)}">${py}</span><span>personal year ${y.total}/${py} — ${PY_GLOSS[py] || ''}</span>` : '<span class="dim">personal year needs a full birth date</span>'}<span class="mono dim">${yearLine}</span></span>
      ${spouse ? '<span class="k">the two</span><span class="line" id="lm-pair"></span>' : ''}
      ${m.event ? `<span class="k">judge</span><span class="line"><button type="button" class="lm-v lm-v-best lm-tag ${m.tagged === 'worked' ? 'on' : ''}" data-oc="worked">✓ worked</button><button type="button" class="lm-v lm-v-enemy lm-tag ${m.tagged === 'failed' ? 'on' : ''}" data-oc="failed">✕ failed</button>${m.inferred ? '<span class="dim">from the record — tap to overrule</span>' : m.tagged ? '<span class="dim">your call — tap again to clear</span>' : ''}</span>` : `<span class="k">judge</span><span class="line dim">${m.cluster ? 'judge each one from the year list' : 'from the relationship record'}</span>`}
    </div>`;
  if (spouse) el.querySelector('#lm-pair').append(...verdictChips(person, spouse));
  el.querySelectorAll('[data-oc]').forEach((b) => b.addEventListener('click', () => onOutcome(m, m.tagged === b.dataset.oc ? null : b.dataset.oc)));
}

/** The circle: spouse cards first (married → ended, both personal years), then family, each with the verdict chips. */
export async function renderCircle(el, { person, rels, people, data, onOpen, onAdd = null, onStory = null }) {
  el.innerHTML = '';
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const items = [];
  for (const r of rels || []) {
    if (r.theory_id) continue;
    const otherId = r.a_id === person.id ? r.b_id : r.a_id;
    const other = byId.get(otherId);
    if (!other) continue;
    const rel = r.kind === 'parent' ? (r.a_id === person.id ? 'child' : 'parent')
      : r.kind === 'godparent' ? (r.a_id === person.id ? 'godchild' : 'godparent')
      : r.kind;
    items.push({ other, rel, r });
  }
  const order = { spouse: 0, parent: 1, child: 2, sibling: 3, godparent: 4, godchild: 5 };
  items.sort((a, b) => ((order[a.rel] ?? 9) - (order[b.rel] ?? 9)) || String(a.r.start_date || '').localeCompare(String(b.r.start_date || '')));
  if (!items.length) {
    el.appendChild(emptyState({ missing: 'No one in the circle yet.', why: 'Spouses and family come from the tree — or "Insert family" under + Add for a public figure.', action: onAdd ? '+ Add' : null, onAction: onAdd }));
    return;
  }
  const cards = await Promise.all(items.map(async ({ other, rel, r }) => {
    const card = document.createElement('div');
    card.className = 'lm-card';
    const face = document.createElement('div');
    face.className = 'face';
    face.style.width = face.style.height = '44px';
    face.innerHTML = `<span class="initials">${initials(other.display_name)}</span>`;
    const src = other.photo_path ? await resolveAssetUrl(other.photo_path, 'image/jpeg') : other.photo_url;
    if (src && await preloadImage(src)) {
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      face.querySelector('.initials')?.remove();
      face.appendChild(img);
    }
    let line;
    if (rel === 'spouse') {
      let sy = yearOf(r.start_date), ey = yearOf(r.end_date);
      if (!sy) { const mk = data.marks.find((m) => m.kind === 'marriage' && m.spouseId === other.id); if (mk) sy = mk.year; }
      if (!ey) { const mk = data.marks.find((m) => m.kind === 'divorce' && m.spouseId === other.id); if (mk) ey = mk.year; }
      const pyS = sy && data.birth ? personalYear(data.birth, sy) : null;
      const pyE = ey && data.birth ? personalYear(data.birth, ey) : null;
      line = `♥ ${sy || '—'}${ey ? ` · ✕ ${ey}` : ''}${pyS && pyS.ok ? ` · <span class="mono">PY ${pyS.parts.total}/${pyS.value}${pyE && pyE.ok ? ` → ${pyE.parts.total}/${pyE.value}` : ''}</span>` : ''}`;
    } else {
      const s = signFor(exactBirth(other));
      const lp = lifePath(exactBirth(other));
      line = `${rel}${s.ok && !s.boundary ? ` · ${s.element} ${animalLabel(s.animal)}` : ''}${lp.ok ? ` · LP ${lp.value}` : ''}`;
    }
    card.innerHTML = `<div class="lm-card-body"><div class="who">${esc(other.display_name)}</div><div class="rel">${line}</div><div class="lm-verdicts"></div></div>`;
    card.prepend(face);
    card.querySelector('.lm-verdicts').append(...verdictChips(person, other));
    if (rel === 'spouse' && onStory) {
      const story = document.createElement('button');
      story.type = 'button';
      story.className = 'linklike brass lm-story-link';
      story.textContent = 'Their Story →';
      story.addEventListener('click', (e) => { e.stopPropagation(); onStory(r.id); });
      card.querySelector('.lm-card-body').appendChild(story);
    }
    card.title = `${other.display_name} — open`;
    card.addEventListener('click', () => onOpen(other.id));
    return card;
  }));
  for (const c of cards) el.appendChild(c);
}

/** "Compare with…": pick anyone from any case (Fun included) and see the same chips, without adding a relationship. */
export function renderCompare(slot, { person, store, onOpen }) {
  slot.innerHTML = `
    <div class="search-box" style="max-width:380px"><span class="ic">⌕</span><input type="search" id="lm-cmp" placeholder="Compare with — any name, any case" autocomplete="off"></div>
    <div id="lm-cmp-res" class="stack" style="gap:2px;margin-top:6px"></div>
    <div id="lm-cmp-card"></div>`;
  const input = slot.querySelector('#lm-cmp');
  const res = slot.querySelector('#lm-cmp-res');
  const cardSlot = slot.querySelector('#lm-cmp-card');
  let timer = null;
  input.focus();
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      res.innerHTML = '';
      if (!q) return;
      const hits = (await store.searchAll(q)).filter((h) => h.type === 'person' && h.id !== person.id).slice(0, 8);
      for (const h of hits) {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.style.minHeight = '36px';
        row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${esc(h.label)}</div><div class="sub">${h.case_kind === 'fun' ? '✦ Fun' : esc(h.case_name)}</div></div>`;
        row.addEventListener('click', async () => {
          const other = await store.getPerson(h.id);
          res.innerHTML = '';
          input.value = '';
          if (!other) return;
          const card = document.createElement('div');
          card.className = 'lm-card lm-card-cmp';
          const face = document.createElement('div');
          face.className = 'face';
          face.style.width = face.style.height = '44px';
          face.innerHTML = `<span class="initials">${initials(other.display_name)}</span>`;
          card.innerHTML = `<div class="lm-card-body"><div class="who">${esc(other.display_name)}</div><div class="rel">compared, not related</div><div class="lm-verdicts"></div></div><button type="button" class="btn btn-ghost btn-sm" title="Clear">✕</button>`;
          card.prepend(face);
          card.querySelector('.lm-verdicts').append(...verdictChips(person, other));
          card.querySelector('.who').addEventListener('click', (e) => { e.stopPropagation(); onOpen(other.id); });
          card.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); card.remove(); });
          cardSlot.prepend(card);
        });
        res.appendChild(row);
      }
    }, 150);
  });
}

/** The header's three facts with a word each: life path (big number), animal (picture chip), sun (glyph chip). */
export function tokensHtml(person, { compact = false } = {}) {
  const b = exactBirth(person);
  const lp = lifePath(b);
  const ch = signFor(b);
  const su = sunSign(b);
  if (compact) {
    // a list row: the number, the animal, the sign — no words (her Q15, 2026-09-07);
    // one dim note when there is no full birth date to read them from
    if (!b) return '<span class="tk dim">needs a full birth date</span>';
    return [
      lp.ok ? `<span class="tk" title="life path ${lp.value}"><span class="big">${lp.value}${lp.master ? '★' : ''}</span></span>` : '',
      ch.ok && !ch.boundary ? `<span class="tk">${animalChipHtml(ch.animal)}</span>` : (ch.ok && ch.boundary ? '<span class="tk dim">near lunar new year</span>' : ''),
      su.ok ? `<span class="tk">${signChipHtml(su.sign)}</span>` : '',
    ].join('');
  }
  const lpHtml = lp.ok ? `<span class="tk"><span class="big">${lp.value}${lp.master ? '★' : ''}</span>life path</span>` : '<span class="tk dim"><span class="big dim">—</span>life path · needs a full birth date</span>';
  const anHtml = ch.ok && !ch.boundary ? `<span class="tk">${animalChipHtml(ch.animal)}<span class="dim">${ch.element}</span></span>` : `<span class="tk dim">${ch.ok && ch.boundary ? 'animal · near lunar new year' : ''}</span>`;
  const suHtml = su.ok ? `<span class="tk">${signChipHtml(su.sign)}${su.cusp ? '<span class="dim">cusp</span>' : ''}</span>` : '';
  return `${lpHtml}${anHtml}${suHtml}`;
}
