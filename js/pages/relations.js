import { lifePath } from '../numerology.js';
import { signFor } from '../chinese.js';
import { sunSign } from '../western.js';
import { relation } from '../relations.js';
import { expectedDigitCount } from '../stats.js';
import { makeToken, relationGlyph, barRow, emptyState, animalHtml, signHtml } from '../indicators.js';
import { inlineNote, clearInlineNote } from '../ui.js';
import { resolveAssetUrl } from '../assets.js';
import { layoutTree, yearsText, FAMILY_KINDS } from '../tree.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

const VIEW_KEY = 'c7-rel-view';       // 'tree' (default) | 'map'
const NUMBERS_KEY = 'c7-tree-numbers'; // '1' shows the three tokens under each face

async function personStatus(store, personId) {
  const links = await store.listLinksForTarget('person', personId);
  const hasStrong = links.some((l) => ['two_plus', 'single'].includes(l.evidence_verification));
  const hasDisputed = links.some((l) => ['disputed', 'dead_link'].includes(l.evidence_verification));
  if (hasDisputed) return 'contradicted';
  if (hasStrong) return 'sourced';
  return 'drafted';
}

// per render: how far the tree is opened either side of the focus person
const treeState = { up: 1, down: 1 };

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
  const [people, rels] = await Promise.all([store.listPeople(ctx.caseId), store.listRelationships(ctx.caseId)]);
  const view = localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'tree';

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:8px">
        <div class="row" style="gap:8px;align-items:center">
          <span class="section-label">${people.length} people · ${rels.length} relationships</span>
          <div class="seg" id="rel-view">
            <button class="${view === 'tree' ? 'active' : ''}" data-view="tree">Tree</button>
            <button class="${view === 'map' ? 'active' : ''}" data-view="map">Zodiac map</button>
          </div>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" id="add-person-btn">+ Person</button>
          <button class="btn btn-ghost btn-sm" id="add-rel-btn">+ Relationship</button>
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
          <div class="panel-title">Life path grid</div>
          <div id="grid-slot"></div>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#add-person-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddPerson(body, ctx)));
  root.querySelector('#add-rel-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddRel(body, ctx, people)));
  root.querySelectorAll('#rel-view button').forEach((b) => b.addEventListener('click', () => { localStorage.setItem(VIEW_KEY, b.dataset.view); render(root, ctx, focus); }));

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

async function renderTree(slot, ctx, people, rels, focus, rerender) {
  const numbers = localStorage.getItem(NUMBERS_KEY) === '1';
  const up = focus ? treeState.up : Infinity;
  const down = focus ? treeState.down : Infinity;
  const L = layoutTree(people, rels, { focusId: focus, up, down, nodeH: numbers ? 134 : 112 });
  const shownGens = new Set(L.nodes.map((n) => n.gen)).size;

  const wrap = document.createElement('div');
  wrap.className = 'tree-wrap';
  wrap.innerHTML = `
    <div class="row between wrap" style="gap:8px;margin-bottom:8px">
      <span class="mono" style="font-size:11px;color:var(--text-3)">${L.nodes.length} of ${people.length} shown · ${shownGens} generation${shownGens === 1 ? '' : 's'}</span>
      <div class="row wrap" style="gap:6px">
        ${focus ? `<button class="btn btn-ghost btn-sm" id="tree-up" ${L.hiddenAbove ? '' : 'disabled'}>Up 1</button>
        <button class="btn btn-ghost btn-sm" id="tree-down" ${L.hiddenBelow ? '' : 'disabled'}>Down 1</button>
        <button class="btn btn-ghost btn-sm" id="tree-all" ${L.hiddenAbove || L.hiddenBelow ? '' : 'disabled'}>Expand all</button>` : ''}
        <button class="btn btn-ghost btn-sm" id="tree-numbers">${numbers ? 'Numbers on' : 'Numbers off'}</button>
      </div>
    </div>
    ${L.hiddenAbove ? `<button class="tree-more" id="tree-more-up">+ ${L.hiddenAbove} above</button>` : ''}
    <div class="tree-scroll"><div class="tree" style="width:${L.width}px;height:${L.height}px"></div></div>
    ${L.hiddenBelow ? `<button class="tree-more" id="tree-more-down">+ ${L.hiddenBelow} below</button>` : ''}
  `;
  slot.appendChild(wrap);

  const tree = wrap.querySelector('.tree');
  const svg = svgEl('svg', { class: 'tree-lines', width: L.width, height: L.height, viewBox: `0 0 ${L.width} ${L.height}` });
  tree.appendChild(svg);
  const stroke = (confirmed) => (confirmed ? 'var(--text-3)' : 'var(--ink-3)');
  for (const e of L.edges) {
    let el = null;
    if (e.kind === 'couple') el = svgEl('line', { x1: e.x1, y1: e.y, x2: e.x2, y2: e.y, stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'trunk') el = svgEl('line', { x1: e.x, y1: e.y1, x2: e.x, y2: e.y2, stroke: 'var(--text-3)', 'stroke-width': 1.5 });
    else if (e.kind === 'bus') el = svgEl('line', { x1: e.x1, y1: e.y, x2: e.x2, y2: e.y, stroke: 'var(--text-3)', 'stroke-width': 1.5 });
    else if (e.kind === 'drop') el = svgEl('line', { x1: e.x, y1: e.y1, x2: e.x, y2: e.y2, stroke: stroke(e.confirmed), 'stroke-width': 1.5 });
    else if (e.kind === 'god') el = svgEl('path', { d: `M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`, fill: 'none', stroke: 'var(--brass)', 'stroke-width': 1, opacity: 0.6 });
    if (!el) continue;
    if ((e.kind === 'couple' || e.kind === 'drop') && !e.confirmed) el.setAttribute('stroke-dasharray', '4,4');
    if (e.kind === 'god') el.setAttribute('stroke-dasharray', '2,4');
    svg.appendChild(el);
  }

  // godparent tags per person
  const godTag = new Map();
  for (const r of rels) {
    if (r.kind !== 'godparent') continue;
    const a = people.find((p) => p.id === r.a_id), b = people.find((p) => p.id === r.b_id);
    if (!a || !b) continue;
    godTag.set(r.b_id, `godchild of ${a.display_name.split(' ')[0]}`);
    godTag.set(r.a_id, `godparent of ${b.display_name.split(' ')[0]}`);
  }

  for (const n of L.nodes) {
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
      ${godTag.has(p.id) ? `<div class="tag">${godTag.get(p.id)}</div>` : ''}
    `;
    if (numbers) {
      const tr = document.createElement('div');
      tr.className = 'token-row';
      tr.style.justifyContent = 'center';
      tr.style.marginTop = '4px';
      const status = await personStatus(ctx.store, p.id);
      const lp = lifePath(p.birth_date), sun = sunSign(p.birth_date), ch = signFor(p.birth_date);
      tr.appendChild(makeToken('lifePath', { status: lp.ok ? status : 'unknown', master: lp.master, value: lp.value }));
      tr.appendChild(makeToken('animalYear', { status: ch.ok ? status : 'unknown', boundary: ch.boundary, animal: ch.animal, animalIndex: ch.animalIndex, element: ch.element }));
      tr.appendChild(makeToken('sunSign', { status: sun.ok ? status : 'unknown', cusp: sun.cusp, sign: sun.sign }));
      el.appendChild(tr);
    }
    el.title = `${p.display_name} — open profile`;
    el.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
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

  // keep the focus in view when the tree is wider than the box
  const fn = L.nodes.find((n) => n.id === focus);
  const scroll = wrap.querySelector('.tree-scroll');
  if (fn) requestAnimationFrame(() => { scroll.scrollLeft = Math.max(0, fn.x - scroll.clientWidth / 2 + L.nodeW / 2); });

  wrap.querySelector('#tree-up')?.addEventListener('click', () => { treeState.up += 1; rerender(); });
  wrap.querySelector('#tree-down')?.addEventListener('click', () => { treeState.down += 1; rerender(); });
  wrap.querySelector('#tree-all')?.addEventListener('click', () => { treeState.up = 99; treeState.down = 99; rerender(); });
  wrap.querySelector('#tree-more-up')?.addEventListener('click', () => { treeState.up += 1; rerender(); });
  wrap.querySelector('#tree-more-down')?.addEventListener('click', () => { treeState.down += 1; rerender(); });
  wrap.querySelector('#tree-numbers').addEventListener('click', () => { localStorage.setItem(NUMBERS_KEY, numbers ? '0' : '1'); rerender(); });
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

async function renderZodiacMap(mapSlot, ctx, people, rels) {
  const { store } = ctx;
  const mapEl = document.createElement('div');
  mapEl.className = 'rel-map';
  const svg = svgEl('svg', { class: 'rel-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
  mapEl.appendChild(svg);

  const n = people.length;
  const positions = {};
  people.forEach((p, i) => {
    const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
    positions[p.id] = { x: 50 + 36 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) };
  });

  for (const r of rels) {
    const a = positions[r.a_id], b = positions[r.b_id];
    if (!a || !b) continue;
    const pa = people.find((p) => p.id === r.a_id), pb = people.find((p) => p.id === r.b_id);
    const sa = signFor(pa.birth_date), sb = signFor(pb.birth_date);
    const unsettled = !(sa.ok && !sa.boundary && sb.ok && !sb.boundary);
    const kind = unsettled ? 'neutral' : relation(sa.animalIndex, sb.animalIndex);

    const line = svgEl('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: r.confirmed ? 'var(--line)' : 'var(--text-3)', 'stroke-width': 0.4 });
    if (!r.confirmed) line.setAttribute('stroke-dasharray', '1.2,1');
    svg.appendChild(line);

    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    const glyphHolder = document.createElement('div');
    glyphHolder.style.cssText = `position:absolute;left:${midX}%;top:${midY}%;transform:translate(-50%,-50%);background:var(--ink-1);border-radius:3px;`;
    glyphHolder.appendChild(relationGlyph(kind, { unsettled }));
    glyphHolder.title = `${r.kind}${unsettled ? ' — one birth year unsettled' : ' — ' + kind}`;
    mapEl.appendChild(glyphHolder);
  }

  for (const p of people) {
    const pos = positions[p.id];
    const node = document.createElement('div');
    node.className = 'rel-node';
    node.style.left = `${pos.x}%`;
    node.style.top = `${pos.y}%`;
    const status = await personStatus(store, p.id);
    const lp = lifePath(p.birth_date);
    const sun = sunSign(p.birth_date);
    const chinese = signFor(p.birth_date);
    node.innerHTML = `<div class="name">${p.display_name}</div>`;
    if (p.photo_path || p.photo_url) {
      const av = document.createElement('div');
      av.className = 'node-avatar';
      node.prepend(av);
      (p.photo_path ? resolveAssetUrl(p.photo_path, 'image/jpeg') : Promise.resolve(null)).then((u) => {
        const src = u || p.photo_url;
        if (!src) { av.remove(); return; }
        const img = document.createElement('img');
        img.alt = ''; img.src = src;
        img.addEventListener('error', () => av.remove());
        av.appendChild(img);
      });
    }
    const tr = document.createElement('div');
    tr.className = 'token-row';
    tr.style.justifyContent = 'center';
    tr.style.marginTop = '4px';
    tr.appendChild(makeToken('lifePath', { status: lp.ok ? status : 'unknown', master: lp.master, value: lp.value }));
    tr.appendChild(makeToken('animalYear', { status: chinese.ok ? status : 'unknown', boundary: chinese.boundary, animal: chinese.animal, animalIndex: chinese.animalIndex, element: chinese.element }));
    tr.appendChild(makeToken('sunSign', { status: sun.ok ? status : 'unknown', cusp: sun.cusp, sign: sun.sign }));
    node.appendChild(tr);
    node.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
    mapEl.appendChild(node);
  }
  mapSlot.appendChild(mapEl);
}

// --------------------------------------------------------- number panels --

function renderNumberPanels(root, people) {
  const repeatSlot = root.querySelector('#repeat-slot');
  const withLifePath = people.map((p) => lifePath(p.birth_date)).filter((r) => r.ok);
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

  const gridSlot = root.querySelector('#grid-slot');
  if (!people.length) {
    gridSlot.appendChild(emptyState({ missing: 'No people yet.', why: 'Add people to populate this grid.' }));
  } else {
    const table = document.createElement('table');
    table.className = 'dense';
    table.innerHTML = `<thead><tr><th>Person</th><th>Life path</th><th>Sun sign</th><th>Animal</th></tr></thead><tbody>${people.map((p) => {
      const lp = lifePath(p.birth_date);
      const sun = sunSign(p.birth_date);
      const ch = signFor(p.birth_date);
      return `<tr><td>${p.display_name}</td><td class="num">${lp.ok ? lp.value + (lp.master ? '★' : '') : '—'}</td><td>${sun.ok ? signHtml(sun.sign) : '—'}</td><td>${ch.ok && !ch.boundary ? animalHtml(ch.animal) : ch.boundary ? 'boundary' : '—'}</td></tr>`;
    }).join('')}</tbody>`;
    gridSlot.appendChild(table);
    const key = document.createElement('div');
    key.className = 'zc-key';
    key.innerHTML = `<span><span class="zc zc-blue">Snake · Ox · Rooster</span></span><span><span class="zc zc-green">Dog · Tiger · Horse</span></span><span><span class="zc zc-pink">Pig · Goat · Rabbit</span></span><span><span class="zc zc-yellow">Rat · Dragon · Monkey</span></span>
      <span><span class="zc ws-air">air</span> · <span class="zc ws-fire">fire</span> · <span class="zc ws-earth">earth</span> · <span class="zc ws-water">water</span></span>`;
    gridSlot.appendChild(key);
  }
}

// ----------------------------------------------------------------- forms --

function renderAddPerson(body, ctx) {
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:16px">Add a person</h3>
    <div class="field"><label>Display name</label><input type="text" id="p-name"></div>
    <div class="field"><label>Kind</label><select id="p-kind"><option value="person">person</option><option value="household">household</option><option value="org">org</option></select></div>
    <div class="field"><label>Birth date (leave blank if unknown)</label><input type="date" id="p-bdate"></div>
    <button class="btn btn-primary" id="p-save">Add</button>
  `;
  body.querySelector('#p-save').addEventListener('click', async () => {
    const nameInput = body.querySelector('#p-name');
    const name = nameInput.value.trim();
    if (!name) { inlineNote(nameInput, 'A name is required.'); nameInput.focus(); return; }
    clearInlineNote(nameInput);
    const bdate = body.querySelector('#p-bdate').value;
    await ctx.store.createPerson({
      case_id: ctx.caseId, display_name: name, kind: body.querySelector('#p-kind').value,
      birth_date: bdate || null, birth_precision: bdate ? 'day' : 'unknown',
    });
    ctx.closeDrawer();
    ctx.rerender();
  });
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
