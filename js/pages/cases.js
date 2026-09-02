// Cases — the home screen (her redesign, 2026-09-02, 28 answers). The list
// IS the home: picture cards, most recently opened first, tap to go straight
// in (a person-case opens the person's profile; a family-case its overview).
import { emptyState } from '../indicators.js';
import { inlineNameForm, twoTapConfirm } from '../ui.js';
import { resolveAssetUrl } from '../assets.js';
import { CASE_KINDS, createCaseOfKind } from './dashboard.js';

const OPENED_KEY = 'c7-case-opened'; // { caseId: timestamp } — per device, that's fine

function openedMap() {
  try { return JSON.parse(localStorage.getItem(OPENED_KEY) || '{}'); } catch (_) { return {}; }
}
export function markOpened(caseId) {
  const m = openedMap();
  m[caseId] = Date.now();
  localStorage.setItem(OPENED_KEY, JSON.stringify(m));
}

/** Go into a case: person-case → the person's profile; family (or several people) → family overview. */
export async function openCase(ctx, kase) {
  markOpened(kase.id);
  await ctx.setCaseId(kase.id);
  const people = await ctx.store.listPeople(kase.id);
  if (kase.kind === 'family' || (kase.kind !== 'person' && people.length > 1)) { ctx.navigate('#/family'); return; }
  let p = people[0];
  if (!p) p = await ctx.store.createPerson({ case_id: kase.id, display_name: kase.name, kind: 'person' });
  ctx.navigate(`#/subject/${p.id}`);
}

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

