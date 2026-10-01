// Company case workspace — a corporation or business isn't a person, a
// family, a major event or a franchise's cast-and-installments: it has a
// founding (date, place, founder), it grows through a run of individual
// locations opening over time, and it has its own commercial story (her
// ask, 2026-09-29: "add an option for me to add corporations/businesses
// including founding date, franchise founding date, founder, location
// opening etc" — 12 answers across 4 rounds). Adapted from series.js, the
// closest existing shape ("one entity + a dated list underneath it"), with
// two departures she asked for: founding/franchise are two distinct dates
// (not one auto-computed era), and locations carry their own structured
// city+country rather than a single place string.
//
// Storage: the case's own founding_*/franchise_* columns on case_file
// (js/company-facts.js has the full Wikidata-mapping note); founders are
// case-scoped people (same roster as a series' cast), each optionally
// carrying a role ("Founder", "Franchise founder") in the same person.role
// column a series cast member's character name already uses; locations and
// commercial milestones are plain `event` rows, case-level (person_id
// null), kind='location' (city/country columns, new — see schema.sql) or
// one of BIZ_MILESTONE_KINDS below.
import { emptyState, verificationConfidence, confidenceBand, verificationLabel } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';
import { inlineNote, clearInlineNote, twoTapConfirm, renderUnplacedPicker } from '../ui.js';
import { searchPeople } from '../lookup.js';
import { fetchCompanyFacts, applyCompanyFacts, summarizeCompanyFacts } from '../company-facts.js';
import { parseMilestoneText } from '../milestone-parse.js';

const TABS = [
  ['overview', 'Overview'], ['locations', 'Locations'], ['commercial', 'Commercial'],
  ['evidence', 'Evidence'], ['questions', 'Questions'], ['board', 'Board'],
];
const TAB_MODULES = {
  evidence: () => import('./evidence.js'),
  questions: () => import('./questions.js'), board: () => import('./board.js'),
};

// The Commercial tab's own vocabulary (her ask: "revenue/deals/products,
// like the person's existing Commercial tab, but for the business itself").
// Plain event.kind values, same free-schema trick MILESTONE_KINDS already
// uses for a person — deliberately a separate, smaller list rather than
// reusing MILESTONE_KINDS itself: 'chart'/'certification' are music-specific
// and isCommercialRelevant()'s occupation gate is person-scoped, neither of
// which fits a business case.
const BIZ_MILESTONE_KINDS = ['revenue', 'product', 'deal', 'award'];
const BIZ_MILESTONE_KIND_LABEL = { revenue: 'Revenue milestone', product: 'Product launch', deal: 'Deal / partnership', award: 'Award / recognition' };
const VERIFICATIONS = ['single', 'two_plus', 'disputed', 'dead_link', 'drafted'];
// parseMilestoneText's own guesses (tuned for a musician's paste box) remapped
// to the vocabulary above — she can always fix the guess via the row's own
// dropdown before saving, same as the person Commercial tab's own flow.
const BIZ_KIND_REMAP = { chart: 'revenue', certification: 'product', award: 'award', deal: 'deal' };

let lastResult = null; // shown once, on the next render

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function initials(name) { return String(name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
// same convention as questions.js's hostOf — a plain readable label for an outbound link
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return null; } }

