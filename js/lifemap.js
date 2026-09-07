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
      years.push({ year: y, py: py && py.ok ? py.value : null, master: !!(py && py.ok && py.master) });
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

/** The ribbon of years, the marks above it, the axis and the legend. onPick(mark, button) when a mark is tapped. */
export function renderLifeLine(el, data, { onPick, onAdd = null }) {
  el.innerHTML = '';
  if (!data.years.length) {
    el.appendChild(emptyState({ missing: 'No years to draw yet.', why: 'A birth date (even just the year) or one dated event starts the life line.', action: onAdd ? '+ Add an event' : null, onAction: onAdd }));
    return;
  }
  const n = data.years.length;
  const xOf = (year) => `clamp(12px, ${(((year - data.yearsFrom + 0.5) / n) * 100).toFixed(2)}%, calc(100% - 12px))`;
  const wrap = document.createElement('div');
  wrap.className = 'lm-life';
  const marks = document.createElement('div');
  marks.className = 'lm-marks';
  const ribbon = document.createElement('div');
  ribbon.className = 'lm-ribbon';
  for (const y of data.years) {
    const seg = document.createElement('i');
    seg.className = `lm-t-${pyTone(y.py)}`;
    seg.title = y.py != null ? `${y.year} · personal year ${y.py}${y.master ? ' (master)' : ''} — ${PY_GLOSS[y.py] || ''}` : String(y.year);
    ribbon.appendChild(seg);
  }
  const axis = document.createElement('div');
  axis.className = 'lm-axis mono';
  const ticks = [data.yearsFrom];
  for (let y = Math.ceil((data.yearsFrom + 3) / 10) * 10; y < data.yearsTo - 2; y += 10) ticks.push(y);
  ticks.push(data.yearsTo);
  for (const t of ticks) {
    const s = document.createElement('span');
    s.textContent = t;
    s.style.left = xOf(t);
    axis.appendChild(s);
  }
  // same kind, same year → one mark with a count: nine Grammys in 1984 are
  // "★ ×9", not a tower of nine stars pushing the ribbon off the screen
  // (seen on the first real Wikidata pull, 2026-09-07)
  const groups = new Map();
  for (const m of data.marks) {
    const k = `${m.year}|${m.kind}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  const shown = [...groups.values()].map((g) => (g.length === 1 ? g[0] : clusterMark(g)));
  for (const m of shown) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `lm-mark lm-o-${m.outcome || 'none'}`;
    b.dataset.id = m.id;
    b.dataset.year = String(m.year);
    b.style.left = xOf(m.year);
    b.innerHTML = `<span class="g">${m.glyph}</span><span class="y mono">${m.year}</span>${m.cluster ? `<span class="n mono">×${m.cluster.length}</span>` : ''}`;
    b.title = `${m.title} · ${m.year}${m.outcome ? ' · ' + m.outcome : ''}`;
    b.addEventListener('click', () => {
      marks.querySelectorAll('.lm-mark.on').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(m, b);
    });
    marks.appendChild(b);
  }
  wrap.append(marks, ribbon, axis);
  el.appendChild(wrap);

  const legend = document.createElement('div');
  legend.className = 'lm-legend';
  legend.innerHTML = data.birth
    ? `<span><b class="lm-t-gold"></b>1 · 8 start, money</span><span><b class="lm-t-teal"></b>3 · 5 social, change</span><span><b class="lm-t-red"></b>7 · 9 don’t start</span><span><b class="lm-t-violet"></b>11 · 22 master</span><span><b class="lm-t-grey"></b>2 · 4 · 6</span>`
    : '<span class="dim">personal years need a full birth date — the ribbon is uncoloured</span>';
  legend.innerHTML += `<span><i class="lm-key lm-o-worked"></i>worked</span><span><i class="lm-key lm-o-failed"></i>failed · ended</span><span><i class="lm-key"></i>not yet judged</span>`;
  el.appendChild(legend);

  // crowded marks stack into rows (her pick for the phone) — greedy by x, re-run on resize;
  // a row is one mark tall (22px glyph + year label) so a count badge never touches the label above
  const MIN = 36;
  const layout = () => {
    const w = ribbon.getBoundingClientRect().width || 1;
    const lastX = [];
    let rows = 1;
    for (const b of marks.children) {
      const pct = ((parseInt(b.dataset.year || data.marks.find((m) => m.id === b.dataset.id).year, 10) - data.yearsFrom + 0.5) / n);
      const x = Math.min(Math.max(pct * w, 12), w - 12);
      let r = 0;
      while (lastX[r] != null && x - lastX[r] < MIN) r++;
      lastX[r] = x;
      b.style.setProperty('--row', r);
      rows = Math.max(rows, r + 1);
    }
    marks.style.height = `${rows * MIN + 6}px`;
  };
  layout();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(layout).observe(ribbon);
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
      <span class="line">${py != null ? `<span class="lm-py lm-t-${pyTone(py)}">${py}</span><span>personal year ${py} — ${PY_GLOSS[py] || ''}</span>` : '<span class="dim">personal year needs a full birth date</span>'}<span class="mono dim">${yearLine}</span></span>
      ${spouse ? '<span class="k">the two</span><span class="line" id="lm-pair"></span>' : ''}
      ${m.event ? `<span class="k">judge</span><span class="line"><button type="button" class="lm-v lm-v-best lm-tag ${m.tagged === 'worked' ? 'on' : ''}" data-oc="worked">✓ worked</button><button type="button" class="lm-v lm-v-enemy lm-tag ${m.tagged === 'failed' ? 'on' : ''}" data-oc="failed">✕ failed</button>${m.inferred ? '<span class="dim">from the record — tap to overrule</span>' : m.tagged ? '<span class="dim">your call — tap again to clear</span>' : ''}</span>` : `<span class="k">judge</span><span class="line dim">${m.cluster ? 'judge each one from the year list' : 'from the relationship record'}</span>`}
    </div>`;
  if (spouse) el.querySelector('#lm-pair').append(...verdictChips(person, spouse));
  el.querySelectorAll('[data-oc]').forEach((b) => b.addEventListener('click', () => onOutcome(m, m.tagged === b.dataset.oc ? null : b.dataset.oc)));
}

/** The circle: spouse cards first (married → ended, both personal years), then family, each with the verdict chips. */
export async function renderCircle(el, { person, rels, people, data, onOpen, onAdd = null }) {
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
      line = `♥ ${sy || '—'}${ey ? ` · ✕ ${ey}` : ''}${pyS && pyS.ok ? ` · <span class="mono">PY ${pyS.value}${pyE && pyE.ok ? ` → ${pyE.value}` : ''}</span>` : ''}`;
    } else {
      const s = signFor(exactBirth(other));
      const lp = lifePath(exactBirth(other));
      line = `${rel}${s.ok && !s.boundary ? ` · ${s.element} ${animalLabel(s.animal)}` : ''}${lp.ok ? ` · LP ${lp.value}` : ''}`;
    }
    card.innerHTML = `<div class="lm-card-body"><div class="who">${esc(other.display_name)}</div><div class="rel">${line}</div><div class="lm-verdicts"></div></div>`;
    card.prepend(face);
    card.querySelector('.lm-verdicts').append(...verdictChips(person, other));
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
export function tokensHtml(person) {
  const b = exactBirth(person);
  const lp = lifePath(b);
  const ch = signFor(b);
  const su = sunSign(b);
  const lpHtml = lp.ok ? `<span class="tk"><span class="big">${lp.value}${lp.master ? '★' : ''}</span>life path</span>` : '<span class="tk dim"><span class="big dim">—</span>life path · needs a full birth date</span>';
  const anHtml = ch.ok && !ch.boundary ? `<span class="tk">${animalChipHtml(ch.animal)}<span class="dim">${ch.element}</span></span>` : `<span class="tk dim">${ch.ok && ch.boundary ? 'animal · near lunar new year' : ''}</span>`;
  const suHtml = su.ok ? `<span class="tk">${signChipHtml(su.sign)}${su.cusp ? '<span class="dim">cusp</span>' : ''}</span>` : '';
  return `${lpHtml}${anHtml}${suHtml}`;
}
