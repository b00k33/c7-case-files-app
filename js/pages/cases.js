// Cases — the home screen (her redesign, 2026-09-02, 28 answers). The list
// IS the home: most recently opened first, tap to go straight in (a
// person-case opens the person's profile; a family-case its overview).
// Picture rows since 2026-09-08 (her Q15 of 2026-09-07): one row per case —
// face · name · the three tokens of the person it is about (life path,
// animal, sign); attention chips stay ("N to review →", "N open", images,
// possible duplicate); Import and ⋯ stay; no kind or count text. One layout
// for the phone and the desktop — the Table/Cards toggle of v62 is gone.
import { emptyState } from '../indicators.js';
import { inlineNameForm, twoTapConfirm, inlineNote, clearInlineNote } from '../ui.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { tokensHtml } from '../lifemap.js';
import { CASE_KINDS, createCaseOfKind } from './dashboard.js';
import { searchPeople, fillFromWikidata, insertFamily } from '../lookup.js';
import { fetchWorks, addWorks } from '../works.js';

const OPENED_KEY = 'c7-case-opened'; // { caseId: timestamp } — per device, that's fine

// the "⋯" menu's kind-switcher offers the two kinds a case ISN'T, each one
// click away — a cycle button hid "event" a click deep behind "family" for
// any case starting as a person (2026-09-04, her screenshot)
const KIND_LABEL = { person: 'a person case', family: 'a family case', event: 'an event case' };
const otherKinds = (kind) => Object.keys(KIND_LABEL).filter((k) => k !== (KIND_LABEL[kind] ? kind : 'person'));

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

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

/** Straight to what's waiting: a person-case's queue opens as the Review tab on the person, so she stays in their file. */
export async function openReview(ctx, kase, sum) {
  markOpened(kase.id);
  await ctx.setCaseId(kase.id);
  const p = kase.kind === 'person' ? subjectOf(kase, sum ? sum.people : await ctx.store.listPeople(kase.id)) : null;
  ctx.navigate(p ? `#/subject/${p.id}/review` : '#/review');
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
  // decoded before it is shown — the row arrives with its face, no pop-in (2026-09-07)
  if (src && await preloadImage(src)) {
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    const initialsEl = el.querySelector('.initials');
    if (img.complete && img.naturalWidth) initialsEl?.remove();
    else img.addEventListener('load', () => initialsEl?.remove());
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

/**
 * The ⋯ menu — rename, kind-switch, duplicates, delete — one implementation
 * for the row (it used to serve a card and a table row too).
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
        <button class="btn btn-ghost btn-sm m-fiction">${c.world ? 'Edit the world' : 'Mark as fiction'}</button>
        ${c.world ? '<button class="btn btn-ghost btn-sm m-real">Mark as real</button>' : ''}
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
    // fiction after the fact (2026-09-08, "where can i save him as fiction?").
    // The tick box in "+ New" was the only way in, and case_file.world was
    // written at creation and never again — so a case made as real research
    // could never become a made-up world. It sits beside the kind switches
    // because it answers the same question: what IS this case?
    slot.querySelector('.m-fiction').addEventListener('click', () => {
      slot.innerHTML = '';
      slot.appendChild(inlineNameForm({
        label: 'Which made-up world is this? Leave it as Fictional if the world has no name.',
        value: c.world || 'Fictional',
        placeholder: 'World, e.g. Harry Potter',
        submitLabel: 'Save',
        onSubmit: async (world) => { await store.updateCase(c.id, { world }); onChanged(); },
      }));
    });
    slot.querySelector('.m-real')?.addEventListener('click', async () => {
      await store.updateCase(c.id, { world: null });
      onChanged();
    });
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

/**
 * Same-named person-cases, cross-case (her screenshot, 2026-09-06: two
 * "Michael Jackson" cases side by side) — the per-case "Clean up
 * duplicates" menu only ever looked inside its own case, so it could never
 * see this. Grouped by the subject's name (or the case's own name, for a
 * case with no people yet); the oldest case is the keeper, every later one
 * gets a "Possible duplicate of …" flag whose tap merges it in.
 */
function findDuplicateCases(withSums) {
  const groups = new Map(); // lower-cased subject name -> [{ c, sum, subject }]
  for (const item of withSums) {
    if (item.c.kind !== 'person') continue;
    const subject = subjectOf(item.c, item.sum.people);
    const name = (subject?.display_name || item.c.name).trim().toLowerCase();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ ...item, subject });
  }
  const dupOf = new Map(); // caseId -> { keepCase, keepPersonId, dupPersonId }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.c.created_at || '') < (b.c.created_at || '') ? -1 : 1);
    const [keep, ...rest] = group;
    for (const dup of rest) {
      dupOf.set(dup.c.id, { keepCase: keep.c, keepPersonId: keep.subject?.id || null, dupPersonId: dup.subject?.id || null });
    }
  }
  return dupOf;
}

/** The "possible duplicate" badge — merges on a two-tap confirm. */
function dupFlagHtml(dupInfo) {
  return `<button type="button" class="chip brass dup-flag" style="border:0;cursor:pointer" title="Merges everything on this case into ${esc(dupInfo.keepCase.name)} and removes this one">Possible duplicate of ${esc(dupInfo.keepCase.name)} →</button>`;
}
function wireDupFlag(el, dupCaseId, dupInfo, store, onChanged) {
  const btn = el.querySelector('.dup-flag');
  if (!btn || !dupInfo) return;
  twoTapConfirm(btn, {
    confirmLabel: `Merge into ${dupInfo.keepCase.name}?`,
    onConfirm: async () => { await store.mergeCase(dupInfo.keepCase.id, dupCaseId, dupInfo.keepPersonId, dupInfo.dupPersonId); onChanged(); },
  });
}

