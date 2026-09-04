// Cases — the home screen (her redesign, 2026-09-02, 28 answers). The list
// IS the home: picture cards, most recently opened first, tap to go straight
// in (a person-case opens the person's profile; a family-case its overview).
import { emptyState } from '../indicators.js';
import { inlineNameForm, twoTapConfirm, inlineNote, clearInlineNote } from '../ui.js';
import { resolveAssetUrl } from '../assets.js';
import { CASE_KINDS, createCaseOfKind } from './dashboard.js';
import { searchPeople, fillFromWikidata, insertFamily } from '../lookup.js';
import { fetchWorks, addWorks } from '../works.js';

const OPENED_KEY = 'c7-case-opened'; // { caseId: timestamp } — per device, that's fine

// the "⋯" menu's kind-switcher offers the two kinds a case ISN'T, each one
// click away — a cycle button hid "event" a click deep behind "family" for
// any case starting as a person (2026-09-04, her screenshot)
const KIND_LABEL = { person: 'a person case', family: 'a family case', event: 'an event case' };
const otherKinds = (kind) => Object.keys(KIND_LABEL).filter((k) => k !== (KIND_LABEL[kind] ? kind : 'person'));
const KIND_SHORT = { person: 'Person', family: 'Family', event: 'Event' };

// the database table (v62, 2026-09-04, her ask — "change cases to
// database"): STYLE.md already calls for "tables over scattered cards" on
// desktop; the card grid never actually did that. A Table/Cards toggle,
// remembered per device; mobile always keeps the cards (the CSS hides the
// toggle under 640px, and boot forces 'cards' there regardless of the
// stored pick, since a dense table has nowhere to go on a phone).
const VIEW_KEY = 'c7-cases-view';
const SORT_KEY = 'c7-cases-sort';
function isNarrow() { return window.matchMedia('(max-width: 640px)').matches; }
function getView() {
  if (isNarrow()) return 'cards';
  return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table';
}
function setView(v) { localStorage.setItem(VIEW_KEY, v); }
function getSort() {
  try { return JSON.parse(localStorage.getItem(SORT_KEY)) || { key: 'opened', dir: 'desc' }; }
  catch (_) { return { key: 'opened', dir: 'desc' }; }
}
function setSort(s) { localStorage.setItem(SORT_KEY, JSON.stringify(s)); }
function timeAgo(ms) {
  if (!ms) return '—';
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function openedMap() {
  try { return JSON.parse(localStorage.getItem(OPENED_KEY) || '{}'); } catch (_) { return {}; }
}
export function markOpened(caseId) {
  const m = openedMap();
  m[caseId] = Date.now();
  localStorage.setItem(OPENED_KEY, JSON.stringify(m));
}

/** The person a person-case is about: named like the case, else the first one created (relatives come later). */
export function subjectOf(kase, people) {
  if (!people.length) return null;
  const name = kase.name.trim().toLowerCase();
  return people.find((p) => p.display_name.trim().toLowerCase() === name)
    || [...people].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
}

/** Go into a case: person-case → the person's profile; family (or several people) → family overview; event → its own overview. */
export async function openCase(ctx, kase) {
  markOpened(kase.id);
  await ctx.setCaseId(kase.id);
  if (kase.kind === 'event') { ctx.navigate('#/event'); return; }
  const people = await ctx.store.listPeople(kase.id);
  if (kase.kind === 'family' || (kase.kind !== 'person' && people.length > 1)) { ctx.navigate('#/family'); return; }
  let p = subjectOf(kase, people);
  if (!p) p = await ctx.store.createPerson({ case_id: kase.id, display_name: kase.name, kind: 'person' });
  ctx.navigate(`#/subject/${p.id}`);
}

/**
 * Converting a case to Event drops its auto-created "subject" person if it
 * still looks untouched — her call on World War 1 (2026-09-04): keep the
 * case and its evidence, but the placeholder person that only ever existed
 * to give a person-case a profile has no reason to survive the switch.
 */
async function dropPlaceholderPerson(store, kase) {
  const people = await store.listPeople(kase.id);
  if (people.length !== 1) return;
  const p = people[0];
  const blank = !p.birth_date && !p.death_date && !p.notes && !p.photo_path && !p.photo_url && !p.wikidata_id && !p.occupation && !p.nationality;
  if (blank && p.display_name.trim().toLowerCase() === kase.name.trim().toLowerCase()) await store.softDeletePerson(p.id);
}

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

/**
 * "Look up on Wikipedia" inside the + New form (her ask, 2026-09-04): search
 * the typed name, show the matches, and "Create from this" makes the case
 * AND the person, filled straight from Wikidata — dates, birthplace,
 * nationality, picture, Wikipedia evidence — with an optional "+ family"
 * that brings the relatives in, then lands on the profile. Same machinery
 * as the family page's batch add; Create alone still makes a bare case.
 */
function wireCaseLookup(form, ctx, store) {
  const rowEl = form.querySelector('.row');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm if-wiki';
  btn.textContent = 'Look up on Wikipedia';
  btn.title = 'Find this person on Wikipedia and create the case from the record — dates, picture, evidence come with it';
  rowEl.insertBefore(btn, rowEl.querySelector('.if-cancel'));
  const results = document.createElement('div');
  results.className = 'if-wiki-results';
  form.appendChild(results);
  // this searches Wikidata for a person — no fit for "a major event" (2026-09-04)
  const kindSelect = form.querySelector('.if-choice');
  const syncWikiVisibility = () => {
    const isEvent = kindSelect?.value === 'event';
    btn.style.display = isEvent ? 'none' : '';
    if (isEvent) results.innerHTML = '';
  };
  kindSelect?.addEventListener('change', syncWikiVisibility);
  syncWikiVisibility();

  btn.addEventListener('click', async () => {
    const name = form.querySelector('input[type="text"]').value.trim();
    clearInlineNote(btn);
    results.innerHTML = '';
    if (!name) { inlineNote(btn, 'Type the name first.'); form.querySelector('input[type="text"]').focus(); return; }
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(name); }
    catch (e) { inlineNote(btn, `Couldn't reach Wikidata — ${e.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = 'Look up on Wikipedia';
    if (!matches.length) { if (!btn.nextElementSibling?.classList.contains('inline-note')) inlineNote(btn, 'No match on Wikidata — likely a private person; Create makes the case by name.'); return; }
    results.innerHTML = `
      <div class="row wrap" style="gap:12px;margin-top:8px;align-items:center">
        <span class="section-label">Create the case from a Wikipedia record</span>
        <label class="row" style="gap:4px;font-size:12px;color:var(--text-3);align-items:center"><input type="checkbox" class="if-family"> + family — their relatives too, like Insert family</label>
        <label class="row" style="gap:4px;font-size:12px;color:var(--text-3);align-items:center"><input type="checkbox" class="if-works"> + works — albums, EPs, singles and songs with release dates (for a musician)</label>
      </div>`;
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${m.label}</div><div class="sub">${m.description || 'no description'} · ${m.id}</div></div><span class="chip brass">Create from this ▸</span>`;
      row.addEventListener('click', () => createFromWikidata(m));
      results.appendChild(row);
    }
  });

  async function createFromWikidata(m) {
    const kind = form.querySelector('.if-choice')?.value || 'person';
    const worldCheck = form.querySelector('.if-fictional');
    const world = worldCheck?.checked ? (form.querySelector('.if-world').value.trim() || 'Fictional') : null;
    const family = !!form.querySelector('.if-family')?.checked;
    const works = !!form.querySelector('.if-works')?.checked;
    results.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)" id="cw-progress">Creating the case…</div>';
    const prog = results.querySelector('#cw-progress');
    const kase = await store.createCase({ name: m.label, kind, world });
    await ctx.setCaseId(kase.id);
    markOpened(kase.id);
    const person = await store.createPerson({ case_id: kase.id, display_name: m.label, kind: 'person', wikidata_id: m.id, notes: `Wikidata https://www.wikidata.org/wiki/${m.id}` });
    prog.textContent = 'Filling in from Wikidata — dates, picture, evidence…';
    try { await fillFromWikidata(store, kase.id, person.id, m.id); }
    catch (e) { prog.textContent = `The case is made; the record could not be read (${e.message}). Look up again from the profile.`; }
    if (family) {
      try { await insertFamily(store, kase.id, person.id, m.id, (msg) => { prog.textContent = `Inserting family… ${msg}`; }); }
      catch (e) { prog.textContent = `Family could not be read (${e.message}) — Insert family again from the profile.`; }
    }
    if (works) {
      try {
        prog.textContent = 'Reading their works from Wikidata — up to a minute for a long catalogue…';
        // duets / covers, dates before the career started, and compilations wait for the profile's picker, where they can be ticked
        const list = (await fetchWorks(m.id, (msg) => { prog.textContent = `Reading their works from Wikidata — ${msg}`; })).filter((w) => !w.shared && !w.suspect && !w.compilation);
        const r = await addWorks(store, kase.id, person.id, list, (msg) => { prog.textContent = `Adding works… ${msg}`; });
        sessionStorage.setItem('c7-pi-result', `${r.added} work${r.added === 1 ? '' : 's'} added from Wikidata${r.undated ? ` (${r.undated} without a release date)` : ''}.`);
      } catch (e) { prog.textContent = `Works could not be read (${e.message}) — + Works again from the profile.`; }
    }
    ctx.navigate(kind === 'family' ? '#/family' : `#/subject/${person.id}`);
  }
}

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