async function faceEl(person, size) {
  const el = document.createElement('div');
  el.className = 'face';
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = `<span class="initials">${initials(person.display_name)}</span>`;
  const src = person.photo_path ? await resolveAssetUrl(person.photo_path, 'image/jpeg') : person.photo_url;
  if (src) {
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    img.addEventListener('load', () => el.querySelector('.initials')?.remove());
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const opened = openedMap();
  const cases = (await store.listCases()).filter((c) => c.kind !== 'fun')
    .sort((a, b) => (opened[b.id] || 0) - (opened[a.id] || 0) || (a.updated_at < b.updated_at ? 1 : -1));

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <div class="search-box" style="flex:1;min-width:220px">
          <span class="ic">⌕</span>
          <input type="search" id="all-search" placeholder="Search everything — people, evidence, quotes, in any case">
        </div>
        <button class="btn btn-primary" id="new-case-btn">+ New</button>
      </div>
      <div id="new-case-slot"></div>
      <div id="search-results"></div>
      <div id="case-grid" class="case-grid"></div>
    </div>
  `;

  root.querySelector('#new-case-btn').addEventListener('click', () => {
    const slot = root.querySelector('#new-case-slot');
    if (slot.querySelector('.inline-form')) return;
    slot.appendChild(inlineNameForm({
      placeholder: 'Who or what is this case about?',
      choices: CASE_KINDS,
      onSubmit: async (name, kind) => {
        const kase = await createCaseOfKind(store, ctx, name, kind);
        markOpened(kase.id);
        if (kind === 'person') sessionStorage.setItem('c7-offer-lookup', '1'); // the new profile offers Look up
      },
    }));
  });

  const grid = root.querySelector('#case-grid');
  if (!cases.length) {
    grid.appendChild(emptyState({
      missing: 'No case files yet.',
      why: 'A case is about one person, or a family. Everything you attach — evidence, relations, contradictions — lives inside it.',
      action: '+ New case',
      onAction: () => root.querySelector('#new-case-btn').click(),
    }));
  }

  for (const c of cases) {
    const sum = await store.caseSummary(c.id);
    const card = document.createElement('div');
    card.className = 'case-card';
    card.innerHTML = `
      <div class="pic"></div>
      <div class="body">
        <div class="row between" style="align-items:flex-start;gap:6px">
          <div class="title">${c.name}</div>
          <button class="btn btn-ghost btn-sm menu-btn" title="Rename · change kind">⋯</button>
        </div>
        <div class="badges"></div>
        <div class="row" style="gap:6px;margin-top:8px">
          <button class="btn btn-ghost btn-sm import-btn">Import</button>
          <button class="btn btn-ghost btn-sm delete-btn">Delete</button>
        </div>
        <div class="menu-slot"></div>
      </div>
    `;
    // picture: the person's face, or up to three family faces
    const pic = card.querySelector('.pic');
    const faces = sum.people.slice(0, c.kind === 'family' ? 3 : 1);
    if (!faces.length) pic.innerHTML = `<span class="initials">${initials(c.name)}</span>`;
    else if (faces.length === 1) pic.appendChild(await faceEl(faces[0], 64));
    else { pic.classList.add('multi'); for (const p of faces) pic.appendChild(await faceEl(p, 40)); }
    // badges only when there is something
    const badges = card.querySelector('.badges');
    if (sum.toReview) badges.innerHTML += `<span class="chip brass">${sum.toReview} to review</span>`;
    if (sum.inbox) badges.innerHTML += `<span class="chip">${sum.inbox} image${sum.inbox === 1 ? '' : 's'}</span>`;
    if (sum.questions) badges.innerHTML += `<span class="chip">${sum.questions} open</span>`;

    card.addEventListener('click', (e) => { if (e.target.closest('button, .menu-slot, .inline-form')) return; openCase(ctx, c); });
    card.querySelector('.import-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      markOpened(c.id); await ctx.setCaseId(c.id);
      const people = await store.listPeople(c.id);
      ctx.navigate(people.length === 1 && c.kind !== 'family' ? `#/subject/${people[0].id}/import` : '#/import');
    });
    twoTapConfirm(card.querySelector('.delete-btn'), {
      confirmLabel: 'Really delete?',
      onConfirm: async () => { await store.softDeleteCase(c.id); if (c.id === ctx.caseId) await ctx.setCaseId(null); render(root, ctx); },
    });
    card.querySelector('.menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const slot = card.querySelector('.menu-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      slot.innerHTML = `
        <div class="row wrap" style="gap:6px;margin-top:8px">
          <button class="btn btn-ghost btn-sm m-rename">Rename</button>
          <button class="btn btn-ghost btn-sm m-kind">${c.kind === 'family' ? 'Make it a person case' : 'Make it a family case'}</button>
        </div>`;
      slot.querySelector('.m-rename').addEventListener('click', () => {
        slot.innerHTML = '';
        slot.appendChild(inlineNameForm({ value: c.name, submitLabel: 'Save', onSubmit: async (name) => { await store.updateCase(c.id, { name }); render(root, ctx); } }));
      });
      slot.querySelector('.m-kind').addEventListener('click', async () => {
        await store.updateCase(c.id, { kind: c.kind === 'family' ? 'person' : 'family' });
        render(root, ctx);
      });
    });
    grid.appendChild(card);
  }

  // search everything, live
  const input = root.querySelector('#all-search');
  const resultsEl = root.querySelector('#search-results');
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      resultsEl.innerHTML = '';
      grid.style.display = q ? 'none' : '';
      if (!q) return;
      const hits = await store.searchAll(q);
      if (!hits.length) { resultsEl.appendChild(emptyState({ missing: `No matches for “${q}”.`, why: 'Searched case names, people, evidence titles and notes, and video quotes.' })); return; }
      const panel = document.createElement('div');
      panel.className = 'panel';
      for (const h of hits) {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${h.label || '(untitled)'}</div><div class="sub">${h.type}${h.sub ? ' · ' + h.sub : ''} · <span style="color:var(--brass)">${h.case_name}</span></div></div>`;
        row.addEventListener('click', async () => {
          const kase = (await store.listCases()).find((k) => k.id === h.case_id);
          markOpened(h.case_id); await ctx.setCaseId(h.case_id);
          if (h.type === 'person') ctx.navigate(`#/subject/${h.id}`);
          else if (h.type === 'moment') ctx.navigate(`#/video/${h.evidence_id}`);
          else if (h.type === 'evidence') ctx.navigate('#/evidence');
          else if (kase) openCase(ctx, kase);
        });
        panel.appendChild(row);
      }
      resultsEl.appendChild(panel);
    }, 200);
  });
}
