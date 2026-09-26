// People — everyone across every case; tap → their profile.
// Tiles since 2026-09-13 (synth22, same tile as Cases so the two pages
// match): a responsive grid — face · name · the three tokens (life path,
// animal, sign), the case they live in as a dim mono note when it isn't
// just their own name. No kind or count text on a tile. One list, sorted by
// name, the search box at the top of every page does the finding. Faces are
// decoded before the grid is shown, so they arrive with the page instead of
// popping in after it.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { tokensHtml } from '../lifemap.js';
import { twoTapConfirm, inlineNameForm, inlineNote, clearInlineNote, duplicateNameBlock } from '../ui.js';
import { markOpened } from './cases.js';
import { createCaseOfKind } from './dashboard.js';
import { searchPeople, fillFromWikidata } from '../lookup.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null; }
function birthYear(p) { return p.birth_date ? p.birth_date.slice(0, 4) : (p.birth_year_min ? String(p.birth_year_min) : null); }

// full-bleed, top-anchored crop (her ask, 2026-09-13: "the image is too
// small" — a 48px round face was lost in this same 96px band; the bolder
// of her two picked options fills the whole band with the person's own
// photo, cropped from the top so a portrait doesn't lose the head).
async function picSegEl(p) {
  const el = document.createElement('div');
  el.className = 'seg';
  el.innerHTML = `<span class="initials">${initials(p.display_name)}</span>`;
  const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
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

function goToPerson(ctx, p) { markOpened(p.case_id); ctx.setCaseId(p.case_id).then(() => ctx.navigate(`#/subject/${p.id}`)); }

// + Person (her ask, 2026-09-17): this page spans every case, so there is
// no "current case" to add into the way Relations' own "+ Person" has —
// reuses Cases' "+ New" pattern verbatim instead (same duplicate guard,
// same createCaseOfKind), landing on a fresh one-person case rather than
// asking her to pick or make one first. Always a real case now (her call,
// 2026-09-26: "every person should get the full treatment from now on") —
// this used to offer a case-less "No case yet" as a second, lighter door
// (her ask, 2026-09-21, for quick batch-tagging), but a case-less person's
// own tile here couldn't even be opened, only renamed or removed, which
// is what she hit trying to add a real subject the normal way. Existing
// case-less people are swept into their own case once by
// store.assignCasesToPlacelessPeople(), not by anything on this page.
function openAddPerson(slot, ctx) {
  const { store } = ctx;
  if (slot.querySelector('.inline-form')) return;
  const form = inlineNameForm({
    placeholder: 'Their name',
    onSubmit: async (name) => {
      const matches = store.findPeopleByName(null, name, 'person');
      if (matches.length) {
        duplicateNameBlock(form.querySelector('input'), matches, (p) => goToPerson(ctx, p));
        return;
      }
      const kase = await createCaseOfKind(store, ctx, name, 'person', null);
      markOpened(kase.id);
    },
  });
  wireAddPersonLookup(form, ctx, store);
  slot.appendChild(form);
}

/**
 * "Look up on Wikipedia" inside + Person (her ask, 2026-09-22: "how to add
 * someone from wikipedia directly to people" — until now that record fill
 * (dates, picture, Wikipedia evidence) only lived on Cases' own "+ New").
 * Same search, deliberately smaller than Cases' version: no kind switch
 * (always a person here) and no +family/+works — those pull relatives or a
 * discography INTO a case, and a fresh case here only ever has the one person.
 */
function wireAddPersonLookup(form, ctx, store) {
  const rowEl = form.querySelector('.row');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-ghost btn-sm if-wiki';
  btn.textContent = 'Look up on Wikipedia';
  btn.title = 'Find this person on Wikipedia and fill them in from the record — dates, picture, evidence come with it';
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
    if (!matches.length) { if (!btn.nextElementSibling?.classList.contains('inline-note')) inlineNote(btn, 'No match on Wikidata — likely a private person; Create makes them by name.'); return; }
    results.innerHTML = '<div class="section-label" style="margin-top:8px">Fill them in from a Wikipedia record</div>';
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${m.label}</div><div class="sub">${m.description || 'no description'} · ${m.id}</div></div><span class="chip brass">Create from this ▸</span>`;
      row.addEventListener('click', () => createFromWikidata(m));
      results.appendChild(row);
    }
  });

  async function createFromWikidata(m) {
    // do not allow duplicates — picking a Wikidata result is just as
    // deliberate a "this exact real person" moment as typing their name
    // by hand (her ask, 2026-09-11, widened cross-case)
    const dupes = store.findPeopleByName(null, m.label, 'person');
    if (dupes.length) { duplicateNameBlock(results, dupes, (p) => goToPerson(ctx, p)); return; }
    results.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)" id="ap-progress">Filling them in from Wikidata…</div>';
    const prog = results.querySelector('#ap-progress');
    const kase = await store.createCase({ name: m.label, kind: 'person' });
    markOpened(kase.id);
    await ctx.setCaseId(kase.id);
    const person = await store.createPerson({ case_id: kase.id, display_name: m.label, kind: 'person', wikidata_id: m.id, notes: `Wikidata https://www.wikidata.org/wiki/${m.id}` });
    try { await fillFromWikidata(store, kase.id, person.id, m.id); }
    catch (e) { prog.textContent = `They're added; the record could not be read (${e.message}). Look up again from their profile.`; }
    ctx.navigate(`#/subject/${person.id}`);
  }
}

