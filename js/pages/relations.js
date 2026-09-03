import { lifePath } from '../numerology.js';
import { signFor, ANIMALS } from '../chinese.js';
import { sunSign } from '../western.js';
import { expectedDigitCount } from '../stats.js';
import { numberIcons, relationGlyph, barRow, emptyState, animalChipHtml, signChipHtml, animalPicHtml, animalLabel, zodiacGroup, signElement, signGlyph } from '../indicators.js';
import { inlineNote, clearInlineNote } from '../ui.js';
import { searchPeople, addPeopleFromWikidata } from '../lookup.js';
import { resolveAssetUrl } from '../assets.js';
import { layoutTree, yearsText, FAMILY_KINDS, assignGenerations } from '../tree.js';
import { exactBirth } from '../person-dates.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

const VIEW_KEY = 'c7-rel-view';       // 'tree' (default) | 'map'
const NUMBERS_KEY = 'c7-tree-numbers'; // '1' shows number · animal · sign under each face
const FIT_KEY = 'c7-tree-fit';         // '0' turns "Fit" off (on by default: she wants the whole tree)
const GRID_SORT_KEY = 'c7-grid-sort';  // 'name' (default) | 'animal' | 'trine' | 'sun' | 'element'
const GOD_KEY = 'c7-tree-god';         // '1' draws the godparent curves and tags (off by default — her call, 2026-09-03: they were most of the clutter)

// presentation order for the grid's groups: the zodiac cycle, the wheel, and her colour code
const SIGN_ORDER = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const TRINES = [
  { key: 'blue', name: 'Blue', members: 'Snake · Ox · Rooster' },
  { key: 'green', name: 'Green', members: 'Dog · Tiger · Horse' },
  { key: 'pink', name: 'Pink', members: 'Pig · Goat · Rabbit (Cat)' },
  { key: 'yellow', name: 'Yellow', members: 'Rat · Dragon · Monkey' },
];
const WESTERN_ELEMENTS = [
  { key: 'air', name: 'Air', members: 'Gemini · Libra · Aquarius' },
  { key: 'fire', name: 'Fire', members: 'Aries · Leo · Sagittarius' },
  { key: 'earth', name: 'Earth', members: 'Taurus · Virgo · Capricorn' },
  { key: 'water', name: 'Water', members: 'Cancer · Scorpio · Pisces' },
];

// per render: how far the tree is opened either side of the focus person, and the zoom
const treeState = { up: 1, down: 1, scale: 1 };
// Fit never shrinks below four-fifths — names stay readable on the phone;
// a wider tree scrolls sideways instead (her pick, 2026-09-03: "stop
// shrinking at a readable size")
const MIN_FIT = 0.8;
const ZOOM_MIN = 0.4, ZOOM_MAX = 1.6, ZOOM_STEP = 0.15;

/**
 * render(root, ctx, focusId?) — on a profile's Relations tab the person is
 * the focus (their row ± 1 generation to start); on the family overview
 * there is no focus and the whole tree shows, oldest generation on top.
 */