/** One small circular thumb for a table row — the case's subject face, or the violet Event mark. */
async function rowThumbEl(c, people) {
  if (c.kind === 'event') {
    const el = document.createElement('div');
    el.className = 'face';
    el.style.cssText = 'width:26px;height:26px;background:linear-gradient(155deg,#362f57,#1c1930)';
    el.innerHTML = `<span class="initials" style="color:var(--violet);font-size:10px">${initials(c.name)}</span>`;
    return el;
  }
  const subject = subjectOf(c, people);
  return faceEl(subject || { display_name: c.name }, 26);
}

/**
 * The ⋯ menu — rename, kind-switch, duplicates, delete — shared by the
 * card and the table row so both stay in sync with one implementation.
 */
function wireCaseMenu(menuBtn, slot, c, ctx, store, onChanged) {
  menuBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (slot.children.length) { slot.innerHTML = ''; return; }
    const dups = await store.findDuplicates(c.id);
    const flagged = dups.people.length ? `${dups.people.length} same-name ${dups.people.length === 1 ? 'person' : 'people'} (${dups.people.map((p) => p.name).join(', ')}) — not removed` : '';
    slot.innerHTML = `
      <div class="row wrap" style="gap:6px;margin-top:8px">
        <button class="btn btn-ghost btn-sm m-rename">Rename</button>
        ${otherKinds(c.kind).map((k) => `<button class="btn btn-ghost btn-sm m-kind" data-kind="${k}">Make it ${KIND_LABEL[k]}</button>`).join('')}
        ${dups.total ? `<button class="btn btn-ghost btn-sm m-dups" style="color:var(--brass)">Clean up duplicates · ${dups.total}</button>` : ''}
        <button class="btn btn-ghost btn-sm m-delete" style="color:var(--text-3)">Delete case</button>
      </div>
      ${dups.total || flagged ? `<div class="mono" style="font-size:11px;color:var(--text-3);margin-top:6px">${[dups.claims.length ? `${dups.claims.length} claim${dups.claims.length === 1 ? '' : 's'}` : null, dups.evidenceCount ? `${dups.evidenceCount} evidence item${dups.evidenceCount === 1 ? '' : 's'} (same link)` : null, flagged || null].filter(Boolean).join(' · ')}</div>` : ''}`;
    twoTapConfirm(slot.querySelector('.m-delete'), {
      confirmLabel: 'Really delete this case?',
      onConfirm: async () => { await store.softDeleteCase(c.id); if (c.id === ctx.caseId) await ctx.setCaseId(null); onChanged(); },
    });
    if (dups.total) {
      twoTapConfirm(slot.querySelector('.m-dups'), {
        confirmLabel: `Really remove ${dups.total}?`,
        onConfirm: async () => { await store.removeDuplicates(c.id); onChanged(); },
      });
    }
    slot.querySelector('.m-rename').addEventListener('click', () => {
      slot.innerHTML = '';
      slot.appendChild(inlineNameForm({ value: c.name, submitLabel: 'Save', onSubmit: async (name) => { await store.updateCase(c.id, { name }); onChanged(); } }));
    });
    for (const btn of slot.querySelectorAll('.m-kind')) {
      btn.addEventListener('click', async () => {
        const kind = btn.dataset.kind;
        await store.updateCase(c.id, { kind });
        if (kind === 'event') await dropPlaceholderPerson(store, c);
        onChanged();
      });
    }
  });
}