// ---- duplicates, anywhere in the app (her ask, 2026-09-11: "lisa is
// duplicated but i dont know how to resolve it," then "the app should not
// allow any duplicates") --------------------------------------------------
// Two people with the same name — a double entry, not a judgement call.
// Grouped by normalised name + kind ACROSS EVERY CASE, not just within
// one: the same real person can turn up twice split across two different
// cases just as easily as twice in one (their own dedicated case, and
// again inside someone else's family case under the same name). The
// oldest is the keeper, every later one gets a merge chip, wherever it
// lives.

/** lower-cased name + kind -> { keepPerson } for every later duplicate, regardless of case. */
function findDuplicatePeople(people) {
  const groups = new Map();
  for (const p of people) {
    const name = (p.display_name || '').trim().toLowerCase();
    if (!name) continue;
    const key = `${name}::${p.kind || 'person'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const dupOf = new Map(); // person id -> { keepPerson }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const [keep, ...rest] = group;
    for (const dup of rest) dupOf.set(dup.id, { keepPerson: keep });
  }
  return dupOf;
}

// A same-name pair that's already recorded as related to each other (a
// father and son sharing a name, say) is almost certainly two distinct
// people, not a double entry — the same real person merged under two rows
// would never carry a relationship to themselves. Adversarial review
// caught this before ship (2026-09-11): merging such a pair silently
// deletes that relationship (mergePerson collapses a->keep, b->keep into a
// self-link and drops it) with no warning that names it. Rather than touch
// the shared merge primitive, a related pair is simply never offered the
// one-tap merge here.
async function hasDirectRelationship(store, aId, bId) {
  const rels = await store.listRelationshipsForPerson(aId);
  return rels.some((r) => r.a_id === bId || r.b_id === bId);
}

/** The merge chip — same look as the Cases page's "Possible duplicate" flag
 * — plus a quieter "Not the same person" beside it, set off by a divider
 * so the two opposite-verdict actions don't invite a mistap: real
 * namesakes exist (a grandfather and grandson can share a name), and
 * dismissing one pair that way can't be undone anywhere in the app, so it
 * gets the same two-tap weight as the merge next to it, not a lighter one.
 * A pair can now span two different cases — say so instead of assuming
 * "this case" when it does. */
function dupFlagHtml(p, dupInfo) {
  const when = fmtDate(dupInfo.keepPerson.created_at);
  const crossCase = p.case_id !== dupInfo.keepPerson.case_id;
  const where = crossCase && dupInfo.keepPerson.case_name ? ` in “${esc(dupInfo.keepPerson.case_name)}”` : ' in this case';
  // "not the same person" is recorded against a case (distinct_pair.case_id
  // is NOT NULL) — with both sides placeless there's no case to hang it on,
  // so that option drops out; merging (which doesn't need one) still shows
  const canFlagDistinct = p.case_id || dupInfo.keepPerson.case_id;
  return `<button type="button" class="chip brass dup-flag" style="border:0;cursor:pointer" title="Merges this entry into the other ${esc(dupInfo.keepPerson.display_name)}${when ? ` (added ${when})` : ''}${where} — every relation, event and evidence link moves over, and this one is removed">Possible duplicate →</button>
    ${canFlagDistinct ? `<button type="button" class="btn btn-ghost btn-sm not-dup" style="border-left:1px solid var(--line);margin-left:2px;padding-left:10px" title="Marks these two as different people, for good — this stops asking about this pair and can't be undone">Not the same person</button>` : ''}`;
}
function wireDupFlag(row, p, dupInfo, store, onChanged) {
  const btn = row.querySelector('.dup-flag');
  if (!btn || !dupInfo) return;
  // Birth years, when known, on the confirm step itself — visible on tap,
  // unlike the chip's hover-only title — so a genuine mismatch (two
  // different Lisas) is catchable before the merge, not after.
  const dupYear = birthYear(p), keepYear = birthYear(dupInfo.keepPerson);
  const years = [dupYear ? `this: b.${dupYear}` : null, keepYear ? `keeping: b.${keepYear}` : null].filter(Boolean).join(' · ');
  const crossCase = p.case_id !== dupInfo.keepPerson.case_id;
  const where = crossCase && dupInfo.keepPerson.case_name ? `, in “${dupInfo.keepPerson.case_name}”` : '';
  twoTapConfirm(btn, {
    confirmLabel: `Merge into the other ${dupInfo.keepPerson.display_name}${where}?${years ? ` (${years})` : ''}`,
    onConfirm: async () => { await store.mergePerson(dupInfo.keepPerson.id, p.id); onChanged(); },
  });
  const notDupBtn = row.querySelector('.not-dup');
  if (notDupBtn) {
    twoTapConfirm(notDupBtn, {
      confirmLabel: 'Sure — different people, stop asking?',
      onConfirm: async () => { await store.markPeopleDistinct(p.case_id || dupInfo.keepPerson.case_id, p.id, dupInfo.keepPerson.id); onChanged(); },
    });
  }
}

// A placeless person (case_id IS NULL — "no case yet") has no profile to
// open, so a tap opens a small rename/remove editor in place instead of
// navigating; picking them into a case happens from that case's own +
// Add person, not from here.
function wirePlacelessEditor(row, p, ctx, onChanged) {
  const { store } = ctx;
  const slot = row.querySelector('.placeless-edit');
  row.addEventListener('click', (e) => {
    if (e.target.closest('button, .inline-form')) return;
    if (slot.children.length) { slot.innerHTML = ''; return; }
    const form = inlineNameForm({
      label: 'Rename',
      value: p.display_name,
      submitLabel: 'Save',
      onSubmit: async (name) => { await store.updatePerson(p.id, { display_name: name }); onChanged(); },
      onCancel: () => { slot.innerHTML = ''; },
    });
    slot.appendChild(form);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-sm';
    delBtn.style.cssText = 'margin-top:6px;color:var(--red)';
    delBtn.textContent = 'Remove';
    slot.appendChild(delBtn);
    twoTapConfirm(delBtn, {
      confirmLabel: 'Remove them — sure?',
      onConfirm: async () => { await store.softDeletePerson(p.id); onChanged(); },
    });
  });
}

/** One tile: face band · name (· case, when it says something) · tokens · merge flag. */
async function buildPicRow(p, ctx, dupInfo, onChanged) {
  const { store } = ctx;
  const row = document.createElement('div');
  row.className = 'tile';
  const placeless = !p.case_id;
  const sameName = (p.case_name || '').trim().toLowerCase() === (p.display_name || '').trim().toLowerCase();
  row.innerHTML = `
    <div class="pic"></div>
    <div class="main">
      <div class="line"><div class="title">${esc(p.display_name)}</div></div>
      ${placeless ? `<div class="line"><span class="where" title="Not part of a case yet — pick them from Family, an Event or a Series' + Add person">No case yet</span></div>`
        : (!sameName && p.case_name ? `<div class="line"><span class="where" title="The case this person lives in">${esc(p.case_name)}</span></div>` : '')}
      <div class="line"><div class="lm-tokens">${tokensHtml(p, { compact: true })}</div></div>
      ${dupInfo ? `<div class="line foot"><div class="badges">${dupFlagHtml(p, dupInfo)}</div></div>` : ''}
      ${placeless ? `<div class="placeless-edit"></div>` : ''}
    </div>`;
  row.querySelector('.pic').appendChild(await picSegEl(p));
  if (placeless) {
    wirePlacelessEditor(row, p, ctx, onChanged);
  } else {
    row.addEventListener('click', (e) => { if (e.target.closest('button')) return; goToPerson(ctx, p); });
  }
  wireDupFlag(row, p, dupInfo, store, onChanged);
  return row;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:11px;color:var(--text-3)">${people.length} ${people.length === 1 ? 'person' : 'people'} · every case</span>
        <div class="row" style="gap:8px">
          <a class="btn btn-ghost btn-sm" href="#/compare">Compare artists →</a>
          <button class="btn btn-primary btn-sm" id="new-person-btn">+ Person</button>
        </div>
      </div>
      <div id="new-person-slot"></div>
      <div id="people-body"></div>
    </div>
  `;

  root.querySelector('#new-person-btn').addEventListener('click', () => openAddPerson(root.querySelector('#new-person-slot'), ctx));

  const body = root.querySelector('#people-body');
  if (!people.length) {
    body.appendChild(emptyState({ missing: 'No people yet.', why: 'Create a case about a person and they appear here.', action: '+ Person', onAction: () => openAddPerson(root.querySelector('#new-person-slot'), ctx) }));
    return;
  }
  const dupOf = findDuplicatePeople(people);
  await Promise.all([...dupOf.entries()].map(async ([dupId, info]) => {
    if (await hasDirectRelationship(store, dupId, info.keepPerson.id)) { dupOf.delete(dupId); return; }
    if (store.arePeopleMarkedDistinct(dupId, info.keepPerson.id)) dupOf.delete(dupId);
  }));
  const onChanged = () => render(root, ctx);
  const shown = [...people].sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', undefined, { sensitivity: 'base' }));
  // every tile is built (faces decoded) before any of them is shown
  const list = document.createElement('div');
  list.className = 'tile-grid';
  const rows = await Promise.all(shown.map((p) => buildPicRow(p, ctx, dupOf.get(p.id), onChanged)));
  for (const r of rows) list.appendChild(r);
  body.appendChild(list);
}