export async function render(root, ctx, focusId = null) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  const focus = focusId && typeof focusId === 'string' ? focusId : null;
  const [allPeople, allRels] = await Promise.all([store.listPeople(ctx.caseId), store.listRelationships(ctx.caseId)]);
  const view = localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'tree';

  // Generation filter (her ask, 2026-09-03: "let me filter through
  // generations"): a range, from row A to row B of the whole case, that the
  // tree, the map, the other-connections list and the number panels all
  // obey. Remembered per case. Row numbers are the tree's own (oldest = 1).
  const gens = assignGenerations(allPeople, allRels);
  const genCount = allPeople.length ? Math.max(...gens.values()) + 1 : 0;
  const genKey = `c7-gen-range:${ctx.caseId}`;
  let [genFrom, genTo] = (localStorage.getItem(genKey) || '').split(',').map(Number);
  if (!(genFrom >= 1 && genTo >= genFrom && genTo <= genCount)) { genFrom = 1; genTo = genCount; }
  const genNarrowed = genCount > 1 && (genFrom > 1 || genTo < genCount);

  // Family filter (her pick, 2026-09-03, "A · a person's line"): a root,
  // their spouses, their descendants and the descendants' spouses. The
  // picker lists everyone who has a child in the case. Remembered per case,
  // and it combines with the generation range.
  const famKey = `c7-fam-root:${ctx.caseId}`;
  const byId = new Map(allPeople.map((p) => [p.id, p]));
  const hasChild = new Set(allRels.filter((r) => r.kind === 'parent').map((r) => r.a_id));
  const roots = allPeople.filter((p) => hasChild.has(p.id)).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const famRoot = byId.has(localStorage.getItem(famKey)) && hasChild.has(localStorage.getItem(famKey)) ? localStorage.getItem(famKey) : null;
  const lineOf = (rootId) => {
    const line = new Set([rootId]);
    const queue = [rootId];
    while (queue.length) {
      const id = queue.shift();
      for (const r of allRels) {
        if (r.kind === 'spouse' && (r.a_id === id || r.b_id === id)) line.add(r.a_id === id ? r.b_id : r.a_id);
        if (r.kind === 'parent' && r.a_id === id && !line.has(r.b_id)) { line.add(r.b_id); queue.push(r.b_id); }
      }
    }
    return line;
  };
  const line = famRoot ? lineOf(famRoot) : null;
  const narrowed = genNarrowed || !!famRoot;
  const people = allPeople.filter((p) => (!line || line.has(p.id)) && (!genNarrowed || (gens.get(p.id) + 1 >= genFrom && gens.get(p.id) + 1 <= genTo)));
  const keep = new Set(people.map((p) => p.id));
  const rels = narrowed ? allRels.filter((r) => keep.has(r.a_id) && keep.has(r.b_id)) : allRels;
  const genOptions = (sel) => Array.from({ length: genCount }, (_, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${i + 1}</option>`).join('');

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:8px">
        <div class="row wrap" style="gap:8px;align-items:center">
          <span class="section-label">${narrowed ? `${people.length} of ${allPeople.length}` : allPeople.length} people · ${rels.length} relationships</span>
          <div class="seg" id="rel-view">
            <button class="${view === 'tree' ? 'active' : ''}" data-view="tree">Tree</button>
            <button class="${view === 'map' ? 'active' : ''}" data-view="map">Zodiac map</button>
          </div>
          ${roots.length ? `<span class="row" style="gap:6px;align-items:center" id="fam-filter" title="One person's line: them, their spouses, their descendants and the descendants' spouses">
            <span class="section-label">Family</span>
            <select id="fam-root" class="sel-sm"><option value="">Everyone</option>${roots.map((p) => `<option value="${p.id}" ${p.id === famRoot ? 'selected' : ''}>${p.display_name}’s line</option>`).join('')}</select>
          </span>` : ''}
          ${genCount > 1 ? `<span class="row" style="gap:6px;align-items:center" id="gen-filter" title="Show only these generations (1 = oldest)">
            <span class="section-label">Generations</span>
            <select id="gen-from" class="sel-sm">${genOptions(genFrom)}</select>
            <span style="color:var(--text-3)">–</span>
            <select id="gen-to" class="sel-sm">${genOptions(genTo)}</select>
            ${genNarrowed ? '<button class="btn btn-ghost btn-sm" id="gen-all">All</button>' : ''}
          </span>` : ''}
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" id="add-person-btn">+ Person</button>
          <button class="btn btn-ghost btn-sm" id="add-wiki-btn" title="Look up one or many people on Wikipedia and add them">+ From Wikipedia</button>
          <button class="btn btn-ghost btn-sm" id="add-rel-btn">+ Relationship</button>
          <button class="btn btn-ghost btn-sm" id="questions-btn" title="The case's questions and the theories answering them">Questions</button>
        </div>
      </div>
      <div id="map-slot"></div>
      <div id="others-slot"></div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Repeating numbers — life path across this case</div>
          <div id="repeat-slot"></div>
        </div>
        <div class="panel">
          <div class="row between wrap" style="gap:8px;align-items:flex-start;margin-bottom:var(--sp-3)">
            <div class="panel-title" style="margin:0">Life path grid</div>
            <div id="grid-ctl"></div>
          </div>
          <div id="grid-slot"></div>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#add-person-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddPerson(body, ctx)));
  root.querySelector('#add-wiki-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddPerson(body, ctx, 'lookup')));
  root.querySelector('#add-rel-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddRel(body, ctx, allPeople)));
  root.querySelector('#questions-btn').addEventListener('click', () => ctx.navigate('#/questions'));
  root.querySelectorAll('#rel-view button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem(VIEW_KEY, b.dataset.view); render(root, ctx, focus); }));
  const setGen = (a, b) => { localStorage.setItem(genKey, `${Math.min(a, b)},${Math.max(a, b)}`); render(root, ctx, focus); };
  root.querySelector('#gen-from')?.addEventListener('change', (e) => setGen(Number(e.target.value), genTo));
  root.querySelector('#gen-to')?.addEventListener('change', (e) => setGen(genFrom, Number(e.target.value)));
  root.querySelector('#gen-all')?.addEventListener('click', () => { localStorage.removeItem(genKey); render(root, ctx, focus); });
  root.querySelector('#fam-root')?.addEventListener('change', (e) => { if (e.target.value) localStorage.setItem(famKey, e.target.value); else localStorage.removeItem(famKey); render(root, ctx, focus); });

  const mapSlot = root.querySelector('#map-slot');
  if (!people.length) {
    mapSlot.appendChild(emptyState({ missing: 'No people in this case yet.', why: 'Add the first person to start the tree.', action: '+ Person', onAction: () => ctx.openDrawer((body) => renderAddPerson(body, ctx)) }));
  } else if (view === 'map') {
    await renderZodiacMap(mapSlot, ctx, people, rels);
  } else {
    await renderTree(mapSlot, ctx, people, rels, focus, () => render(root, ctx, focus));
    renderOthers(root.querySelector('#others-slot'), ctx, people, rels, focus);
  }

  renderNumberPanels(root, people);
}

// ------------------------------------------------------------------ tree --

function numbersFor(p) {
  // exactBirth, never p.birth_date — a month-precision date carries a
  // placeholder day the file does not hold (see js/person-dates.js)
  const d = exactBirth(p);
  return { lifePath: lifePath(d), chinese: signFor(d), sun: sunSign(d) };
}

/**
 * The tree itself. opts.full = drawn inside the full-screen overlay (✕ to
 * close instead of Expand). Fit shrinks the tree to the box (never below
 * four-fifths); − / + zoom by hand; dragging pans.
 */
async function renderTree(slot, ctx, people, rels, focus, rerender, opts = {}) {
  const { full = false } = opts;
  const numbers = localStorage.getItem(NUMBERS_KEY) === '1';
  const godparents = localStorage.getItem(GOD_KEY) === '1';
  const fit = localStorage.getItem(FIT_KEY) !== '0';
  const up = focus ? treeState.up : Infinity;
  const down = focus ? treeState.down : Infinity;
  const L = layoutTree(people, rels, { focusId: focus, up, down, nodeH: numbers ? 142 : 112 });
  const shownGens = new Set(L.nodes.map((n) => n.gen)).size;
  // a sibling block is one node but many people — the count must say people
  const shownCount = L.nodes.reduce((n, x) => n + (x.group ? x.items.length : 1), 0);

  const wrap = document.createElement('div');
  wrap.className = 'tree-wrap';
  wrap.innerHTML = `
    <div class="row between wrap" style="gap:8px;margin-bottom:8px">
      <span class="mono" style="font-size:11px;color:var(--text-3)">${shownCount} of ${people.length} shown · ${shownGens} generation${shownGens === 1 ? '' : 's'}</span>
      <div class="row wrap" style="gap:6px">
        ${focus ? `<button class="btn btn-ghost btn-sm" id="tree-up" ${L.hiddenAbove ? '' : 'disabled'}>Up 1</button>
        <button class="btn btn-ghost btn-sm" id="tree-down" ${L.hiddenBelow ? '' : 'disabled'}>Down 1</button>
        <button class="btn btn-ghost btn-sm" id="tree-all" ${L.hiddenAbove || L.hiddenBelow ? '' : 'disabled'}>Expand all</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="tree-numbers">${numbers ? 'Numbers on' : 'Numbers off'}</button>
        <button class="btn btn-ghost btn-sm" id="tree-god" title="Godparent links — the dotted curves and the godchild/godparent tags">${godparents ? 'Godparents on' : 'Godparents off'}</button>
        <span class="seg">
          <button id="tree-fit" class="${fit ? 'active' : ''}" title="Shrink the tree to fit this box">Fit</button>
          <button id="tree-zoom-out" title="Zoom out">−</button>
          <button id="tree-zoom-in" title="Zoom in">+</button>
        </span>
        ${full
          ? '<button class="btn btn-ghost btn-sm" id="tree-close">✕ Close</button>'
          : '<button class="btn btn-ghost btn-sm" id="tree-expand" title="The tree on the whole screen">Expand</button>'}
      </div>
    </div>
    ${L.hiddenAbove ? `<button class="tree-more" id="tree-more-up">+ ${L.hiddenAbove} above</button>` : ''}
    <div class="tree-scroll"><div class="tree-scale"><div class="tree" style="width:${L.width}px;height:${L.height}px"></div></div></div>
    ${L.hiddenBelow ? `<button class="tree-more" id="tree-more-down">+ ${L.hiddenBelow} below</button>` : ''}
  `;
  slot.appendChild(wrap);
  // declared before any face is on screen: the photo loop below awaits, and
  // a tap that landed in that window found scrollBox not yet declared
  const scrollBox = wrap.querySelector('.tree-scroll');
  const scaleBox = wrap.querySelector('.tree-scale');

  // one door out of the tree: never open a profile at the end of a pan, and
  // when the tree is full-screen, leave the overlay on the way out
  const openProfile = (id) => {
    if (scrollBox.dataset.dragged) return;
    if (full && opts.onClose) opts.onClose({ skipRerender: true });
    ctx.navigate(`#/subject/${id}`);
  };

  const tree = wrap.querySelector('.tree');
  const svg = svgEl('svg', { class: 'tree-lines', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}` });
  svg.style.pointerEvents = 'none'; // lines never block taps on faces; the confirm dots opt back in
  tree.appendChild(svg);
  const stroke = (confirmed) => (confirmed ? 'var(--text-3)' : 'var(--ink-3)');
  for (const e of L.edges) {
    let el = null;
    if (e.kind === 'couple' && e.arc) el = svgEl('path', { d: `M${e.x1},${e.top} C${e.x1},${e.top - e.rise} ${e.x2},${e.top - e.rise} ${e.x2},${e.top}`, fill: 'none', stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'couple') el = svgEl('line', { x1: e.x1, y1: e.y, x2: e.x2, y2: e.y, stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'trunk') el = svgEl('line', { x1: e.x, y1: e.y1, x2: e.x, y2: e.y2, stroke: 'var(--text-3)', 'stroke-width': 1.5 });
    else if (e.kind === 'bus') el = svgEl('line', { x1: e.x1, y1: e.y, x2: e.x2, y2: e.y, stroke: 'var(--text-3)', 'stroke-width': 1.5 });
    else if (e.kind === 'drop') el = svgEl('line', { x1: e.x, y1: e.y1, x2: e.x, y2: e.y2, stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'far') el = svgEl('path', { d: `M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`, fill: 'none', stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'god' && godparents) el = svgEl('path', { d: `M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`, fill: 'none', stroke: 'var(--brass)', 'stroke-width': 1, opacity: 0.6 });
    if (!el) continue;
    if ((e.kind === 'couple' || e.kind === 'drop') && !e.confirmed) el.setAttribute('stroke-dasharray', '4,4');
    if (e.kind === 'far') el.setAttribute('stroke-dasharray', e.confirmed ? '6,3' : '3,4'); // always broken: it reaches across the tree
    if (e.kind === 'god') el.setAttribute('stroke-dasharray', '2,4');
    svg.appendChild(el);
    // a recorded-but-unconfirmed link gets a small brass dot at its midpoint: one tap confirms it
    const ids = e.relIds || (e.relId ? [e.relId] : []);
    if (!e.confirmed && !e.implied && ids.length) {
      const mx = e.kind === 'couple' || e.kind === 'bus' ? (e.x1 + e.x2) / 2 : (e.kind === 'drop' || e.kind === 'trunk' ? e.x : (e.x1 + e.x2) / 2);
      const my = e.kind === 'couple' ? (e.arc ? e.top - e.rise * 0.75 : e.y) : (e.y1 + e.y2) / 2;
      const dot = svgEl('circle', { cx: mx, cy: my, r: 5, class: 'tree-confirm' });
      const t = svgEl('title'); t.textContent = `Confirm — ${e.label || 'this link'}`; dot.appendChild(t);
      dot.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        if (scrollBox.dataset.dragged) return; // a pan that happened to end here must not confirm
        for (const id of ids) await ctx.store.upsertRelationship({ id, confirmed: 1 });
        rerender();
      });
      svg.appendChild(dot);
    }
  }

  // godparent tags per person — every link, not just the last one written
  const godLinks = new Map();
  for (const r of rels) {
    if (r.kind !== 'godparent') continue;
    const a = people.find((p) => p.id === r.a_id), b = people.find((p) => p.id === r.b_id);
    if (!a || !b) continue;
    if (!godLinks.has(r.b_id)) godLinks.set(r.b_id, { of: [], to: [] });
    if (!godLinks.has(r.a_id)) godLinks.set(r.a_id, { of: [], to: [] });
    godLinks.get(r.b_id).of.push(a.display_name.split(' ')[0]);
    godLinks.get(r.a_id).to.push(b.display_name.split(' ')[0]);
  }
  const godTag = new Map();
  for (const [id, g] of godLinks) {
    const parts = [];
    if (g.of.length) parts.push(`godchild of ${g.of.join(', ')}`);
    if (g.to.length) parts.push(`godparent of ${g.to.join(', ')}`);
    godTag.set(id, parts.join(' · '));
  }

  for (const n of L.nodes) {
    if (n.group) {
      // the sibling block: small faces in rows of four, one tap each opens the profile
      const g = document.createElement('div');
      g.className = 'tree-group';
      g.style.left = `${n.x}px`; g.style.top = `${n.y}px`; g.style.width = `${n.w}px`; g.style.height = `${n.h}px`;
      g.innerHTML = `<div class="glabel">${n.items.length} siblings</div>`;
      for (const it of n.items) {
        const p = it.person;
        const m = document.createElement('div');
        m.className = 'mini';
        m.style.left = `${it.x}px`; m.style.top = `${it.y}px`;
        const years = yearsText(p);
        // the number is never omitted for a missing date — hollow dash, always (STYLE §5)
        const lp = numbers ? lifePath(exactBirth(p)) : null;
        m.innerHTML = `<div class="face" style="width:${L.mini.face}px;height:${L.mini.face}px"><span class="initials">${initials(p.display_name)}</span></div>
          <div class="name">${p.display_name.split(' ')[0]}${lp ? ` <span class="lp${lp.ok ? '' : ' unknown'}" title="${lp.ok ? 'Life path ' + lp.value : 'Life path — needs a full birth date'}">${lp.ok ? lp.value + (lp.master ? '★' : '') : '—'}</span>` : ''}</div>
          ${years ? `<div class="years">${years.slice(0, 4)}</div>` : ''}`;
        m.title = `${p.display_name}${years ? ' · ' + years : ''} — open profile`;
        m.addEventListener('click', () => openProfile(p.id));
        g.appendChild(m);
        const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
        if (src) {
          const img = document.createElement('img');
          img.alt = ''; img.src = src;
          img.addEventListener('load', () => m.querySelector('.initials')?.remove());
          img.addEventListener('error', () => img.remove());
          m.querySelector('.face').appendChild(img);
        }
      }
      tree.appendChild(g);
      continue;
    }
    const p = n.person;
    const el = document.createElement('div');
    el.className = `tree-node${n.id === focus ? ' focus' : ''}`;
    el.style.left = `${n.x}px`;
    el.style.top = `${n.y}px`;
    el.style.width = `${L.nodeW}px`;
    const years = yearsText(p);
    el.innerHTML = `
      <div class="face" style="width:${L.faceH}px;height:${L.faceH}px"><span class="initials">${initials(p.display_name)}</span></div>
      <div class="name">${p.display_name}</div>
      ${years ? `<div class="years">${years}</div>` : ''}
      ${godparents && godTag.has(p.id) ? `<div class="tag">${godTag.get(p.id)}</div>` : ''}
    `;
    if (numbers) {
      const icons = numberIcons(numbersFor(p));
      icons.style.justifyContent = 'center';
      icons.style.marginTop = '4px';
      el.appendChild(icons);
    }
    el.title = `${p.display_name} — open profile`;
    el.addEventListener('click', () => openProfile(p.id));
    tree.appendChild(el);
    const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
    if (src) {
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      img.addEventListener('load', () => el.querySelector('.initials')?.remove());
      img.addEventListener('error', () => img.remove());
      el.querySelector('.face').appendChild(img);
    }
  }

  // ---- scale: Fit, or the hand-set zoom ----
  const applyScale = () => {
    const boxW = scrollBox.clientWidth || L.width;
    const s = fit ? Math.max(MIN_FIT, Math.min(1, boxW / (L.width || 1))) : treeState.scale;
    tree.style.transform = `scale(${s})`;
    scaleBox.style.width = `${Math.round(L.width * s)}px`;
    scaleBox.style.height = `${Math.round(L.height * s)}px`;
    scaleBox.style.margin = L.width * s < boxW ? '0 auto' : '0';
    wrap.dataset.scale = s.toFixed(2);
    return s;
  };
  const s0 = applyScale();
  if (fit && typeof ResizeObserver !== 'undefined') {
    // re-fit only when the box's width really changed (window resized, rail
    // collapsed) — never on its own content changes, which would loop
    let lastW = scrollBox.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!document.contains(scrollBox)) { ro.disconnect(); return; }
      const w = scrollBox.clientWidth;
      if (Math.abs(w - lastW) > 1) { lastW = w; applyScale(); }
    });
    ro.observe(wrap);
  }
  // keep the focus in view when the tree is wider than the box
  const fn = L.nodes.find((n) => n.id === focus);
  if (fn) requestAnimationFrame(() => { scrollBox.scrollLeft = Math.max(0, fn.x * s0 - scrollBox.clientWidth / 2 + (L.nodeW * s0) / 2); });

  // ---- drag to pan (mouse or touch); a real drag never opens a profile ----
  let drag = null;
  scrollBox.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, left: scrollBox.scrollLeft, top: scrollBox.scrollTop, moved: false };
    delete scrollBox.dataset.dragged;
  });
  scrollBox.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    scrollBox.classList.add('dragging');
    scrollBox.dataset.dragged = '1';
    scrollBox.scrollLeft = drag.left - dx;
    scrollBox.scrollTop = drag.top - dy;
  });
  const endDrag = () => { drag = null; scrollBox.classList.remove('dragging'); setTimeout(() => delete scrollBox.dataset.dragged, 50); };
  scrollBox.addEventListener('pointerup', endDrag);
  scrollBox.addEventListener('pointercancel', endDrag);
  scrollBox.addEventListener('pointerleave', endDrag);

  // ---- controls ----
  wrap.querySelector('#tree-up')?.addEventListener('click', () => { treeState.up += 1; rerender(); });
  wrap.querySelector('#tree-down')?.addEventListener('click', () => { treeState.down += 1; rerender(); });
  wrap.querySelector('#tree-all')?.addEventListener('click', () => { treeState.up = 99; treeState.down = 99; rerender(); });
  wrap.querySelector('#tree-more-up')?.addEventListener('click', () => { treeState.up += 1; rerender(); });
  wrap.querySelector('#tree-more-down')?.addEventListener('click', () => { treeState.down += 1; rerender(); });
  wrap.querySelector('#tree-numbers').addEventListener('click', () => { localStorage.setItem(NUMBERS_KEY, numbers ? '0' : '1'); rerender(); });
  wrap.querySelector('#tree-god').addEventListener('click', () => { localStorage.setItem(GOD_KEY, godparents ? '0' : '1'); rerender(); });
  wrap.querySelector('#tree-fit').addEventListener('click', () => { localStorage.setItem(FIT_KEY, fit ? '0' : '1'); if (fit) treeState.scale = parseFloat(wrap.dataset.scale) || 1; rerender(); });
  const zoom = (dir) => {
    const current = parseFloat(wrap.dataset.scale) || 1;
    treeState.scale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((current + dir * ZOOM_STEP) * 100) / 100));
    localStorage.setItem(FIT_KEY, '0');
    rerender();
  };
  wrap.querySelector('#tree-zoom-out').addEventListener('click', () => zoom(-1));
  wrap.querySelector('#tree-zoom-in').addEventListener('click', () => zoom(1));
  wrap.querySelector('#tree-expand')?.addEventListener('click', () => openFullTree(ctx, people, rels, focus, rerender));
  wrap.querySelector('#tree-close')?.addEventListener('click', () => opts.onClose && opts.onClose({}));
}

// the tree on the whole screen: its own overlay, same controls, ✕ or Escape to leave
function openFullTree(ctx, people, rels, focus, rerenderPage) {
  // one overlay at a time: the Expand button keeps keyboard focus under the
  // overlay, and a second copy opened with Enter left the page unscrollable
  if (document.querySelector('.tree-full')) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const overlay = document.createElement('div');
  overlay.className = 'tree-full';
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const close = (o = {}) => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    if (!o.skipRerender) rerenderPage(); // skipped when we are leaving for a profile
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const draw = async () => {
    overlay.innerHTML = '';
    const [freshPeople, freshRels] = await Promise.all([ctx.store.listPeople(ctx.caseId), ctx.store.listRelationships(ctx.caseId)]);
    await renderTree(overlay, ctx, freshPeople, freshRels, focus, draw, { full: true, onClose: close });
  };
  draw();
}

// everything that isn't family: business, associate, household — listed, not drawn
function renderOthers(slot, ctx, people, rels, focus) {
  const others = rels.filter((r) => !FAMILY_KINDS.has(r.kind) && (!focus || r.a_id === focus || r.b_id === focus));
  if (!others.length) return;
  const byId = new Map(people.map((p) => [p.id, p]));
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `<div class="panel-title">Other connections</div><div class="stack" style="gap:2px" id="others-list"></div>`;
  const list = panel.querySelector('#others-list');
  for (const r of others) {
    const a = byId.get(r.a_id), b = byId.get(r.b_id);
    if (!a || !b) continue;
    const other = focus ? (a.id === focus ? b : a) : null;
    const row = document.createElement('div');
    row.className = 'list-row';
    row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${other ? other.display_name : `${a.display_name} · ${b.display_name}`}</div><div class="sub">${r.kind}${r.confirmed ? '' : ' · unconfirmed'}${r.notes ? ' · ' + r.notes : ''}</div></div>`;
    row.addEventListener('click', () => ctx.navigate(`#/subject/${(other || a).id}`));
    list.appendChild(row);
  }
  slot.appendChild(panel);
}

// ------------------------------------------------------------ zodiac map --

// Her redesign (2026-09-03, eight popup answers): four trine zones, each
// grouped by exact animal with counts, no connection lines — the picture
// is simply who shares a trine. Inside a zone everyone is in harmony by
// definition; the zones sit so the clashing trines are diagonal (Blue ↔
// Pink, Yellow ↔ Green). A face (photo, initials fallback) and a short
// name per person; tap opens the profile. People without a settled birth
// year sit in a tray below, never placed by guesswork. Plain HTML, so on
// the phone the four zones simply stack as bands.
const MAP_ZONES = ['blue', 'yellow', 'green', 'pink'];

// "Catherine of Aragon" → "Catherine A." · "Henry VIII" → "Henry VIII" · "Dolly" → "Dolly"
function shortName(name) {
  const words = String(name || '').replace(/[(),]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] || '';
  const last = words[words.length - 1];
  return /^[IVXLC]+$/.test(last) || /^\d/.test(last) ? `${words[0]} ${last}` : `${words[0]} ${last[0]}.`;
}

function mapPersonNode(p, ctx) {
  const node = document.createElement('div');
  node.className = 'zmap-person';
  node.dataset.id = p.id;
  node.title = p.display_name;
  node.innerHTML = `<div class="zmap-face">${initials(p.display_name)}</div><div class="nm">${shortName(p.display_name)}</div>`;
  const face = node.querySelector('.zmap-face');
  if (p.photo_path || p.photo_url) {
    (p.photo_path ? resolveAssetUrl(p.photo_path, 'image/jpeg') : Promise.resolve(null)).then((u) => {
      const src = u || p.photo_url;
      if (!src) return;
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      img.addEventListener('load', () => { face.textContent = ''; face.appendChild(img); });
    });
  }
  node.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
  return node;
}

async function renderZodiacMap(mapSlot, ctx, people, rels) {
  const facts = people.map((p) => { const ch = signFor(exactBirth(p)); return { p, animal: ch.ok && !ch.boundary ? ch.animal : null }; });
  const byName = (a, b) => a.p.display_name.localeCompare(b.p.display_name);
  const wrap = document.createElement('div');
  wrap.className = 'zmap';
  for (const z of MAP_ZONES) {
    const t = TRINES.find((x) => x.key === z);
    const members = facts.filter((f) => f.animal && zodiacGroup(f.animal) === z);
    const zone = document.createElement('div');
    zone.className = 'zmap-zone';
    zone.dataset.zone = z;
    zone.innerHTML = `<div class="zmap-zone-title">${t.name} · ${t.members} <span class="n">· ${members.length}</span></div><div class="zmap-animals"></div>`;
    const cols = zone.querySelector('.zmap-animals');
    for (const a of ANIMALS.filter((x) => zodiacGroup(x) === z)) {
      const mem = members.filter((f) => f.animal === a).sort(byName);
      const col = document.createElement('div');
      col.innerHTML = `<div class="zmap-animal-head ${mem.length ? '' : 'empty'}" data-animal="${a}">${animalPicHtml(a)}${animalLabel(a)}${mem.length ? `<span class="n">· ${mem.length}</span>` : ''}</div><div class="zmap-people"></div>`;
      const list = col.querySelector('.zmap-people');
      for (const f of mem) list.appendChild(mapPersonNode(f.p, ctx));
      cols.appendChild(col);
    }
    wrap.appendChild(zone);
  }
  const unsettled = facts.filter((f) => !f.animal).sort(byName);
  if (unsettled.length) {
    const tray = document.createElement('div');
    tray.className = 'zmap-tray';
    tray.innerHTML = `<div class="zmap-zone-title">Birth year unsettled — no animal yet <span class="n">· ${unsettled.length}</span></div><div class="zmap-people"></div>`;
    const list = tray.querySelector('.zmap-people');
    for (const f of unsettled) list.appendChild(mapPersonNode(f.p, ctx));
    wrap.appendChild(tray);
  }
  mapSlot.appendChild(wrap);
  // the clash lines follow the layout (2×2 on the desktop, bands on the phone)
  new ResizeObserver(() => drawClashLines(wrap, facts, rels)).observe(wrap);
  const key = document.createElement('div');
  key.className = 'zmap-key';
  key.textContent = 'Inside a zone everyone is in harmony with each other · a red ✕ line joins two people in a direct family relationship whose animals clash — a Pig married to a Snake, a Rat with a Horse child · tap a face to open the profile';
  mapSlot.appendChild(key);
}

/**
 * Her call (2026-09-03, "show opposites in direct relationships e.g. Henry
 * pig married Catherine snake"): a red line between two PEOPLE who are in a
 * direct family relationship (parent, spouse, sibling) and whose animals
 * clash — the six opposite pairs — with the clash glyph at its midpoint.
 * Only related pairs, so the lines stay few and each one means something.
 */
function drawClashLines(wrap, facts, rels) {
  wrap.querySelectorAll('.zmap-clash').forEach((e) => e.remove());
  let svg = wrap.querySelector('.zmap-lines');
  if (!svg) { svg = svgEl('svg', { class: 'zmap-lines' }); wrap.appendChild(svg); }
  svg.innerHTML = '';
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const r0 = wrap.getBoundingClientRect();
  const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left - r0.left + r.width / 2, r.top - r0.top + r.height / 2]; };
  const animalOf = new Map(facts.map((f) => [f.p.id, f.animal]));
  const nameOf = new Map(facts.map((f) => [f.p.id, f.p.display_name]));
  const seen = new Set();
  for (const r of rels || []) {
    if (!['parent', 'spouse', 'sibling'].includes(r.kind)) continue;
    const a = animalOf.get(r.a_id), b = animalOf.get(r.b_id);
    if (!a || !b || Math.abs(ANIMALS.indexOf(a) - ANIMALS.indexOf(b)) !== 6) continue;
    const key = [r.a_id, r.b_id].sort().join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    const fa = wrap.querySelector(`.zmap-person[data-id="${r.a_id}"] .zmap-face`);
    const fb = wrap.querySelector(`.zmap-person[data-id="${r.b_id}"] .zmap-face`);
    if (!fa || !fb) continue;
    const [x1, y1] = centre(fa), [x2, y2] = centre(fb);
    svg.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: 'var(--red)', 'stroke-width': 1.5, opacity: 0.7 }));
    const g = document.createElement('div');
    g.className = 'zmap-clash';
    g.style.left = `${(x1 + x2) / 2}px`;
    g.style.top = `${(y1 + y2) / 2}px`;
    g.title = `${nameOf.get(r.a_id)} (${animalLabel(a)}) × ${nameOf.get(r.b_id)} (${animalLabel(b)}) — ${r.kind}, clash`;
    g.appendChild(relationGlyph('clash'));
    wrap.appendChild(g);
  }
}

