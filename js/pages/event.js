// Event case workspace — a major event isn't a person or a family, so it
// doesn't open on a birth/death profile or a household tree. It opens on
// an era, the key figures who mattered, and a chronological timeline of
// what happened (her call, 2026-09-04: "i added world war 1. it is
// neither family or person. its a major event" — 8 popup answers).
//
// Storage: the case's own person roster (same as a family-case, kind
// 'event'), plus event rows with case_id set, person_id left null and
// with_ids (comma person ids, the same column theory timelines already
// use for "with: Name") naming who was involved — 0, 1 or several.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';
import { inlineNameForm, inlineNote, clearInlineNote, twoTapConfirm } from '../ui.js';

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

/** "1914", "1914-08" or "1914-06-28" (typed loosely, kept honest) → date fields at the precision she actually gave. */
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

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="event-head">
          <div>
            <div class="mono event-era" id="era-view" style="font-size:12px;cursor:pointer" title="Click to set the era">${kase.era_start || kase.era_end ? `<span class="val">${kase.era_start || '?'} – ${kase.era_end || '?'}</span>` : 'Set the era (years)'}</div>
          </div>
          <span class="event-badge">Major event</span>
        </div>
        <div id="era-edit-slot"></div>
      </div>

      <div class="tab-strip" id="tab-strip">${TABS.map(([k, l]) => `<a href="#/event${k === 'overview' ? '' : '/' + k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>

      ${tab === 'overview' ? `
      <div class="panel">
        <div class="row between" style="margin-bottom:4px"><div class="panel-title" style="margin:0">Key figures</div><button class="btn btn-ghost btn-sm" id="add-figure-btn">+ Add figure</button></div>
        <div class="faces-row" id="figures-row"></div>
        <div id="figure-form-slot"></div>
      </div>

      <div class="panel">
        <div class="row between" style="margin-bottom:4px"><div class="panel-title" style="margin:0">Timeline</div><button class="btn btn-ghost btn-sm" id="add-entry-btn">+ Add entry</button></div>
        <div id="entry-form-slot"></div>
        <div class="stack" id="timeline-list" style="gap:12px;margin-top:8px"></div>
      </div>
      ` : `<div id="tab-body"></div>`}
    </div>
  `;

  // --- era, click to set --------------------------------------------------
  root.querySelector('#era-view').addEventListener('click', () => {
    const slot = root.querySelector('#era-edit-slot');
    if (slot.children.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="row" style="gap:8px;margin-top:8px;align-items:center">
        <input type="number" id="era-from" placeholder="from" value="${kase.era_start || ''}" style="width:90px">
        <span class="mono" style="color:var(--text-3)">–</span>
        <input type="number" id="era-to" placeholder="to" value="${kase.era_end || ''}" style="width:90px">
        <button class="btn btn-primary btn-sm" id="era-save">Save</button>
      </div>`;
    slot.querySelector('#era-save').addEventListener('click', async () => {
      const from = slot.querySelector('#era-from').value.trim();
      const to = slot.querySelector('#era-to').value.trim();
      await store.updateCase(kase.id, { era_start: from ? +from : null, era_end: to ? +to : null });
      render(root, ctx, tab);
    });
  });

  if (tab !== 'overview') {
    const mod = await TAB_MODULES[tab]();
    return mod.render(root.querySelector('#tab-body'), ctx);
  }

  // --- key figures ---------------------------------------------------------
  const people = await store.listPeople(kase.id);
  const figuresRow = root.querySelector('#figures-row');
  if (!people.length) figuresRow.appendChild(emptyState({ missing: 'No key figures yet.', why: 'Add the people who mattered to this event — each gets a full profile.' }));
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
    if (slot.querySelector('.inline-form')) return;
    slot.appendChild(inlineNameForm({
      placeholder: 'Name',
      submitLabel: 'Add',
      onSubmit: async (name) => {
        await store.createPerson({ case_id: kase.id, display_name: name, kind: 'person' });
        render(root, ctx, tab);
      },
    }));
  });

  // --- timeline --------------------------------------------------------------
  const byId = new Map(people.map((p) => [p.id, p]));
  const events = (await store.listEventsForCase(kase.id)).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  const listEl = root.querySelector('#timeline-list');
  if (!events.length) {
    listEl.appendChild(emptyState({ missing: 'Nothing on the timeline yet.', why: 'Add what happened, when, and who was involved.' }));
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

/** The add/edit form for one timeline entry — title, a loosely-typed date, place, notes, and who was involved. */
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
      <input type="text" class="ef-title" placeholder="What happened" value="${esc(existing?.title || '')}" style="flex:1 1 220px;min-width:0">
      <input type="text" class="ef-date" placeholder="1914-06-28, 1914-08 or 1914" value="${esc(dateStr)}" style="width:170px">
      <input type="text" class="ef-place" placeholder="Place" value="${esc(existing?.place || '')}" style="width:140px">
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
    if (!title) { inlineNote(saveBtn, 'Say what happened first.'); titleEl.focus(); return; }
    const parsed = parseDateInput(dateEl.value);
    if (parsed === null) { inlineNote(saveBtn, 'Date not recognised — try 1914-06-28, 1914-08, 1914 or 1914-1918.'); dateEl.focus(); return; }
    const withIdsNew = [...wrap.querySelectorAll('.ef-with:checked')].map((c) => c.value);
    const patch = {
      title, place: wrap.querySelector('.ef-place').value.trim() || null,
      notes: wrap.querySelector('.ef-notes').value.trim() || null,
      with_ids: withIdsNew.join(',') || null,
      ...parsed,
    };
    if (existing) await store.updateEvent(existing.id, patch);
    else await store.createEvent({ case_id: kase.id, kind: 'other', ...patch });
    wrap.remove();
    onDone();
  });
  queueMicrotask(() => titleEl.focus());
  return wrap;
}