/**
 * One picture row: the face (a person's, up to three of a family's, or the
 * violet Event mark) · the name · the subject's three tokens · attention
 * chips · Import · ⋯. The row itself opens the case; every chip that counts
 * something opens the things it counts.
 */
async function buildPicRow(c, sum, ctx, store, onChanged, dupInfo) {
  const row = document.createElement('div');
  row.className = 'pic-row';
  const subject = c.kind === 'event' ? null : subjectOf(c, sum.people);
  const tokens = c.kind === 'person' && subject ? tokensHtml(subject, { compact: true }) : '';
  row.innerHTML = `
    <div class="pic"></div>
    <div class="main">
      <div class="line">
        <div class="title">${esc(c.name)}</div>
        ${c.world ? `<span class="world" title="Not a real-world case">${esc(c.world === 'Fictional' ? 'Fictional' : c.world)}</span>` : ''}
        <div class="actions"><button class="btn btn-ghost btn-sm import-btn">Import</button><button class="btn btn-ghost btn-sm menu-btn" title="Rename · change kind · delete">⋯</button></div>
      </div>
      <div class="line">
        <div class="lm-tokens">${tokens}</div>
        <div class="badges"></div>
      </div>
      <div class="menu-slot"></div>
    </div>
  `;
  // picture: the person's face, up to three family faces, or the violet Event mark
  const pic = row.querySelector('.pic');
  const markEl = (name) => { const el = document.createElement('div'); el.className = 'face'; el.style.width = el.style.height = '48px'; el.innerHTML = `<span class="initials">${initials(name)}</span>`; return el; };
  if (c.kind === 'event') {
    pic.classList.add('event');
    pic.appendChild(markEl(c.name));
  } else {
    const faces = c.kind === 'family' ? sum.people.slice(0, 3) : (subject ? [subject] : []);
    if (!faces.length) pic.appendChild(markEl(c.name));
    else if (faces.length === 1) pic.appendChild(await faceEl(faces[0], 48));
    else { pic.classList.add('multi'); for (const p of faces) pic.appendChild(await faceEl(p, 40)); }
  }
  // attention chips only when there is something — each one a door
  const badges = row.querySelector('.badges');
  if (sum.toReview) badges.innerHTML += `<span class="chip brass rv-open" title="Tap to review them">${sum.toReview} to review →</span>`;
  if (sum.inbox) badges.innerHTML += `<span class="chip inbox-open" title="Images waiting for a title and a person — tap to sort them">${sum.inbox} image${sum.inbox === 1 ? '' : 's'} →</span>`;
  if (sum.questions) badges.innerHTML += `<span class="chip q-open" title="Open questions — tap to see them">${sum.questions} open</span>`;
  if (dupInfo) badges.innerHTML += dupFlagHtml(dupInfo);

  row.addEventListener('click', (e) => { if (e.target.closest('button, .menu-slot, .inline-form, .q-open, .rv-open, .inbox-open')) return; openCase(ctx, c); });
  row.querySelector('.q-open')?.addEventListener('click', async () => { markOpened(c.id); await ctx.setCaseId(c.id); ctx.navigate('#/questions'); });
  row.querySelector('.rv-open')?.addEventListener('click', () => openReview(ctx, c, sum));
  row.querySelector('.inbox-open')?.addEventListener('click', async () => { markOpened(c.id); await ctx.setCaseId(c.id); ctx.navigate('#/inbox'); });
  wireImportBtn(row.querySelector('.import-btn'), c, ctx, store);
  wireCaseMenu(row.querySelector('.menu-btn'), row.querySelector('.menu-slot'), c, ctx, store, onChanged);
  wireDupFlag(row, c.id, dupInfo, store, onChanged);
  return row;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const opened = openedMap();
  const cases = (await store.listCases()).filter((c) => c.kind !== 'fun');
  const withSums = await Promise.all(cases.map(async (c) => ({ c, sum: await store.caseSummary(c.id) })));
  const dupOf = findDuplicateCases(withSums);
  // most recently opened first — the one she was just in is at the top
  const lastOpened = (c) => opened[c.id] || Date.parse(c.updated_at) || 0;
  withSums.sort((a, b) => lastOpened(b.c) - lastOpened(a.c));

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:12px;color:var(--text-3);flex:1;min-width:120px">${cases.length} case${cases.length === 1 ? '' : 's'}</span>
        <button class="btn btn-primary" id="new-case-btn">+ New</button>
      </div>
      <div id="new-case-slot"></div>
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

  const body = root.querySelector('#cases-body');
  if (!cases.length) {
    body.appendChild(emptyState({
      missing: 'No case files yet.',
      why: 'A case is about one person, a family, or a major event. Everything you attach — evidence, relations, contradictions — lives inside it.',
      action: '+ New case',
      onAction: () => root.querySelector('#new-case-btn').click(),
    }));
    return;
  }
  // every row is built (faces decoded) before any of them is shown
  const list = document.createElement('div');
  list.className = 'pic-list';
  const onChanged = () => render(root, ctx);
  const rows = await Promise.all(withSums.map(({ c, sum }) => buildPicRow(c, sum, ctx, store, onChanged, dupOf.get(c.id))));
  for (const r of rows) list.appendChild(r);
  body.appendChild(list);

  // (the page's own "Search everything" box left on 2026-09-07 — the one
  // search box at the top of every page, in main.js, replaced it)
}