// --------------------------------------------------------- number panels --

function renderNumberPanels(root, people) {
  const repeatSlot = root.querySelector('#repeat-slot');
  const withLifePath = people.map((p) => lifePath(exactBirth(p))).filter((r) => r.ok);
  if (!withLifePath.length) {
    repeatSlot.appendChild(emptyState({ missing: 'No life paths to compare yet.', why: 'Nobody in this case has a full birth date on file.' }));
  } else {
    const counts = {};
    for (const r of withLifePath) counts[r.value] = (counts[r.value] || 0) + 1;
    const values = Object.keys(counts).map(Number).sort((a, b) => b - a);
    const n = withLifePath.length;
    for (const v of values) {
      const expected = expectedDigitCount(n, 9);
      // "chance would give" = people with a full birth date ÷ 9 possible numbers
      repeatSlot.appendChild(barRow({ label: `Life path ${v}`, value: counts[v], max: Math.max(counts[v], expected, 1), display: `${counts[v]} · chance would give ${expected.toFixed(1)}` }));
    }
  }

  renderGrid(root.querySelector('#grid-slot'), root.querySelector('#grid-ctl'), people);
}

/**
 * The life-path grid. Sorted by name by default; the control above it can
 * group the rows by animal or sun sign — exact (colour by colour in the
 * key's order: a header per animal/sign that repeats, bigger first, then
 * that colour's one-offs right after it under a quiet "No repeats") or by
 * the colour group (trine /
 * element, in the key's order; inside each colour the repeats run first,
 * bigger run first, then the one-offs together after them). The choice
 * sticks, like the tree's own toggles. Her ask, 2026-09-03.
 */