function wireImportBtn(btn, c, ctx, store) {
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    markOpened(c.id); await ctx.setCaseId(c.id);
    const people = await store.listPeople(c.id);
    const subject = c.kind !== 'family' ? subjectOf(c, people) : null;
    ctx.navigate(subject ? `#/subject/${subject.id}/import` : '#/import');
  });
}

async function buildCaseCard(c, sum, ctx, store, onChanged) {
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
      </div>
      <div class="menu-slot"></div>
    </div>
  `;
  // picture: the person's face, up to three family faces, or the violet Event mark
  const pic = card.querySelector('.pic');
  if (c.world) pic.innerHTML = `<span class="fic-ribbon">${c.world === 'Fictional' ? 'Fictional' : c.world}</span>`;
  if (c.kind === 'event') {
    pic.classList.add('event');
    pic.innerHTML += `<span class="event-ribbon">Event</span><span class="initials">${initials(c.name)}</span>`;
  } else {
    const subject = subjectOf(c, sum.people);
    const faces = c.kind === 'family' ? sum.people.slice(0, 3) : (subject ? [subject] : []);
    if (!faces.length) pic.innerHTML += `<span class="initials">${initials(c.name)}</span>`;
    else if (faces.length === 1) pic.appendChild(await faceEl(faces[0], 64));
    else { pic.classList.add('multi'); for (const p of faces) pic.appendChild(await faceEl(p, 40)); }
  }
  // badges only when there is something
  const badges = card.querySelector('.badges');
  if (sum.toReview) badges.innerHTML += `<span class="chip brass">${sum.toReview} to review</span>`;
  if (sum.inbox) badges.innerHTML += `<span class="chip">${sum.inbox} image${sum.inbox === 1 ? '' : 's'}</span>`;
  if (sum.questions) badges.innerHTML += `<span class="chip q-open" title="Open questions — tap to see them">${sum.questions} open</span>`;

  card.addEventListener('click', (e) => { if (e.target.closest('button, .menu-slot, .inline-form, .q-open')) return; openCase(ctx, c); });
  card.querySelector('.q-open')?.addEventListener('click', async () => { markOpened(c.id); await ctx.setCaseId(c.id); ctx.navigate('#/questions'); });
  wireImportBtn(card.querySelector('.import-btn'), c, ctx, store);
  wireCaseMenu(card.querySelector('.menu-btn'), card.querySelector('.menu-slot'), c, ctx, store, onChanged);
  return card;
}

async function buildCaseRow(c, sum, opened, ctx, store, onChanged) {
  const tr = document.createElement('tr');
  const era = c.era_start || c.era_end ? `${c.era_start || '?'}–${c.era_end || '?'}` : '—';
  const kindClass = c.kind === 'event' ? 'violet' : c.kind === 'family' ? 'brass' : '';
  const badges = [];
  if (sum.toReview) badges.push(`<span class="chip brass">${sum.toReview} to review</span>`);
  if (sum.inbox) badges.push(`<span class="chip">${sum.inbox} image${sum.inbox === 1 ? '' : 's'}</span>`);
  if (sum.questions) badges.push(`<span class="chip q-open" title="Open questions — tap to see them">${sum.questions} open</span>`);
  const lastOpened = opened[c.id] || Date.parse(c.updated_at) || 0;
  tr.innerHTML = `
    <td><div class="rowname"><div class="thumb-slot"></div>${c.name}${c.world ? ` <span class="chip violet">${c.world === 'Fictional' ? 'Fictional' : c.world}</span>` : ''}</div></td>
    <td><span class="chip ${kindClass}">${KIND_SHORT[c.kind] || 'Person'}</span></td>
    <td class="num">${era}</td>
    <td class="num">${sum.people.length}</td>
    <td>${badges.join('')}</td>
    <td class="num">${timeAgo(lastOpened)}</td>
    <td class="actions"><div class="row-actions"><button class="btn btn-ghost btn-sm import-btn">Import</button><button class="btn btn-ghost btn-sm menu-btn" title="Rename · change kind">⋯</button></div></td>
  `;
  tr.querySelector('.thumb-slot').replaceWith(await rowThumbEl(c, sum.people));
  const menuRow = document.createElement('tr');
  const menuTd = document.createElement('td');
  menuTd.colSpan = 7;
  menuTd.className = 'menu-slot';
  menuRow.appendChild(menuTd);
  menuRow.style.display = 'none';

  tr.addEventListener('click', (e) => { if (e.target.closest('button, .q-open')) return; openCase(ctx, c); });
  tr.querySelector('.q-open')?.addEventListener('click', async (e) => { e.stopPropagation(); markOpened(c.id); await ctx.setCaseId(c.id); ctx.navigate('#/questions'); });
  wireImportBtn(tr.querySelector('.import-btn'), c, ctx, store);
  wireCaseMenu(tr.querySelector('.menu-btn'), menuTd, c, ctx, store, onChanged);
  // the menu slot only needs to exist while open — hide/show its row with it
  const mo = new MutationObserver(() => { menuRow.style.display = menuTd.children.length ? '' : 'none'; });
  mo.observe(menuTd, { childList: true });
  return [tr, menuRow];
}

async function buildTable(withSums, opened, sortState, ctx, store, onChanged) {
  const wrap = document.createElement('div');
  wrap.className = 'panel table-scroll';
  const arrow = (key) => (sortState.key === key ? `<span class="arrow">${sortState.dir === 'asc' ? '▴' : '▾'}</span>` : '');
  const table = document.createElement('table');
  table.className = 'dense';
  table.innerHTML = `
    <thead><tr>
      <th class="sortable" data-sort="name">Name${arrow('name')}</th>
      <th>Kind</th>
      <th>Era</th>
      <th class="sortable" data-sort="people">People${arrow('people')}</th>
      <th>Attention</th>
      <th class="sortable" data-sort="opened">Last opened${arrow('opened')}</th>
      <th></th>
    </tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  for (const { c, sum } of withSums) {
    const [tr, menuRow] = await buildCaseRow(c, sum, opened, ctx, store, onChanged);
    tbody.appendChild(tr);
    tbody.appendChild(menuRow);
  }
  for (const th of table.querySelectorAll('th.sortable')) {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      setSort(sortState.key === key ? { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' });
      onChanged();
    });
  }
  wrap.appendChild(table);
  return wrap;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const opened = openedMap();
  const cases = (await store.listCases()).filter((c) => c.kind !== 'fun');
  const withSums = await Promise.all(cases.map(async (c) => ({ c, sum: await store.caseSummary(c.id) })));

  const view = getView();
  const sortState = getSort();
  const sortValue = ({ c, sum }, key) => {
    if (key === 'name') return c.name.toLowerCase();
    if (key === 'people') return sum.people.length;
    return opened[c.id] || Date.parse(c.updated_at) || 0;
  };
  withSums.sort((a, b) => {
    const av = sortValue(a, sortState.key), bv = sortValue(b, sortState.key);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortState.dir === 'asc' ? cmp : -cmp;
  });

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <div class="search-box" style="flex:1;min-width:220px">
          <span class="ic">⌕</span>
          <input type="search" id="all-search" placeholder="Search everything — people, evidence, quotes, in any case">
        </div>
        <div class="view-toggle" id="view-toggle">
          <button type="button" data-view="table" class="${view === 'table' ? 'on' : ''}">Table</button>
          <button type="button" data-view="cards" class="${view === 'cards' ? 'on' : ''}">Cards</button>
        </div>
        <button class="btn btn-primary" id="new-case-btn">+ New</button>
      </div>
      <div id="new-case-slot"></div>
      <div id="search-results"></div>
      <div id="cases-body"></div>
    </div>
  `;

  root.querySelector('#new-case-btn').addEventListener('click', () => {
    const slot = root.querySelector('#new-case-slot');
    if (slot.querySelector('.inline-form')) return;
    const form = inlineNameForm({
      placeholder: 'Who or what is this case about?',
      choices: CASE_KINDS,
      withFictional: true,
      onSubmit: async (name, kind, world) => {
        const kase = await createCaseOfKind(store, ctx, name, kind, world);
        markOpened(kase.id);
        if (kind === 'person') sessionStorage.setItem('c7-offer-lookup', '1'); // the new profile offers Look up
      },
    });
    slot.appendChild(form);
    wireCaseLookup(form, ctx, store);
  });

  for (const btn of root.querySelectorAll('#view-toggle button')) {
    btn.addEventListener('click', () => { setView(btn.dataset.view); render(root, ctx); });
  }

  const body = root.querySelector('#cases-body');
  if (!cases.length) {
    body.appendChild(emptyState({
      missing: 'No case files yet.',
      why: 'A case is about one person, a family, or a major event. Everything you attach — evidence, relations, contradictions — lives inside it.',
      action: '+ New case',
      onAction: () => root.querySelector('#new-case-btn').click(),
    }));
  } else if (view === 'table') {
    body.appendChild(await buildTable(withSums, opened, sortState, ctx, store, () => render(root, ctx)));
  } else {
    const grid = document.createElement('div');
    grid.className = 'case-grid';
    for (const { c, sum } of withSums) grid.appendChild(await buildCaseCard(c, sum, ctx, store, () => render(root, ctx)));
    body.appendChild(grid);
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
      body.style.display = q ? 'none' : '';
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
