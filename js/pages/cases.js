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

/** Go into a case: person-case → the person's profile; family (or several people) → family overview. */
export async function openCase(ctx, kase) {
  markOpened(kase.id);
  await ctx.setCaseId(kase.id);
  const people = await ctx.store.listPeople(kase.id);
  if (kase.kind === 'family' || (kase.kind !== 'person' && people.length > 1)) { ctx.navigate('#/family'); return; }
  let p = subjectOf(kase, people);
  if (!p) p = await ctx.store.createPerson({ case_id: kase.id, display_name: kase.name, kind: 'person' });
  ctx.navigate(`#/subject/${p.id}`);
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
        prog.textContent = 'Reading their works from Wikidata…';
        // duets / covers, dates before the career started, and compilations wait for the profile's picker, where they can be ticked
        const list = (await fetchWorks(m.id)).filter((w) => !w.shared && !w.suspect && !w.compilation);
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
        </div>
        <div class="menu-slot"></div>
      </div>
    `;
    // picture: the person's face, or up to three family faces
    const pic = card.querySelector('.pic');
    if (c.world) pic.innerHTML = `<span class="fic-ribbon">${c.world === 'Fictional' ? 'Fictional' : c.world}</span>`;
    const subject = subjectOf(c, sum.people);
    const faces = c.kind === 'family' ? sum.people.slice(0, 3) : (subject ? [subject] : []);
    if (!faces.length) pic.innerHTML += `<span class="initials">${initials(c.name)}</span>`;
    else if (faces.length === 1) pic.appendChild(await faceEl(faces[0], 64));
    else { pic.classList.add('multi'); for (const p of faces) pic.appendChild(await faceEl(p, 40)); }
    // badges only when there is something
    const badges = card.querySelector('.badges');
    if (sum.toReview) badges.innerHTML += `<span class="chip brass">${sum.toReview} to review</span>`;
    if (sum.inbox) badges.innerHTML += `<span class="chip">${sum.inbox} image${sum.inbox === 1 ? '' : 's'}</span>`;
    if (sum.questions) badges.innerHTML += `<span class="chip q-open" title="Open questions — tap to see them">${sum.questions} open</span>`;

    card.addEventListener('click', (e) => { if (e.target.closest('button, .menu-slot, .inline-form, .q-open')) return; openCase(ctx, c); });
    card.querySelector('.q-open')?.addEventListener('click', async () => { markOpened(c.id); await ctx.setCaseId(c.id); ctx.navigate('#/questions'); });
    card.querySelector('.import-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      markOpened(c.id); await ctx.setCaseId(c.id);
      const people = await store.listPeople(c.id);
      const subject = c.kind !== 'family' ? subjectOf(c, people) : null;
      ctx.navigate(subject ? `#/subject/${subject.id}/import` : '#/import');
    });
    card.querySelector('.menu-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const slot = card.querySelector('.menu-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      const dups = await store.findDuplicates(c.id);
      const flagged = dups.people.length ? `${dups.people.length} same-name ${dups.people.length === 1 ? 'person' : 'people'} (${dups.people.map((p) => p.name).join(', ')}) — not removed` : '';
      slot.innerHTML = `
        <div class="row wrap" style="gap:6px;margin-top:8px">
          <button class="btn btn-ghost btn-sm m-rename">Rename</button>
          <button class="btn btn-ghost btn-sm m-kind">${c.kind === 'family' ? 'Make it a person case' : 'Make it a family case'}</button>
          ${dups.total ? `<button class="btn btn-ghost btn-sm m-dups" style="color:var(--brass)">Clean up duplicates · ${dups.total}</button>` : ''}
          <button class="btn btn-ghost btn-sm m-delete" style="color:var(--text-3)">Delete case</button>
        </div>
        ${dups.total || flagged ? `<div class="mono" style="font-size:11px;color:var(--text-3);margin-top:6px">${[dups.claims.length ? `${dups.claims.length} claim${dups.claims.length === 1 ? '' : 's'}` : null, dups.evidenceCount ? `${dups.evidenceCount} evidence item${dups.evidenceCount === 1 ? '' : 's'} (same link)` : null, flagged || null].filter(Boolean).join(' · ')}</div>` : ''}`;
      twoTapConfirm(slot.querySelector('.m-delete'), {
        confirmLabel: 'Really delete this case?',
        onConfirm: async () => { await store.softDeleteCase(c.id); if (c.id === ctx.caseId) await ctx.setCaseId(null); render(root, ctx); },
      });
      if (dups.total) {
        twoTapConfirm(slot.querySelector('.m-dups'), {
          confirmLabel: `Really remove ${dups.total}?`,
          onConfirm: async () => { await store.removeDuplicates(c.id); render(root, ctx); },
        });
      }
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