function renderGrid(gridSlot, ctlSlot, people) {
  gridSlot.innerHTML = '';
  ctlSlot.innerHTML = '';
  if (!people.length) {
    gridSlot.appendChild(emptyState({ missing: 'No people yet.', why: 'Add people to populate this grid.' }));
    return;
  }
  const saved = localStorage.getItem(GRID_SORT_KEY);
  const mode = ['animal', 'trine', 'sun', 'element'].includes(saved) ? saved : 'name';
  const primary = mode === 'name' ? 'name' : (mode === 'animal' || mode === 'trine') ? 'animal' : 'sun';
  const grouped = mode === 'trine' || mode === 'element';

  ctlSlot.innerHTML = `
    <div class="ctl-col">
      <span class="seg">
        <button data-p="name" class="${primary === 'name' ? 'active' : ''}">Name</button>
        <button data-p="animal" class="${primary === 'animal' ? 'active' : ''}">Animal</button>
        <button data-p="sun" class="${primary === 'sun' ? 'active' : ''}">Sun sign</button>
      </span>
      ${primary === 'name' ? '' : `<span class="ctl-sub"><button data-s="exact" class="${grouped ? '' : 'active'}">exact</button> · <button data-s="group" class="${grouped ? 'active' : ''}">${primary === 'animal' ? 'trine' : 'element'}</button></span>`}
    </div>`;
  const setMode = (m) => { localStorage.setItem(GRID_SORT_KEY, m); renderGrid(gridSlot, ctlSlot, people); };
  ctlSlot.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.p)));
  ctlSlot.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.s === 'exact' ? primary : (primary === 'animal' ? 'trine' : 'element'))));

  const facts = people.map((p) => {
    const d = exactBirth(p);
    const lp = lifePath(d), sun = sunSign(d), ch = signFor(d);
    return { p, lp, ch, animal: ch.ok && !ch.boundary ? ch.animal : null, sign: sun.ok ? sun.sign : null };
  });
  const byName = (a, b) => a.p.display_name.localeCompare(b.p.display_name);
  const row = (f) => `<tr><td>${f.p.display_name}</td><td class="num">${f.lp.ok ? f.lp.value + (f.lp.master ? '★' : '') : '—'}</td><td>${f.sign ? signChipHtml(f.sign) : '—'}</td><td>${f.animal ? animalChipHtml(f.animal) : f.ch.boundary ? 'boundary' : '—'}</td></tr>`;
  const head = (cls, pic, label, sub, n) => `<tr class="grp-head"><td colspan="4"><div class="grp-bar ${cls}">${pic}${label}${sub ? `<span class="grp-sub">${sub}</span>` : ''}<span class="grp-count">· ${n}</span></div></td></tr>`;
  const block = (rows) => `<tbody>${rows}</tbody>`;

  const isAnimal = primary === 'animal';
  const keyOf = isAnimal ? (f) => f.animal : (f) => f.sign;
  const order = isAnimal ? ANIMALS : SIGN_ORDER;
  let body = '';
  if (mode === 'name') {
    body = block(facts.slice().sort(byName).map(row).join(''));
  } else if (!grouped) {
    const groups = new Map();
    for (const f of facts) { const k = keyOf(f); if (k) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); } }
    // colour by colour, in the key's order (her call, 2026-09-03: "group the
    // fire signs one after another … leo shown near the aries and sag"):
    // each repeat under its own header, bigger first, then that colour's
    // one-offs right after it — never banished to a block at the bottom
    const buckets = isAnimal ? TRINES : WESTERN_ELEMENTS;
    const colourOf = isAnimal ? (k) => zodiacGroup(k) : (k) => signElement(k);
    for (const b of buckets) {
      const repeats = [...groups.keys()].filter((k) => colourOf(k) === b.key && groups.get(k).length > 1)
        .sort((a, c) => groups.get(c).length - groups.get(a).length || order.indexOf(a) - order.indexOf(c));
      for (const k of repeats) {
        const pic = isAnimal ? animalPicHtml(k, 'grp-pic') : `<span class="grp-pic">${signGlyph(k)}</span>`;
        body += block(head(`gb-${b.key}`, pic, isAnimal ? animalLabel(k) : k, null, groups.get(k).length) + groups.get(k).slice().sort(byName).map(row).join(''));
      }
      const singles = facts.filter((f) => keyOf(f) && colourOf(keyOf(f)) === b.key && groups.get(keyOf(f)).length === 1)
        .sort((x, y) => order.indexOf(keyOf(x)) - order.indexOf(keyOf(y)) || byName(x, y));
      if (singles.length) body += block(head(`gb-${b.key} soft`, '', 'No repeats', null, singles.length) + singles.map(row).join(''));
    }
    const unknown = facts.filter((f) => !keyOf(f)).sort(byName);
    if (unknown.length) body += block(head('gb-none', '', 'Unknown', null, unknown.length) + unknown.map(row).join(''));
  } else {
    const buckets = isAnimal ? TRINES : WESTERN_ELEMENTS;
    const bucketOf = isAnimal ? (f) => (f.animal ? zodiacGroup(f.animal) : null) : (f) => (f.sign ? signElement(f.sign) : null);
    for (const b of buckets) {
      const inBucket = facts.filter((f) => bucketOf(f) === b.key);
      // inside a colour: the repeats first (bigger run first, then the wheel),
      // then every one-off together after them (her call, 2026-09-03: "the
      // no repeats group in animal trine one after another")
      const count = new Map();
      for (const f of inBucket) count.set(keyOf(f), (count.get(keyOf(f)) || 0) + 1);
      const members = inBucket.sort((x, y) => {
        const cx = count.get(keyOf(x)), cy = count.get(keyOf(y));
        return ((cy > 1) - (cx > 1)) || (cx > 1 && cy > 1 ? cy - cx : 0) || order.indexOf(keyOf(x)) - order.indexOf(keyOf(y)) || byName(x, y);
      });
      if (members.length) body += block(head(`gb-${b.key}`, '', b.name, b.members, members.length) + members.map(row).join(''));
    }
    const unknown = facts.filter((f) => !bucketOf(f)).sort(byName);
    if (unknown.length) body += block(head('gb-none', '', 'Unknown', null, unknown.length) + unknown.map(row).join(''));
  }

  const table = document.createElement('table');
  table.className = 'dense';
  table.innerHTML = `<thead><tr><th>Person</th><th>Life path</th><th>Sun sign</th><th>Animal</th></tr></thead>${body}`;
  gridSlot.appendChild(table);
  const key = document.createElement('div');
  key.className = 'zc-key';
  key.innerHTML = `<span><span class="zc zc-blue">Snake · Ox · Rooster</span></span><span><span class="zc zc-green">Dog · Tiger · Horse</span></span><span><span class="zc zc-pink">Pig · Goat · Rabbit (Cat)</span></span><span><span class="zc zc-yellow">Rat · Dragon · Monkey</span></span>
    <span><span class="zc ws-air">air</span> · <span class="zc ws-fire">fire</span> · <span class="zc ws-earth">earth</span> · <span class="zc ws-water">water</span></span>`;
  gridSlot.appendChild(key);
}

