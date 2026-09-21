// Series case workspace — a novel or film series isn't a person, a family,
// or a single major event: it's a franchise with a cast and a run of dated
// installments (her ask, 2026-09-21, on "A Series of Unfortunate Events":
// "i need a category for novel/film series" — genuinely new kind, cast AND
// a timeline of installments together). Adapted from event.js, which faced
// the same "not a person" shape first (2026-09-04) — same case-level
// storage (person_id null on every installment event), same tab strip.
//
// Era isn't set by hand here (event.js's manual era-start/era-end fields):
// a series' span is exactly its installments' own dates, so it's read off
// them instead — one less thing to keep in sync, and it can't go stale.
//
// Installments come from Wikidata, not typed in one at a time (her call,
// 2026-09-21: "i want only auto pulling" — no manual-first phase). "+ Check
// Wikidata" re-runs the same pull works.js's addWorks already established
// for a person's own works: existing installments (by Wikidata item) are
// left alone, so running it again only adds what's new — the record for a
// franchise still in progress, without her doing anything by hand.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';
import { inlineNote, clearInlineNote, twoTapConfirm, renderUnplacedPicker } from '../ui.js';
import { fetchInstallments, addInstallments } from '../works.js';
import { searchPeople, fetchCast, addPeopleFromWikidata } from '../lookup.js';