/** "1955-4-15", "1955-04-15", "1955-04", "1955-4" or "1955" (typed loosely, kept honest — no leading zero required) → date fields at the precision she actually gave. */
function parseDateInput(raw) {
  const d = String(raw || '').trim();
  if (!d) return { date: null, date_precision: 'unknown', date_year_min: null, date_year_max: null };
  let m;
  if ((m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    const mo = +m[2], day = +m[3];
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
    return { date: `${m[1]}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`, date_precision: 'day', date_year_min: null, date_year_max: null };
  }
  if ((m = d.match(/^(\d{4})-(\d{1,2})$/))) {
    const mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    return { date: `${m[1]}-${String(mo).padStart(2, '0')}-01`, date_precision: 'month', date_year_min: null, date_year_max: null };
  }
  if ((m = d.match(/^(\d{4})$/))) return { date: null, date_precision: 'year', date_year_min: +m[1], date_year_max: +m[1] };
  if ((m = d.match(/^(\d{4})\s*[–-]\s*(\d{4})$/))) return { date: null, date_precision: 'range', date_year_min: +m[1], date_year_max: +m[2] };
  return null; // unrecognised — the form refuses rather than guessing
}
function fmtLoose(o) {
  if (o.date_precision === 'range' && o.date_year_min) return o.date_year_max && o.date_year_max !== o.date_year_min ? `${o.date_year_min}–${o.date_year_max}` : String(o.date_year_min);
  if (o.date_precision === 'year' && o.date_year_min) return String(o.date_year_min);
  if (!o.date) return null;
  const dt = new Date(`${o.date}T00:00:00`);
  return o.date_precision === 'month' ? dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function looseToInput(date, prec, yMin, yMax) {
  if (prec === 'month' && date) return date.slice(0, 7);
  if (prec === 'range' && yMin) return yMax && yMax !== yMin ? `${yMin}-${yMax}` : String(yMin);
  if (prec === 'year' && yMin) return String(yMin);
  return date || '';
}
function fmtEventDate(e) {
  if (e.date_precision === 'range' && e.date_year_min) return e.date_year_max && e.date_year_max !== e.date_year_min ? `${e.date_year_min}–${e.date_year_max}` : String(e.date_year_min);
  if (e.date_precision === 'year' && e.date_year_min) return String(e.date_year_min);
  if (!e.date) return '—';
  const dt = new Date(`${e.date}T00:00:00`);
  return e.date_precision === 'month' ? dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function sortKey(e) { return e.date || (e.date_year_min ? `${e.date_year_min}-01-01` : '9999-99-99'); }
function dot(confidence) { return `<span class="conf-dot ${confidenceBand(confidence)}" title="Confidence: ${confidence}"></span>`; }

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

  const foundingDate = fmtLoose({ date: kase.founding_date, date_precision: kase.founding_date_precision, date_year_min: kase.founding_year_min, date_year_max: kase.founding_year_max });
  const foundingPlace = [kase.founding_city, kase.founding_country].filter(Boolean).join(', ');
  // headquarters (2026-09-30) is a distinct fact from founding location and
  // only ever shown as a labeled fallback when founding location is blank —
  // never blended in, since HQ can genuinely differ from where a business
  // was founded. See company-facts.js's file-top note.
  const hqPlace = [kase.headquarters_city, kase.headquarters_country].filter(Boolean).join(', ');
  const placeHtml = foundingPlace ? esc(foundingPlace) : hqPlace ? `Headquarters: ${esc(hqPlace)}` : '';
  const franchiseDate = fmtLoose({ date: kase.franchise_date, date_precision: kase.franchise_date_precision, date_year_min: kase.franchise_year_min, date_year_max: kase.franchise_year_max });
  const summaryHtml = (foundingDate || placeHtml)
    ? `<span style="color:var(--brass)">${foundingDate ? `Founded ${esc(foundingDate)}` : 'Founding date not set'}${placeHtml ? ` · ${placeHtml}` : ''}</span>${franchiseDate ? `<div style="margin-top:2px;color:var(--text-3);font-size:11px">Franchising began ${esc(franchiseDate)}</div>` : ''}`
    : 'Set the founding details';

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="event-head">
          <div class="mono event-era" id="founding-view" style="font-size:12px;cursor:pointer" title="Click to edit">${summaryHtml}</div>
          <span class="event-badge business">Business</span>
        </div>
        <div id="founding-edit-slot"></div>
        ${kase.wikidata_id ? `<div class="row" style="margin-top:8px"><button class="btn btn-ghost btn-sm" id="recheck-btn">Check Wikidata for founding details</button></div>` : `
        <div class="row wrap" style="gap:8px;margin-top:8px;align-items:center">
          <input type="text" id="link-wiki-input" placeholder="Find this business on Wikipedia" value="${esc(kase.name)}" style="flex:1 1 200px;min-width:0">
          <button class="btn btn-ghost btn-sm" id="link-wiki-btn">Search Wikipedia</button>
        </div>
        <div id="link-wiki-results"></div>`}
        ${kase.reference_url ? `<div class="row" style="margin-top:8px"><a href="${esc(kase.reference_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">↗ ${esc(hostOf(kase.reference_url) || 'Look up')}</a></div>` : ''}
        ${lastResult ? `<div class="inline-note" style="border-left-color:var(--green);margin-top:8px" id="result-note">${esc(lastResult)}</div>` : ''}
      </div>

      <div class="tab-strip" id="tab-strip">${TABS.map(([k, l]) => `<a href="#/company${k === 'overview' ? '' : '/' + k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>

      ${tab === 'overview' ? `
      <div class="panel">
        <div class="row between" style="margin-bottom:4px">
          <div class="panel-title" style="margin:0">Founders</div>
          <button class="btn btn-ghost btn-sm" id="add-figure-btn">+ Add founder</button>
        </div>
        <div class="faces-row" id="figures-row"></div>
        <div id="figure-form-slot"></div>
      </div>
      ` : tab === 'locations' ? `
      <div class="panel">
        <div class="row between" style="margin-bottom:4px">
          <div>
            <div class="panel-title" style="margin:0">Locations</div>
            <div class="section-label" id="loc-count" style="margin-top:2px"></div>
          </div>
          <button class="btn btn-ghost btn-sm" id="add-loc-btn">+ Add location</button>
        </div>
        <div id="loc-form-slot"></div>
        <div id="loc-list" style="margin-top:8px"></div>
      </div>
      ` : tab === 'commercial' ? `
      <div class="panel">
        <div class="row between">
          <div class="panel-title" style="margin:0">Commercial milestones</div>
          <button class="btn btn-primary btn-sm" id="bc-add-btn">+ Add milestones</button>
        </div>
        <div id="bc-add-slot"></div>
        <div id="bc-groups" class="stack" style="margin-top:12px;gap:16px"></div>
      </div>
      ` : `<div id="tab-body"></div>`}
    </div>
  `;
  if (lastResult) lastResult = null;

  // --- founding facts, click to edit --------------------------------------
  root.querySelector('#founding-view').addEventListener('click', () => {
    const slot = root.querySelector('#founding-edit-slot');
    if (slot.children.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="row wrap" style="gap:8px;margin-top:8px">
        <input type="text" id="fnd-date" placeholder="Founded — 1955-04-15, 1955-04 or 1955" value="${esc(looseToInput(kase.founding_date, kase.founding_date_precision, kase.founding_year_min, kase.founding_year_max))}" style="width:200px">
        <input type="text" id="fnd-city" placeholder="City" value="${esc(kase.founding_city || '')}" style="width:130px">
        <input type="text" id="fnd-country" placeholder="Country" value="${esc(kase.founding_country || '')}" style="width:130px">
        <input type="text" id="fnd-franchise" placeholder="Franchising began — optional" value="${esc(looseToInput(kase.franchise_date, kase.franchise_date_precision, kase.franchise_year_min, kase.franchise_year_max))}" style="width:200px">
      </div>
      <div class="section-label" style="margin-top:10px">Headquarters — only shown above if the city/country fields are left blank</div>
      <div class="row wrap" style="gap:8px;margin-top:4px">
        <input type="text" id="fnd-hq-city" placeholder="HQ city" value="${esc(kase.headquarters_city || '')}" style="width:130px">
        <input type="text" id="fnd-hq-country" placeholder="HQ country" value="${esc(kase.headquarters_country || '')}" style="width:130px">
      </div>
      <div class="section-label" style="margin-top:10px">Reference link — a page worth going back to when Wikidata doesn't have enough</div>
      <div class="row wrap" style="gap:8px;margin-top:4px">
        <input type="text" id="fnd-ref-url" placeholder="https://…" value="${esc(kase.reference_url || '')}" style="flex:1 1 260px;min-width:0">
      </div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button type="button" class="btn btn-primary btn-sm" id="fnd-save">Save</button>
        <button type="button" class="btn btn-ghost btn-sm" id="fnd-cancel">Cancel</button>
      </div>
    `;
    slot.querySelector('#fnd-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    slot.querySelector('#fnd-save').addEventListener('click', async () => {
      const btn = slot.querySelector('#fnd-save');
      clearInlineNote(btn);
      const fParsed = parseDateInput(slot.querySelector('#fnd-date').value);
      const xParsed = parseDateInput(slot.querySelector('#fnd-franchise').value);
      if (fParsed === null || xParsed === null) { inlineNote(btn, 'Date not recognised — try 1955-04-15, 1955-04, 1955 or 1955-1960.'); return; }
      let refUrl = slot.querySelector('#fnd-ref-url').value.trim();
      if (refUrl && !/^https?:\/\//i.test(refUrl)) refUrl = `https://${refUrl}`; // typed loosely, kept honest — same spirit as the date fields
      await store.updateCase(kase.id, {
        founding_date: fParsed.date, founding_date_precision: fParsed.date_precision, founding_year_min: fParsed.date_year_min, founding_year_max: fParsed.date_year_max,
        founding_city: slot.querySelector('#fnd-city').value.trim() || null,
        founding_country: slot.querySelector('#fnd-country').value.trim() || null,
        headquarters_city: slot.querySelector('#fnd-hq-city').value.trim() || null,
        headquarters_country: slot.querySelector('#fnd-hq-country').value.trim() || null,
        reference_url: refUrl || null,
        franchise_date: xParsed.date, franchise_date_precision: xParsed.date_precision, franchise_year_min: xParsed.date_year_min, franchise_year_max: xParsed.date_year_max,
      });
      render(root, ctx, tab);
    });
  });

  // --- Wikidata: recheck (already linked) or search + link ----------------
  root.querySelector('#recheck-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    clearInlineNote(btn);
    btn.disabled = true; btn.textContent = 'Reading founding details from Wikidata…';
    try {
      const facts = await fetchCompanyFacts(kase.wikidata_id);
      const r = await applyCompanyFacts(store, kase, facts);
      lastResult = summarizeCompanyFacts(r);
      render(root, ctx, tab);
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Check Wikidata for founding details';
      inlineNote(btn, `Couldn't reach Wikidata — ${err.message}. Are you online?`);
    }
  });
  root.querySelector('#link-wiki-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const input = root.querySelector('#link-wiki-input');
    const results = root.querySelector('#link-wiki-results');
    const name = input.value.trim();
    clearInlineNote(btn);
    results.innerHTML = '';
    if (!name) { inlineNote(btn, 'Type the business name first.'); input.focus(); return; }
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(name); }
    catch (err) { inlineNote(btn, `Couldn't reach Wikidata — ${err.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = 'Search Wikipedia';
    if (!matches.length) { inlineNote(btn, 'No match on Wikidata for that name.'); return; }
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${esc(m.label)}</div><div class="sub">${esc(m.description || 'no description')} · ${m.id}</div></div><span class="chip brass">Link and pull details ▸</span>`;
      row.addEventListener('click', async () => {
        results.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)">Linking and reading founding details from Wikidata…</div>';
        await store.updateCase(kase.id, { wikidata_id: m.id });
        try {
          const facts = await fetchCompanyFacts(m.id);
          const r = await applyCompanyFacts(store, kase, facts);
          lastResult = summarizeCompanyFacts(r);
        } catch (err) { /* linked either way — the recheck button now shows since wikidata_id is set */ }
        render(root, ctx, tab);
      });
      results.appendChild(row);
    }
  });

  if (tab !== 'overview' && tab !== 'locations' && tab !== 'commercial') {
    const mod = await TAB_MODULES[tab]();
    return mod.render(root.querySelector('#tab-body'), ctx);
  }

  const events = (await store.listEventsForCase(kase.id)).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

  if (tab === 'overview') {
    // --- founders ---------------------------------------------------------
    const people = await store.listPeople(kase.id);
    const figuresRow = root.querySelector('#figures-row');
    if (!people.length) figuresRow.appendChild(emptyState({ missing: 'No founders yet.', why: 'Add whoever founded or franchised this business — each gets a full profile.' }));
    for (const p of people) {
      const f = document.createElement('div');
      f.className = 'face-card';
      f.innerHTML = `
        <div class="face" style="width:56px;height:56px"><span class="initials">${initials(p.display_name)}</span></div>
        <div class="name">${esc(p.display_name)}</div>
        <div class="role role-view" style="cursor:pointer">${p.role ? esc(p.role) : '+ role'}</div>
        <div class="role-edit-slot"></div>
      `;
      f.querySelector('.face').addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      f.querySelector('.name').addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      figuresRow.appendChild(f);
      const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
      if (src) {
        const img = document.createElement('img');
        img.alt = ''; img.src = src;
        img.addEventListener('load', () => f.querySelector('.initials')?.remove());
        img.addEventListener('error', () => img.remove());
        f.querySelector('.face').appendChild(img);
      }
      f.querySelector('.role-view').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const slot = f.querySelector('.role-edit-slot');
        if (slot.children.length) { slot.innerHTML = ''; return; }
        slot.innerHTML = `<input type="text" class="role-input" value="${esc(p.role || '')}" placeholder="Founder" style="width:100%;font-size:11px;margin-top:4px">`;
        const input = slot.querySelector('.role-input');
        input.addEventListener('click', (e2) => e2.stopPropagation());
        // guarded against a double-fire: removing a focused input from the DOM
        // (which render()'s innerHTML replacement below does) dispatches a
        // native blur on it, so pressing Enter would otherwise save twice
        let saved = false;
        const save = async () => { if (saved) return; saved = true; await store.updatePerson(p.id, { role: input.value.trim() || null }); render(root, ctx, tab); };
        input.addEventListener('keydown', (e2) => { if (e2.key === 'Enter') save(); if (e2.key === 'Escape') { saved = true; slot.innerHTML = ''; } });
        input.addEventListener('blur', save);
        input.focus();
      });
    }
    root.querySelector('#add-figure-btn').addEventListener('click', () => {
      const slot = root.querySelector('#figure-form-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      renderUnplacedPicker(slot, ctx, { onPicked: () => render(root, ctx, tab) });
    });
    return;
  }

  if (tab === 'locations') {
    const locations = events.filter((e) => e.kind === 'location');
    const listEl = root.querySelector('#loc-list');
    const countEl = root.querySelector('#loc-count');
    if (!locations.length) {
      if (countEl) countEl.textContent = '';
      listEl.appendChild(emptyState({ missing: 'No locations yet.', why: 'Add each store, branch or franchise, where it opened and when.' }));
    } else {
      if (countEl) countEl.textContent = `${locations.length} location${locations.length === 1 ? '' : 's'}`;
      for (const e of locations) listEl.appendChild(locationRow(e));
    }
    root.querySelector('#add-loc-btn').addEventListener('click', () => {
      const slot = root.querySelector('#loc-form-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      slot.appendChild(locationForm(null));
    });

    function locationRow(e) {
      const place = [e.city, e.country].filter(Boolean).join(', ');
      const row = document.createElement('div');
      row.className = 'card tl-entry';
      row.innerHTML = `
        <div class="row between" style="align-items:flex-start">
          <div>
            <div class="mono tl-date" style="font-size:11px">${fmtEventDate(e)}</div>
            <div style="margin-top:2px">${esc(e.title)}</div>
            ${place ? `<div class="row wrap" style="gap:6px;margin-top:6px"><span class="chip">${esc(place)}</span></div>` : ''}
            ${e.notes ? `<p style="margin-top:6px;color:var(--text-3);font-size:12px">${esc(e.notes)}</p>` : ''}
          </div>
          <div class="row" style="gap:4px;flex:none">
            <button class="btn btn-ghost btn-sm loc-edit" title="Edit">✎</button>
            <button class="btn btn-ghost btn-sm loc-delete" title="Delete">✕</button>
          </div>
        </div>
        <div class="entry-edit-slot"></div>
      `;
      row.querySelector('.loc-delete').addEventListener('click', (ev) => {
        twoTapConfirm(ev.currentTarget, { confirmLabel: 'Really?', onConfirm: async () => { await store.deleteEvent(e.id); render(root, ctx, tab); } });
      });
      row.querySelector('.loc-edit').addEventListener('click', () => {
        const slot = row.querySelector('.entry-edit-slot');
        if (slot.children.length) { slot.innerHTML = ''; return; }
        slot.appendChild(locationForm(e));
      });
      return row;
    }
    function locationForm(existing) {
      const wrap = document.createElement('div');
      wrap.className = 'inline-form';
      wrap.style.marginTop = '8px';
      const dateStr = existing ? looseToInput(existing.date, existing.date_precision, existing.date_year_min, existing.date_year_max) : '';
      wrap.innerHTML = `
        <div class="row wrap" style="gap:8px">
          <input type="text" class="lf-title" placeholder="Location name" value="${esc(existing?.title || '')}" style="flex:1 1 200px;min-width:0">
          <input type="text" class="lf-city" placeholder="City" value="${esc(existing?.city || '')}" style="width:130px">
          <input type="text" class="lf-country" placeholder="Country" value="${esc(existing?.country || '')}" style="width:130px">
          <input type="text" class="lf-date" placeholder="Opened — 1955-04-15, 1955-04 or 1955" value="${esc(dateStr)}" style="width:200px">
        </div>
        <textarea class="lf-notes" placeholder="Notes" style="margin-top:8px;min-height:44px;font-size:12px">${esc(existing?.notes || '')}</textarea>
        <div class="row" style="gap:8px;margin-top:10px">
          <button type="button" class="btn btn-primary btn-sm lf-save">${existing ? 'Save' : 'Add'}</button>
          <button type="button" class="btn btn-ghost btn-sm lf-cancel">Cancel</button>
        </div>
      `;
      const titleEl = wrap.querySelector('.lf-title');
      const dateEl = wrap.querySelector('.lf-date');
      const saveBtn = wrap.querySelector('.lf-save');
      wrap.querySelector('.lf-cancel').addEventListener('click', () => wrap.remove());
      saveBtn.addEventListener('click', async () => {
        clearInlineNote(saveBtn);
        const title = titleEl.value.trim();
        if (!title) { inlineNote(saveBtn, 'Give it a name first.'); titleEl.focus(); return; }
        const parsed = parseDateInput(dateEl.value);
        if (parsed === null) { inlineNote(saveBtn, 'Date not recognised — try 1955-04-15, 1955-04, 1955 or 1955-1960.'); dateEl.focus(); return; }
        const patch = {
          title, city: wrap.querySelector('.lf-city').value.trim() || null, country: wrap.querySelector('.lf-country').value.trim() || null,
          notes: wrap.querySelector('.lf-notes').value.trim() || null, ...parsed,
        };
        if (existing) await store.updateEvent(existing.id, patch);
        else await store.createEvent({ case_id: kase.id, kind: 'location', ...patch });
        wrap.remove();
        onLocationSaved();
      });
      queueMicrotask(() => titleEl.focus());
      return wrap;
    }
    function onLocationSaved() { render(root, ctx, tab); }
    return;
  }

  // --- commercial ----------------------------------------------------------
  const milestones = events.filter((e) => BIZ_MILESTONE_KINDS.includes(e.kind));
  const withConf = await Promise.all(milestones.map(async (e) => {
    const links = await store.listLinksForTarget('event', e.id);
    const confidence = links.length ? Math.max(...links.map((l) => verificationConfidence(l.evidence_verification))) : 0;
    return { ...e, confidence };
  }));
  const groupsEl = root.querySelector('#bc-groups');
  if (!withConf.length) {
    groupsEl.appendChild(emptyState({ missing: 'No commercial milestones logged yet.', why: 'Paste in a revenue figure, product launch, deal or award below — the date is all it needs.' }));
  } else {
    for (const kind of BIZ_MILESTONE_KINDS) {
      const items = withConf.filter((e) => e.kind === kind);
      if (!items.length) continue;
      const section = document.createElement('div');
      section.innerHTML = `<div class="section-label">${BIZ_MILESTONE_KIND_LABEL[kind]}</div>`;
      const row = document.createElement('div');
      row.className = 'chip-row';
      row.style.marginTop = '6px';
      for (const e of items) {
        const chip = document.createElement('span');
        chip.className = 'chip milestone-chip';
        chip.innerHTML = `${dot(e.confidence)}<span class="mono" style="color:var(--text-3);font-size:10px">${fmtEventDate(e)}</span> ${esc(e.title)} <button type="button" class="linklike bc-del" title="Delete">✕</button>`;
        chip.querySelector('.bc-del').addEventListener('click', (ev) => {
          ev.stopPropagation();
          twoTapConfirm(ev.currentTarget, { confirmLabel: '✕ sure?', onConfirm: async () => { await store.deleteEvent(e.id); render(root, ctx, tab); } });
        });
        row.appendChild(chip);
      }
      section.appendChild(row);
      groupsEl.appendChild(section);
    }
  }

  const addSlot = root.querySelector('#bc-add-slot');
  root.querySelector('#bc-add-btn').addEventListener('click', () => {
    if (addSlot.children.length) { addSlot.innerHTML = ''; return; }
    addSlot.innerHTML = `
      <div class="field" style="margin-top:12px">
        <label>Paste facts — one per line, each needs a date</label>
        <textarea id="bc-text" placeholder="1955 - first franchise opens in Des Plaines&#10;1965 - shares first listed on the NYSE&#10;2003 - launches the Dollar Menu&#10;2010 - reaches $24B in revenue" style="min-height:88px;font-family:var(--font-mono);font-size:12px"></textarea>
      </div>
      <div class="row wrap" style="gap:8px;align-items:flex-end">
        <div class="field" style="flex:1 1 220px;min-width:0"><label>Source (optional)</label><input type="text" id="bc-source" placeholder="Article name or URL"></div>
        <div class="field" style="flex:none"><label>Confidence</label>
          <select id="bc-verify">${VERIFICATIONS.map((v) => `<option value="${v}">${verificationLabel(v)}</option>`).join('')}</select>
        </div>
        <button class="btn btn-ghost btn-sm" id="bc-parse">Parse</button>
      </div>
      <div id="bc-preview"></div>
    `;
    root.querySelector('#bc-text').focus();
    root.querySelector('#bc-parse').addEventListener('click', () => {
      const btn = root.querySelector('#bc-parse');
      clearInlineNote(btn);
      const text = root.querySelector('#bc-text').value;
      const { candidates, unrecognised } = parseMilestoneText(text);
      const preview = root.querySelector('#bc-preview');
      if (!candidates.length) {
        preview.innerHTML = '';
        inlineNote(btn, text.trim() ? 'No dated facts found. Each line needs a date somewhere in it — "2014", "March 2014", "3 March 2014".' : 'Paste something first.');
        return;
      }
      preview.innerHTML = `
        <div class="stack" style="gap:4px;margin-top:10px" id="bc-rows"></div>
        ${unrecognised.length ? `<p class="mono" style="font-size:11px;color:var(--text-3);margin-top:8px">No date found, left out: ${unrecognised.map((u) => `"${u}"`).join(', ')}</p>` : ''}
        <button class="btn btn-primary btn-sm" id="bc-save" style="margin-top:10px">Save ${candidates.length} milestone${candidates.length === 1 ? '' : 's'}</button>
      `;
      const rowsEl = preview.querySelector('#bc-rows');
      for (const c of candidates) {
        const kind = BIZ_KIND_REMAP[c.kind] || 'deal';
        const row = document.createElement('div');
        row.className = 'row';
        row.style.cssText = 'gap:8px;align-items:center';
        row.innerHTML = `
          <select class="bc-row-kind" style="flex:none">${BIZ_MILESTONE_KINDS.map((k) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${BIZ_MILESTONE_KIND_LABEL[k]}</option>`).join('')}</select>
          <span class="mono" style="font-size:11px;color:var(--text-3);flex:none">${c.date || c.date_year_min}</span>
          <input type="text" class="bc-row-title" value="${esc(c.title)}" style="flex:1;min-width:0">
          <button type="button" class="linklike bc-row-del" title="Remove">✕</button>
        `;
        row.querySelector('.bc-row-del').addEventListener('click', () => row.remove());
        rowsEl.appendChild(row);
      }
      preview.querySelector('#bc-save').addEventListener('click', async () => {
        const saveBtn = preview.querySelector('#bc-save');
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const sourceText = root.querySelector('#bc-source').value.trim();
        const verification = root.querySelector('#bc-verify').value;
        let evidenceId = null;
        if (sourceText) {
          const isUrl = /^https?:\/\//i.test(sourceText);
          const ev = await store.createEvidence({
            case_id: kase.id, type: 'note',
            title: isUrl ? `Source for ${kase.name}'s commercial milestones` : sourceText,
            original_url: isUrl ? sourceText : null,
            verification, dated: new Date().toISOString().slice(0, 10),
          });
          evidenceId = ev.id;
        }
        const rows = [...rowsEl.querySelectorAll('.row')];
        let saved = 0;
        for (let i = 0; i < candidates.length; i++) {
          if (!rows[i]) continue;
          const c = candidates[i];
          const rowKind = rows[i].querySelector('.bc-row-kind').value;
          const title = rows[i].querySelector('.bc-row-title').value.trim() || c.title;
          const eventId = await store.createEvent({
            case_id: kase.id, person_id: null, kind: rowKind, title,
            date: c.date, date_precision: c.date_precision, date_year_min: c.date_year_min, date_year_max: c.date_year_max,
          });
          if (evidenceId) await store.linkEvidence({ evidence_id: evidenceId, target_type: 'event', target_id: eventId });
          saved++;
        }
        lastResult = `${saved} milestone${saved === 1 ? '' : 's'} added${evidenceId ? ', citing the source given' : ' — drafted, no source given yet'}.`;
        render(root, ctx, tab);
      });
    });
  });
}