// ----------------------------------------------------------------- forms --

/**
 * The "+ Person" drawer: two ways in (her ask, 2026-09-03 — "both"). Type
 * it in, as before; or look one or many names up on Wikipedia and add
 * them together. The + From Wikipedia button opens the same drawer already
 * in look-up mode.
 */
function renderAddPerson(body, ctx, mode = 'type') {
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:12px">Add people</h3>
    <span class="seg" style="margin-bottom:16px"><button data-m="type" class="${mode === 'type' ? 'active' : ''}">Type it in</button><button data-m="lookup" class="${mode === 'lookup' ? 'active' : ''}">Look up on Wikipedia</button></span>
    <div id="ap-body"></div>
  `;
  body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => renderAddPerson(body, ctx, b.dataset.m)));
  const slot = body.querySelector('#ap-body');
  if (mode === 'lookup') renderLookupBatch(slot, ctx);
  else renderTypeIn(slot, ctx);
}

function renderTypeIn(slot, ctx) {
  slot.innerHTML = `
    <div class="field"><label>Display name</label><input type="text" id="p-name"></div>
    <div class="field"><label>Kind</label><select id="p-kind"><option value="person">person</option><option value="household">household</option><option value="org">org</option></select></div>
    <div class="field"><label>Birth date (leave blank if unknown)</label><input type="date" id="p-bdate"></div>
    <button class="btn btn-primary" id="p-save">Add</button>
  `;
  slot.querySelector('#p-save').addEventListener('click', async () => {
    const nameInput = slot.querySelector('#p-name');
    const name = nameInput.value.trim();
    if (!name) { inlineNote(nameInput, 'A name is required.'); nameInput.focus(); return; }
    clearInlineNote(nameInput);
    const bdate = slot.querySelector('#p-bdate').value;
    await ctx.store.createPerson({
      case_id: ctx.caseId, display_name: name, kind: slot.querySelector('#p-kind').value,
      birth_date: bdate || null, birth_precision: bdate ? 'day' : 'unknown',
    });
    ctx.closeDrawer();
    ctx.rerender();
  });
  queueMicrotask(() => slot.querySelector('#p-name').focus());
}

/**
 * Look-up mode: many names at once (a line or a comma each). Each name gets
 * its best Wikidata match pre-picked with the description and item number
 * to check it by, "change" for the other candidates, and a "+ family" tick
 * that pulls their relatives too. A name with no record is reported and
 * not added (her call). Nothing is saved until "Add N people".
 */
function renderLookupBatch(slot, ctx) {
  slot.innerHTML = `
    <div class="field"><label>Names — one per line, or separated by commas</label><textarea id="wk-names" placeholder="Daniel Radcliffe, Emma Watson…"></textarea></div>
    <div class="row wrap" style="gap:12px"><button class="btn btn-primary" id="wk-search">Search Wikipedia</button><span style="font-size:11px;color:var(--text-3)">Nothing is saved yet — you check each match first.</span></div>
    <div id="wk-results" style="margin-top:16px"></div>
  `;
  const textarea = slot.querySelector('#wk-names');
  queueMicrotask(() => textarea.focus());
  const names = () => [...new Set(textarea.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
  slot.querySelector('#wk-search').addEventListener('click', async () => {
    const btn = slot.querySelector('#wk-search');
    const results = slot.querySelector('#wk-results');
    clearInlineNote(btn);
    results.innerHTML = '';
    const list = names();
    if (!list.length) { inlineNote(btn, 'Type at least one name.'); textarea.focus(); return; }
    btn.disabled = true;
    const rows = [];
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `Searching ${i + 1} of ${list.length}…`;
      let matches = [];
      try { matches = await searchPeople(list[i]); }
      catch (e) { btn.disabled = false; btn.textContent = 'Search Wikipedia'; inlineNote(btn, `Couldn't reach Wikidata — ${e.message}. Are you online?`); return; }
      rows.push({ name: list[i], matches, pick: matches[0] || null, family: false, include: !!matches[0], open: false });
    }
    btn.disabled = false; btn.textContent = 'Search Wikipedia';
    paintMatches(results, rows, ctx);
  });
}