const TABS = [
  ['overview', 'Overview'], ['evidence', 'Evidence'], ['contradictions', 'Contradictions'],
  ['questions', 'Questions'], ['board', 'Board'],
];
const TAB_MODULES = {
  evidence: () => import('./evidence.js'), contradictions: () => import('./contradictions.js'),
  questions: () => import('./questions.js'), board: () => import('./board.js'),
};

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function initials(name) { return String(name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

/** "1999-09-16", "1999-08" or "1999" (typed loosely, kept honest) → date fields at the precision she actually gave. */
function parseDateInput(raw) {
  const d = String(raw || '').trim();
  if (!d) return { date: null, date_precision: 'unknown', date_year_min: null, date_year_max: null };
  let m;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return { date: d, date_precision: 'day', date_year_min: null, date_year_max: null };
  if ((m = d.match(/^(\d{4})-(\d{2})$/))) return { date: `${d}-01`, date_precision: 'month', date_year_min: null, date_year_max: null };
  if ((m = d.match(/^(\d{4})$/))) return { date: null, date_precision: 'year', date_year_min: +m[1], date_year_max: +m[1] };
  if ((m = d.match(/^(\d{4})\s*[–-]\s*(\d{4})$/))) return { date: null, date_precision: 'range', date_year_min: +m[1], date_year_max: +m[2] };
  return null; // unrecognised — the form refuses rather than guessing
}
function fmtDate(e) {
  if (e.date_precision === 'range' && e.date_year_min) return e.date_year_max && e.date_year_max !== e.date_year_min ? `${e.date_year_min}–${e.date_year_max}` : String(e.date_year_min);
  if (e.date_precision === 'year' && e.date_year_min) return String(e.date_year_min);
  if (!e.date) return '—';
  const dt = new Date(`${e.date}T00:00:00`);
  return e.date_precision === 'month' ? dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function sortKey(e) { return e.date || (e.date_year_min ? `${e.date_year_min}-01-01` : '9999-99-99'); }
function yearOf(e) { return e.date ? +e.date.slice(0, 4) : (e.date_year_min || null); }

export async function render(root, ctx, tab = 'overview') {
  const { store } = ctx;
  if (!TABS.some(([k]) => k === tab)) tab = 'overview';

  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  const kase = await store.getCase(ctx.caseId);
  if (!kase) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'This case could not be found.', why: 'It may have been deleted.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  ctx.setTitle(kase.name);

  const events = (await store.listEventsForCase(kase.id)).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const years = events.map(yearOf).filter(Boolean);
  const era = years.length ? (Math.min(...years) === Math.max(...years) ? String(Math.min(...years)) : `${Math.min(...years)} – ${Math.max(...years)}`) : null;

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="event-head">
          <div class="mono event-era" style="font-size:12px">${era ? `<span style="color:var(--teal)">${era}</span>` : 'No dated installments yet'}</div>
          <span class="event-badge series">Series</span>
        </div>
        ${kase.wikidata_id ? `<div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="recheck-btn">Check Wikidata for new installments</button></div>` : `
        <div class="row wrap" style="gap:8px;margin-top:8px;align-items:center">
          <input type="text" id="link-wiki-input" placeholder="Find this series on Wikipedia" value="${esc(kase.name)}" style="flex:1 1 200px;min-width:0">
          <button class="btn btn-ghost btn-sm" id="link-wiki-btn">Search Wikipedia</button>
        </div>
        <div id="link-wiki-results"></div>`}
      </div>

      <div class="tab-strip" id="tab-strip">${TABS.map(([k, l]) => `<a href="#/series${k === 'overview' ? '' : '/' + k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>

      ${tab === 'overview' ? `
      <div class="panel">
        <div class="row between" style="margin-bottom:4px">
          <div class="panel-title" style="margin:0">Cast</div>
          <div class="row" style="gap:8px">
            ${kase.wikidata_id ? `<button class="btn btn-ghost btn-sm" id="add-cast-wiki-btn">+ Cast from Wikidata</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="add-figure-btn">+ Add person</button>
          </div>
        </div>
        <div class="faces-row" id="figures-row"></div>
        <div id="figure-form-slot"></div>
      </div>

      <div class="panel">
        <div class="row between" style="margin-bottom:4px"><div class="panel-title" style="margin:0">Installments</div><button class="btn btn-ghost btn-sm" id="add-entry-btn">+ Add installment</button></div>
        <div id="entry-form-slot"></div>
        <div class="stack" id="timeline-list" style="gap:12px;margin-top:8px"></div>
      </div>
      ` : `<div id="tab-body"></div>`}
    </div>
  `;

  root.querySelector('#recheck-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    clearInlineNote(btn);
    btn.disabled = true; btn.textContent = 'Reading the installments from Wikidata…';
    try {
      const list = await fetchInstallments(kase.wikidata_id, (msg) => { btn.textContent = `Reading the installments from Wikidata — ${msg}`; });
      const r = await addInstallments(store, kase.id, list, (msg) => { btn.textContent = `Adding installments… ${msg}`; });
      if (r.added) { render(root, ctx, tab); return; }
      btn.disabled = false; btn.textContent = 'Check Wikidata for new installments';
      inlineNote(btn, `Nothing new — ${r.skipped} already on file.`);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Check Wikidata for new installments';
      inlineNote(btn, `Couldn't reach Wikidata — ${err.message}. Are you online?`);
    }
  });

  // A series case made without "Find on Wikipedia" at creation (typed name,
  // kind picked by hand) has no wikidata_id, so the auto-pull above has
  // nothing to run against — her ask, 2026-09-21: "how can i search wiki
  // for these details of this tv series" for a case already sitting there.
  // Search + pick links it after the fact, same searchPeople() Wikidata
  // lookup the "+ New case" form already uses, then runs the same
  // installments pull immediately.
  root.querySelector('#link-wiki-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const input = root.querySelector('#link-wiki-input');
    const results = root.querySelector('#link-wiki-results');
    const name = input.value.trim();
    clearInlineNote(btn);
    results.innerHTML = '';
    if (!name) { inlineNote(btn, 'Type the series name first.'); input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(name); }
    catch (err) { inlineNote(btn, `Couldn't reach Wikidata — ${err.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = 'Search Wikipedia';
    if (!matches.length) { inlineNote(btn, 'No match on Wikidata for that name.'); return; }
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${esc(m.label)}</div><div class="sub">${esc(m.description || 'no description')} · ${m.id}</div></div><span class="chip brass">Link and pull installments ▸</span>`;
      row.addEventListener('click', async () => {
        results.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)">Linking and reading the installments from Wikidata…</div>';
        const prog = results.querySelector('.inline-note');
        await store.updateCase(kase.id, { wikidata_id: m.id });
        try {
          const list = await fetchInstallments(m.id, (msg) => { prog.textContent = `Reading the installments from Wikidata — ${msg}`; });
          const r = await addInstallments(store, kase.id, list, (msg) => { prog.textContent = `Adding installments… ${msg}`; });
          sessionStorage.setItem('c7-pi-result', `${r.added} installment${r.added === 1 ? '' : 's'} added from Wikidata${r.undated ? ` (${r.undated} without a date)` : ''}.`);
        } catch (err) { /* linked either way — the recheck button now shows since wikidata_id is set, she can try again from there */ }
        render(root, ctx, tab);
      });
      results.appendChild(row);
    }
  });

  if (tab !== 'overview') {
    const mod = await TAB_MODULES[tab]();
    return mod.render(root.querySelector('#tab-body'), ctx);
  }

  // --- cast ---------------------------------------------------------
  const people = await store.listPeople(kase.id);
  const figuresRow = root.querySelector('#figures-row');
  if (!people.length) figuresRow.appendChild(emptyState({ missing: 'No cast yet.', why: 'Add the characters or real people this series is about — each gets a full profile.' }));
  for (const p of people) {
    const f = document.createElement('div');
    f.className = 'face-card';
    f.innerHTML = `<div class="face" style="width:56px;height:56px"><span class="initials">${initials(p.display_name)}</span></div><div class="name">${esc(p.display_name)}</div>`;
    f.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
    figuresRow.appendChild(f);
    const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
    if (src) {
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      img.addEventListener('load', () => f.querySelector('.initials')?.remove());
      img.addEventListener('error', () => img.remove());
      f.querySelector('.face').appendChild(img);
    }
  }
  root.querySelector('#add-figure-btn').addEventListener('click', () => {
    const slot = root.querySelector('#figure-form-slot');
    if (slot.children.length) { slot.innerHTML = ''; return; }
    // picked, not typed (her ask, 2026-09-21): cast comes from the People
    // tab's own pool of people with nowhere else yet
    renderUnplacedPicker(slot, ctx, { onPicked: () => render(root, ctx, tab) });
  });

  // the whole billed cast in one go (her ask, 2026-09-21: "how to add cast
  // from wikipedia" — the same "no manual-first phase" preference as
  // installments above). Each actor gets a full profile the same way
  // addPeopleFromWikidata already fills one for the family/case pages —
  // real dates, photo, Wikipedia citation — not just a bare name.
  root.querySelector('#add-cast-wiki-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    clearInlineNote(btn);
    btn.disabled = true; btn.textContent = 'Reading the cast from Wikidata…';
    try {
      const cast = await fetchCast(kase.wikidata_id);
      const existingQids = new Set(people.map((p) => p.wikidata_id).filter(Boolean));
      const picks = cast.filter((c) => !existingQids.has(c.qid)).map((c) => ({ qid: c.qid, label: c.label }));
      if (!picks.length) {
        btn.disabled = false; btn.textContent = '+ Cast from Wikidata';
        inlineNote(btn, cast.length ? 'Nothing new — everyone billed is already in the cast.' : 'Wikidata lists no cast for this one.');
        return;
      }
      const r = await addPeopleFromWikidata(store, kase.id, picks, (msg) => { btn.textContent = msg; });
      render(root, ctx, tab);
      sessionStorage.setItem('c7-pi-result', `${r.created.length} cast member${r.created.length === 1 ? '' : 's'} added from Wikidata${r.failed.length ? ` (${r.failed.length} couldn't be read)` : ''}.`);
    } catch (err) {
      btn.disabled = false; btn.textContent = '+ Cast from Wikidata';
      inlineNote(btn, `Couldn't reach Wikidata — ${err.message}. Are you online?`);
    }
  });

  // --- installments --------------------------------------------------------
  const byId = new Map(people.map((p) => [p.id, p]));
  const listEl = root.querySelector('#timeline-list');
  if (!events.length) {
    listEl.appendChild(emptyState({ missing: 'No installments yet.', why: kase.wikidata_id ? 'Check Wikidata above, or add one by hand.' : 'Add each book or film, its date, and who was in it.' }));
  }
  for (const e of events) {
    const withPeople = String(e.with_ids || '').split(',').filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
    const row = document.createElement('div');
    row.className = 'card tl-entry';
    row.innerHTML = `
      <div class="row between" style="align-items:flex-start">
        <div>
          <div class="mono tl-date" style="font-size:11px">${fmtDate(e)}</div>
          <div style="margin-top:2px">${esc(e.title)}</div>
          <div class="row wrap" style="gap:6px;margin-top:6px">
            ${e.place ? `<span class="chip">${esc(e.place)}</span>` : ''}
            ${withPeople.map((p) => `<span class="chip">${esc(p.display_name)}</span>`).join('')}
          </div>
          ${e.notes ? `<p style="margin-top:6px;color:var(--text-3);font-size:12px">${esc(e.notes)}</p>` : ''}
        </div>
        <div class="row" style="gap:4px;flex:none">
          <button class="btn btn-ghost btn-sm entry-edit" title="Edit">✎</button>
          <button class="btn btn-ghost btn-sm entry-delete" title="Delete">✕</button>
        </div>
      </div>
      <div class="entry-edit-slot"></div>
    `;
    row.querySelector('.entry-delete').addEventListener('click', (ev) => {
      twoTapConfirm(ev.currentTarget, {
        confirmLabel: 'Really?',
        onConfirm: async () => { await store.deleteEvent(e.id); render(root, ctx, tab); },
      });
    });
    row.querySelector('.entry-edit').addEventListener('click', () => {
      const slot = row.querySelector('.entry-edit-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      slot.appendChild(entryForm(store, ctx, kase, people, e, () => render(root, ctx, tab)));
    });
    listEl.appendChild(row);
  }
  root.querySelector('#add-entry-btn').addEventListener('click', () => {
    const slot = root.querySelector('#entry-form-slot');
    if (slot.children.length) { slot.innerHTML = ''; return; }
    slot.appendChild(entryForm(store, ctx, kase, people, null, () => render(root, ctx, tab)));
  });
}

/** The add/edit form for one installment — title, a loosely-typed date, place, notes, and who was in it. */
function entryForm(store, ctx, kase, people, existing, onDone) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-form';
  wrap.style.marginTop = '8px';
  const dateStr = existing ? (
    existing.date_precision === 'month' && existing.date ? existing.date.slice(0, 7)
      : existing.date_precision === 'range' && existing.date_year_min ? (existing.date_year_max && existing.date_year_max !== existing.date_year_min ? `${existing.date_year_min}-${existing.date_year_max}` : String(existing.date_year_min))
      : existing.date_precision === 'year' && existing.date_year_min ? String(existing.date_year_min)
      : existing.date || ''
  ) : '';
  const withIds = new Set(String(existing?.with_ids || '').split(',').filter(Boolean));
  wrap.innerHTML = `
    <div class="row wrap" style="gap:8px">
      <input type="text" class="ef-title" placeholder="Title" value="${esc(existing?.title || '')}" style="flex:1 1 220px;min-width:0">
      <input type="text" class="ef-date" placeholder="1999-09-16, 1999-08 or 1999" value="${esc(dateStr)}" style="width:170px">
      <input type="text" class="ef-place" placeholder="Setting" value="${esc(existing?.place || '')}" style="width:140px">
    </div>
    <textarea class="ef-notes" placeholder="Notes" style="margin-top:8px;min-height:44px;font-size:12px">${esc(existing?.notes || '')}</textarea>
    ${people.length ? `<div class="row wrap" style="gap:10px;margin-top:8px">${people.map((p) => `
      <label class="row" style="gap:4px;font-size:12px;color:var(--text-2);align-items:center">
        <input type="checkbox" class="ef-with" value="${p.id}"${withIds.has(p.id) ? ' checked' : ''}> ${esc(p.display_name)}
      </label>`).join('')}</div>` : ''}
    <div class="row" style="gap:8px;margin-top:10px">
      <button type="button" class="btn btn-primary btn-sm ef-save">${existing ? 'Save' : 'Add'}</button>
      <button type="button" class="btn btn-ghost btn-sm ef-cancel">Cancel</button>
    </div>
  `;
  const titleEl = wrap.querySelector('.ef-title');
  const dateEl = wrap.querySelector('.ef-date');
  const saveBtn = wrap.querySelector('.ef-save');
  wrap.querySelector('.ef-cancel').addEventListener('click', () => wrap.remove());
  saveBtn.addEventListener('click', async () => {
    clearInlineNote(saveBtn);
    const title = titleEl.value.trim();
    if (!title) { inlineNote(saveBtn, 'Give it a title first.'); titleEl.focus(); return; }
    const parsed = parseDateInput(dateEl.value);
    if (parsed === null) { inlineNote(saveBtn, 'Date not recognised — try 1999-09-16, 1999-08, 1999 or 1999-2006.'); dateEl.focus(); return; }
    const withIdsNew = [...wrap.querySelectorAll('.ef-with:checked')].map((c) => c.value);
    const patch = {
      title, place: wrap.querySelector('.ef-place').value.trim() || null,
      notes: wrap.querySelector('.ef-notes').value.trim() || null,
      with_ids: withIdsNew.join(',') || null,
      ...parsed,
    };
    if (existing) await store.updateEvent(existing.id, patch);
    else await store.createEvent({ case_id: kase.id, kind: 'installment', ...patch });
    wrap.remove();
    onDone();
  });
  queueMicrotask(() => titleEl.focus());
  return wrap;
}
