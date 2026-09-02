import { lifePath } from '../numerology.js';
import { signFor } from '../chinese.js';
import { sunSign } from '../western.js';
import { relation } from '../relations.js';
import { expectedDigitCount } from '../stats.js';
import { makeToken, relationGlyph, barRow, emptyState } from '../indicators.js';
import { inlineNote, clearInlineNote } from '../ui.js';
import { resolveAssetUrl } from '../assets.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }

async function personStatus(store, personId) {
  const links = await store.listLinksForTarget('person', personId);
  const hasStrong = links.some((l) => ['two_plus', 'single'].includes(l.evidence_verification));
  const hasDisputed = links.some((l) => ['disputed', 'dead_link'].includes(l.evidence_verification));
  if (hasDisputed) return 'contradicted';
  if (hasStrong) return 'sourced';
  return 'drafted';
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }

  const [people, rels] = await Promise.all([store.listPeople(ctx.caseId), store.listRelationships(ctx.caseId)]);

  root.innerHTML = `
    <div class="stack">
      <div class="row between">
        <span class="section-label">${people.length} people · ${rels.length} relationships</span>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" id="add-person-btn">+ Person</button>
          <button class="btn btn-ghost btn-sm" id="add-rel-btn">+ Relationship</button>
        </div>
      </div>
      <div id="map-slot"></div>
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

  const mapSlot = root.querySelector('#map-slot');
  if (!people.length) {
    mapSlot.appendChild(emptyState({ missing: 'No people in this case yet.', why: 'Add the first person to start the map.', action: '+ Person', onAction: () => ctx.openDrawer((body) => renderAddPerson(body, ctx)) }));
  } else {
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
      // the profile picture, when there is one — the map is where faces help most
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

  // repeating numbers panel
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
      repeatSlot.appendChild(barRow({ label: `Life path ${v}`, value: counts[v], max: Math.max(counts[v], expected, 1), display: `${counts[v]} (expect ${expected.toFixed(1)})` }));
    }
  }

  // life path grid
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
      return `<tr><td>${p.display_name}</td><td class="num">${lp.ok ? lp.value + (lp.master ? '★' : '') : '—'}</td><td>${sun.ok ? sun.sign : '—'}</td><td>${ch.ok && !ch.boundary ? ch.animal : ch.boundary ? 'boundary' : '—'}</td></tr>`;
    }).join('')}</tbody>`;
    gridSlot.appendChild(table);
  }
}

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
    <div class="field"><label>Kind</label><select id="r-kind">${['parent', 'spouse', 'sibling', 'business', 'associate', 'household'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
    <div class="field"><label>B ${'(for "parent", A is the parent of B)'}</label><select id="r-b">${opts}</select></div>
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