function paintMatches(results, rows, ctx) {
  const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paint = () => {
    // the same item picked twice is one person — only the first row counts
    const seen = new Set();
    rows.forEach((r) => { r.dup = !!(r.pick && seen.has(r.pick.id)); if (r.pick) seen.add(r.pick.id); });
    const found = rows.filter((r) => r.pick).length, missing = rows.length - found;
    const chosen = rows.filter((r) => r.include && r.pick && !r.dup);
    results.innerHTML = `
      <div class="field"><label>${rows.length} name${rows.length === 1 ? '' : 's'} · ${found} matched${missing ? ` · ${missing} not on Wikidata` : ''}</label></div>
      ${rows.map((r, i) => (r.pick ? `
        <div class="wk-match ${r.include && !r.dup ? '' : 'skip'}">
          <div class="wk-typed">${esc(r.name)}</div>
          <div class="list-row">
            <input type="checkbox" data-inc="${i}" ${r.include && !r.dup ? 'checked' : ''} ${r.dup ? 'disabled' : ''} title="Add this person">
            <div class="main"><div class="title" style="font-size:13px">${esc(r.pick.label)}</div><div class="sub">${esc(r.pick.description) || 'no description'} · ${r.pick.id}${r.matches.length > 1 ? ` · <button class="linkish" data-alt="${i}">${r.open ? '✕ close' : 'change'}</button>` : ''}</div></div>
            <span class="chip ${r.dup ? '' : 'brass'}">${r.dup ? 'same as above' : 'will add'}</span>
          </div>
          ${r.open ? `<div class="wk-alt">${r.matches.filter((m) => m.id !== r.pick.id).map((m) => `<div class="list-row" data-use="${i}:${m.id}"><div class="main"><div class="title" style="font-size:13px">${esc(m.label)}</div><div class="sub">${esc(m.description) || 'no description'} · ${m.id}</div></div><span class="chip">use this instead</span></div>`).join('')}</div>` : ''}
          ${r.dup ? '' : `<div class="wk-opts"><label><input type="checkbox" data-fam="${i}" ${r.family ? 'checked' : ''}> + family — their relatives too, like Insert family</label></div>`}
        </div>` : `
        <div class="wk-match skip">
          <div class="wk-typed">${esc(r.name)}</div>
          <div class="list-row"><div class="main"><div class="title" style="font-size:13px">No match on Wikidata</div><div class="sub">Likely a private person — not added here; "Type it in" still works for them</div></div></div>
        </div>`)).join('')}
      <div class="row wrap" style="gap:12px;margin-top:16px"><button class="btn btn-primary" id="wk-add" ${chosen.length ? '' : 'disabled'}>Add ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}</button><span style="font-size:11px;color:var(--text-3)">Dates, birthplace, nationality, picture and a Wikipedia evidence item come with each, citing Wikidata.</span></div>
      <div id="wk-progress"></div>
    `;
    results.querySelectorAll('[data-inc]').forEach((cb) => cb.addEventListener('change', () => { rows[+cb.dataset.inc].include = cb.checked; paint(); }));
    results.querySelectorAll('[data-fam]').forEach((cb) => cb.addEventListener('change', () => { rows[+cb.dataset.fam].family = cb.checked; }));
    results.querySelectorAll('[data-alt]').forEach((b) => b.addEventListener('click', () => { const r = rows[+b.dataset.alt]; r.open = !r.open; paint(); }));
    results.querySelectorAll('[data-use]').forEach((el) => el.addEventListener('click', () => {
      const [i, id] = el.dataset.use.split(':');
      const r = rows[+i];
      r.pick = r.matches.find((m) => m.id === id); r.open = false; r.include = true;
      paint();
    }));
    results.querySelector('#wk-add').addEventListener('click', async () => {
      const picks = chosen.map((r) => ({ name: r.name, qid: r.pick.id, label: r.pick.label, family: r.family }));
      results.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
      const prog = results.querySelector('#wk-progress');
      prog.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)">Adding people…</div>';
      const note = prog.firstElementChild;
      const r = await addPeopleFromWikidata(ctx.store, ctx.caseId, picks, (msg) => { note.textContent = `Adding people… ${msg}`; });
      const ok = r.created.length + r.filled.length;
      const headline = [
        r.created.length ? `${r.created.length} ${r.created.length === 1 ? 'person' : 'people'} added` : null,
        r.filled.length ? `${r.filled.length} already here, now filled in (${r.filled.join(', ')})` : null,
      ].filter(Boolean).join(', ');
      const bits = [
        r.created.length ? `with their profile${r.created.length === 1 ? '' : 's'}` : null,
        r.pictures ? `${r.pictures} picture${r.pictures === 1 ? '' : 's'}` : null,
        r.families ? `${r.families} famil${r.families === 1 ? 'y' : 'ies'} inserted` : null,
        r.failed.length ? `couldn't read ${r.failed.join(', ')}` : null,
      ].filter(Boolean).join(' · ');
      results.innerHTML = `
        <div class="inline-note" style="border-left-color:${ok ? 'var(--green)' : 'var(--red)'}">${ok ? `${headline}${bits ? ` — ${bits}` : ''}. Everything cites Wikidata.` : `Nothing added — ${bits || 'the lookup failed'}.`} The tree and the grid behind this drawer are updated.</div>
        <div class="row wrap" style="gap:12px;margin-top:16px"><button class="btn btn-primary" id="wk-done">Done</button><button class="btn btn-ghost" id="wk-more">Add more</button></div>
      `;
      results.querySelector('#wk-done').addEventListener('click', () => ctx.closeDrawer());
      results.querySelector('#wk-more').addEventListener('click', () => renderLookupBatch(results.closest('#ap-body'), ctx));
      ctx.rerender();
    });
  };
  paint();
}

function renderAddRel(body, ctx, people) {
  const opts = people.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join('');
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:16px">Add a relationship</h3>
    <div class="field"><label>A</label><select id="r-a">${opts}</select></div>
    <div class="field"><label>Kind</label><select id="r-kind">${['parent', 'spouse', 'sibling', 'godparent', 'business', 'associate', 'household'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
    <div class="field"><label>B ${'(for "parent" or "godparent", A is the parent or godparent of B)'}</label><select id="r-b">${opts}</select></div>
    <button class="btn btn-primary" id="r-save">Add</button>
  `;
  body.querySelector('#r-save').addEventListener('click', async () => {
    const a = body.querySelector('#r-a').value, b = body.querySelector('#r-b').value;
    const saveBtn = body.querySelector('#r-save');
    if (a === b) { inlineNote(saveBtn, 'Pick two different people — A and B are the same person.'); return; }
    clearInlineNote(saveBtn);
    await ctx.store.upsertRelationship({ case_id: ctx.caseId, a_id: a, b_id: b, kind: body.querySelector('#r-kind').value, confidence: 50, confirmed: 0 });
    ctx.closeDrawer();
    ctx.rerender();
  });
}
