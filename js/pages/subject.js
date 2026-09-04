import { lifePath, birthdayNumber, personalYear, universalYear, expression, soulUrge, personality } from '../numerology.js';
import { signFor } from '../chinese.js';
import { sunSign } from '../western.js';
import { relation } from '../relations.js';
import { numberIcons, relationGlyph, barRow, emptyState, verificationConfidence, confidenceBand, verificationLabel, zodiacColor, signColor, animalHtml, animalLabel, signHtml } from '../indicators.js';
import { exactBirth } from '../person-dates.js';
import { renderPairs } from '../contradictions.js';
import { parseProfileText } from '../profile-parse.js';
import { searchPeople, fetchProfile, draftFromLookup, insertFamily, fetchWorks, addWorks, WORK_GROUPS } from '../lookup.js';
import { compressImage, queueUpload, resolveAssetUrl, flushUploads } from '../assets.js';
import { inlineNote, clearInlineNote, twoTapConfirm, inlineNameForm } from '../ui.js';

function fmtLongDate(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// "44 (born 13 Nov 1981)" · "died at 56" · "≈44 (born 1981)" · "unknown" — never a guess dressed as a fact
function ageText(person) {
  const endISO = person.death_date || new Date().toISOString().slice(0, 10);
  const died = !!person.death_date;
  if (person.birth_precision === 'day' && person.birth_date) {
    const a = ageAt(person.birth_date, endISO);
    return died ? `died at ${a}` : `${a}`;
  }
  const y = person.birth_year_min || (person.birth_date ? parseInt(person.birth_date.slice(0, 4), 10) : null);
  if (y) {
    const approx = parseInt(endISO.slice(0, 4), 10) - y;
    return died ? `died at ≈${approx}` : `≈${approx}`;
  }
  return 'unknown';
}

function bornText(person) {
  if (person.birth_precision === 'day' && person.birth_date) return fmtLongDate(person.birth_date);
  if (person.birth_precision === 'month' && person.birth_date) return new Date(`${person.birth_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (person.birth_year_min) return person.birth_year_min === person.birth_year_max || !person.birth_year_max ? String(person.birth_year_min) : `${person.birth_year_min}–${person.birth_year_max}`;
  return null;
}

function ageAt(birthISO, atISO) {
  const b = new Date(birthISO), a = new Date(atISO);
  let years = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) years--;
  return years;
}

async function evidenceStatusForPerson(store, personId) {
  const links = await store.listLinksForTarget('person', personId);
  const hasStrong = links.some((l) => ['two_plus', 'single'].includes(l.evidence_verification));
  const hasDisputed = links.some((l) => ['disputed', 'dead_link'].includes(l.evidence_verification));
  if (hasDisputed) return 'contradicted';
  if (hasStrong) return 'sourced';
  return 'drafted';
}

function chartPanel(person, status) {
  const el = document.createElement('div');
  const hasFullDate = person.birth_precision === 'day' && !!person.birth_date;

  if (!hasFullDate) {
    let why = 'No birth date on file.';
    if (person.birth_precision === 'range' && person.birth_year_min) {
      why = `Birth year contested — ${person.birth_year_min} or ${person.birth_year_max}. No day or month known for either candidate, so no chart can be drawn for either.`;
    } else if (person.birth_precision === 'year' && person.birth_year_min) {
      why = `Only the birth year (${person.birth_year_min}) is known. Life path, personal year and sun sign all need a day and month.`;
    } else if (person.birth_precision === 'month') {
      why = 'Only a birth month is known — a day is still needed.';
    }
    el.appendChild(emptyState({ missing: 'Chart cannot be drawn.', why, action: null }));
    return el;
  }

  const birth = exactBirth(person); // never person.birth_date — see js/person-dates.js
  const lp = lifePath(birth);
  const bn = birthdayNumber(birth);
  const thisYear = new Date().getFullYear();
  const py = personalYear(birth, thisYear);
  const uy = universalYear(thisYear);
  const nameForCalc = person.name_at_birth || person.display_name;
  const expr = expression(nameForCalc);
  const su = soulUrge(nameForCalc);
  const pers = personality(nameForCalc);
  const chinese = signFor(birth);
  const sun = sunSign(birth);

  // number · animal picture · sign glyph (her call, 2026-09-03 — no symbol tokens)
  const tokRow = numberIcons({ lifePath: lp, chinese, sun }, { size: 'lg' });
  tokRow.title = `Evidence status: ${status}`;
  el.appendChild(tokRow);

  const grid = document.createElement('div');
  grid.className = 'grid-2';
  grid.style.marginTop = '16px';

  // the numbers read as numbers (audit 2026-09-01, her pick); the arithmetic
  // stays one tap away under "show working", never lost
  const left = document.createElement('div');
  left.className = 'stack';
  // colour: brass for the life path; the animal and sun sign take her zodiac colour code
  const big = (value, label, color) => `<div><div class="title" style="font-size:22px;color:${color === true ? 'var(--brass)' : (color || 'var(--text)')}">${value}</div><div class="section-label">${label}</div></div>`;
  left.innerHTML = `
    <div class="row wrap" style="gap:20px;align-items:flex-end">
      ${big(`${lp.value}${lp.master ? '★' : ''}`, 'life path', true)}
      ${big(`${py.value}${py.master ? '★' : ''}`, `${thisYear} year`)}
      ${big(chinese.boundary ? '—' : animalLabel(chinese.animal), chinese.boundary ? 'animal · unresolved' : chinese.element.toLowerCase(), chinese.boundary ? null : zodiacColor(chinese.animal))}
      ${big(sun.sign, sun.cusp ? 'sun · cusp' : 'sun', signColor(sun.sign))}
    </div>
    <details style="margin-top:4px">
      <summary style="cursor:pointer;font-size:11px;color:var(--text-3);list-style:none">show working ▸</summary>
      <div class="stack mono" style="font-size:12px;color:var(--text-2);margin-top:8px;gap:4px">
        <div>Life path ${lp.value}${lp.master ? ' (master)' : ''} — ${lp.parts.day}→${lp.parts.dayReduced} · ${lp.parts.month}→${lp.parts.monthReduced} · ${lp.parts.year}→${lp.parts.yearReduced} · = ${lp.value}</div>
        <div>Birthday number ${bn.value}${bn.master ? ' (master)' : ''}</div>
        <div>Personal year ${thisYear}: ${py.value}${py.master ? ' (master)' : ''} · Universal year: ${uy.value}${uy.master ? ' (master)' : ''}</div>
        <div>${chinese.boundary ? 'Animal year: unresolved (near lunar new year, no CNY date on file for this year)' : `${animalHtml(chinese.animal)} · ${chinese.element}`}</div>
        <div>${signHtml(sun.sign)}${sun.cusp ? ' (cusp)' : ''}</div>
      </div>
    </details>
  `;
  grid.appendChild(left);

  const right = document.createElement('div');
  right.className = 'stack';
  if (expr.ok) {
    right.appendChild(barRow({ label: 'Expression', value: expr.value, max: 33, colorVar: 'var(--violet)' }));
    right.appendChild(barRow({ label: 'Soul urge', value: su.value, max: 33, colorVar: 'var(--violet)' }));
    right.appendChild(barRow({ label: 'Personality', value: pers.value, max: 33, colorVar: 'var(--violet)' }));
  } else {
    right.appendChild(emptyState({ missing: 'No name to derive expression / soul urge / personality.', why: 'These need a name at birth (or display name).' }));
  }
  grid.appendChild(right);
  el.appendChild(grid);

  return el;
}

// the profile's tabs (her redesign 2026-09-02): the case's whole workspace
// lives under the person — Evidence, Board, Relations, Import are the same
// case-level pages, mounted here so she never leaves the profile
const TABS = [
  ['profile', 'Profile'], ['evidence', 'Evidence'], ['contradictions', 'Contradictions'],
  ['questions', 'Questions'], ['board', 'Board'], ['relations', 'Relations'], ['import', 'Import'],
];
const TAB_MODULES = {
  evidence: () => import('./evidence.js'), contradictions: () => import('./contradictions.js'),
  questions: () => import('./questions.js'),
  board: () => import('./board.js'), relations: () => import('./relations.js'), import: () => import('./import.js'),
};

export async function render(root, ctx, personId, tab = 'profile') {
  const { store } = ctx;
  if (!TAB_MODULES[tab]) tab = 'profile';

  if (!personId || !ctx.caseId) {
    const people = ctx.caseId ? await store.listPeople(ctx.caseId) : [];
    root.innerHTML = '<div class="panel"><div class="panel-title">Open a subject file</div><div id="pick-list" class="stack" style="gap:2px"></div></div>';
    const list = root.querySelector('#pick-list');
    if (!people.length) {
      list.appendChild(emptyState({ missing: 'No people in this case yet.', why: 'Add people from the Relations map.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
    }
    for (const p of people) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${p.display_name}</div></div>`;
      row.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      list.appendChild(row);
    }
    return;
  }

  const person = await store.getPerson(personId);
  if (!person) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'This person could not be found.', why: 'They may have been deleted.' }));
    return;
  }
  ctx.setTitle(person.display_name);
  localStorage.setItem('c7-last-subject', person.id); // the image inbox pre-fills this person
  // a profile opened by link or bookmark makes its own case current — every
  // save on this page (family, evidence, claims) lands where the person lives
  if (person.case_id !== ctx.caseId) await ctx.setCaseId(person.case_id);

  const [aliases, addresses, rels, events, links, questions, status] = await Promise.all([
    store.listAliases(person.id),
    store.listAddresses(person.id),
    store.listRelationshipsForPerson(person.id),
    store.listEventsForPerson(person.id),
    store.listLinksForTarget('person', person.id),
    store.listQuestions(ctx.caseId),
    evidenceStatusForPerson(store, person.id),
  ]);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="subject-head">
          <div class="avatar" id="avatar" title="${person.photo_path || person.photo_url ? 'Change picture' : 'Add a picture'}">
            <span class="initials">${person.display_name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            <span class="hint">${person.photo_path || person.photo_url ? 'change' : '+ picture'}</span>
          </div>
          <div class="stack" style="gap:0">
            <div class="row between">
              <div class="mono" style="color:var(--text-3);font-size:11px">
                ${person.ref_code || ''} ${person.kind !== 'person' ? '· ' + person.kind : ''} · <span class="chip">${person.status}</span>
                ${person.occupation ? ` · <span style="color:var(--text-2)">${person.occupation}</span>` : ''}
              </div>
              <button class="btn btn-ghost btn-sm" id="edit-person-btn">Edit</button>
            </div>
            <div class="basics-strip" id="basics-strip"></div>
            ${aliases.length ? `<div class="row wrap" style="margin-top:12px;gap:6px">${aliases.map((a) => `<span class="chip">${a.alias} · ${a.kind}</span>`).join('')}</div>` : ''}
            ${person.notes ? `<p style="margin-top:8px;color:var(--text-3);font-size:12px">${person.notes}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="tab-strip" id="tab-strip">${TABS.map(([k, l]) => `<a href="#/subject/${person.id}${k === 'profile' ? '' : '/' + k}" class="${k === tab ? 'active' : ''}">${l}</a>`).join('')}</div>
      ${tab !== 'profile' ? '<div id="tab-body"></div>' : `
      <div class="panel">
        <div class="row between"><div class="panel-title" style="margin:0">Profile</div><button class="btn btn-ghost btn-sm" id="edit-person-btn-2">Edit</button></div>
        <div class="profile-grid" id="profile-grid"></div>
        <div class="field" style="margin-top:16px">
          <label>Import information — paste anything, it saves what it recognises</label>
          <textarea id="pi-text" placeholder="dob 15th sept 2024&#10;Russian&#10;female, married, born in Moscow&#10;aka Masha" style="min-height:64px;font-family:var(--font-mono);font-size:12px"></textarea>
        </div>
        <div class="row" style="gap:8px;align-items:center">
          <button class="btn btn-primary btn-sm" id="pi-save">Save what's recognised</button>
          <span class="mono" style="font-size:11px;color:var(--text-3)">dates · nationality · gender · marital · birthplace · death · occupation · aka</span>
        </div>
        <div id="pi-result"></div>
        <div class="field" style="margin-top:16px">
          <label>Look up</label>
          <div class="row" style="gap:8px">
            <input type="text" id="lk-name" value="${esc(person.display_name)}" style="flex:1">
            <button class="btn btn-ghost btn-sm" id="lk-search">Look up</button>
            <button class="btn btn-ghost btn-sm" id="lk-works" title="Albums, EPs, singles and songs with their release dates — from Wikidata, as the record">+ Works</button>
            <button class="btn btn-ghost btn-sm" id="lk-family" title="Parents, siblings, children, spouse, godchildren — straight into this case, with their profiles">Insert family</button>
          </div>
        </div>
        <div id="lk-results" class="stack" style="gap:4px"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Timeline</div>
        <div id="timeline-list" class="stack" style="gap:10px"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Chart</div>
        <div id="chart-slot"></div>
      </div>

      <div class="panel">
        <div class="row between" style="margin-bottom:12px">
          <div class="panel-title" style="margin:0">Contradictions <span class="mono" style="color:var(--text-3);font-size:11px" id="contra-count"></span></div>
          <a href="#/subject/${person.id}/contradictions" class="btn btn-ghost btn-sm">All →</a>
        </div>
        <div id="contra-list" class="stack" style="gap:12px"></div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Addresses</div>
          <div id="address-list" class="stack" style="gap:6px"></div>
        </div>
        <div class="panel">
          <div class="panel-title">Relations</div>
          <div id="rel-list" class="stack" style="gap:6px"></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="row between" style="gap:8px;margin-bottom:var(--sp-3)">
            <div class="panel-title" style="margin:0">Open questions</div>
            <button class="btn btn-ghost btn-sm" id="ask-btn" title="A question about this person — it lands on the Questions tab with its theories">+ Ask about ${person.display_name.split(/\s+/)[0]}</button>
          </div>
          <div id="ask-slot"></div>
          <div id="question-list" class="stack" style="gap:2px"></div>
        </div>
        <div class="panel">
          <div class="panel-title">Attached evidence</div>
          <div id="evidence-list" class="stack" style="gap:2px"></div>
        </div>
      </div>`}
    </div>
  `;

  // profile picture: stored asset first, remote Wikipedia URL as fallback; tap to replace
  const avatar = root.querySelector('#avatar');
  const showPhoto = (src) => {
    if (!src) return;
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    img.addEventListener('load', () => { avatar.querySelector('.initials')?.remove(); });
    img.addEventListener('error', () => img.remove());
    avatar.prepend(img);
  };
  if (person.photo_path) resolveAssetUrl(person.photo_path, 'image/jpeg').then((u) => showPhoto(u || person.photo_url));
  else if (person.photo_url) showPhoto(person.photo_url);
  avatar.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      const meta = await store.storeEvidenceFile(await compressImage(f));
      await store.updatePerson(person.id, { photo_path: meta.file_path, photo_url: null });
      queueUpload(meta.file_path, meta.mime);
      flushUploads();
      render(root, ctx, personId, tab); // the avatar sits on every tab — stay on the one she is on
    });
    input.click();
  });

  const openEdit = () => ctx.openDrawer((body) => renderEditForm(body, ctx, person));
  root.querySelector('#edit-person-btn').addEventListener('click', openEdit);

  // ---- basics: strip under the name + the Profile grid (same facts, two densities) ----
  // marital status is read from the map (a spouse relationship) unless she's set an override
  let spouseName = null;
  for (const r of rels) {
    if (r.kind !== 'spouse') continue;
    const other = await store.getPerson(r.a_id === person.id ? r.b_id : r.a_id);
    if (other) { spouseName = other.display_name; break; }
  }
  const marital = person.marital_status
    ? person.marital_status + (spouseName ? ` · ${spouseName}` : '')
    : (spouseName ? `Married · ${spouseName}` : null);
  const born = bornText(person);
  const age = ageText(person);
  const basics = [
    { key: 'age', text: age === 'unknown' ? null : `<b style="font-weight:500;color:var(--text)">${age}</b>${born ? ` <span style="color:var(--text-3)">born ${born}</span>` : ''}`, missing: 'age' },
    { key: 'gender', text: person.gender || null, missing: 'gender' },
    { key: 'nationality', text: person.nationality || null, missing: 'nationality' },
    { key: 'birth_place', text: person.birth_place ? `born ${person.birth_place}` : null, missing: 'birthplace' },
    { key: 'marital', text: marital, missing: 'marital status' },
  ];
  const strip = root.querySelector('#basics-strip');
  strip.innerHTML = basics.map((b) => b.text ? `<span>${b.text}</span>` : `<span class="missing" title="Tap to fill in">— <span style="font-size:10px">${b.missing}</span></span>`).join('<span class="sep">·</span>');
  strip.querySelectorAll('.missing').forEach((el) => el.addEventListener('click', openEdit));

  // any other tab: mount that page under the header and stop here
  if (tab !== 'profile') {
    const mod = await TAB_MODULES[tab]();
    await mod.render(root.querySelector('#tab-body'), ctx, personId);
    ctx.setTitle(person.display_name);
    return;
  }

  root.querySelector('#chart-slot').appendChild(chartPanel(person, status));
  root.querySelector('#edit-person-btn-2').addEventListener('click', openEdit);

  const grid = root.querySelector('#profile-grid');
  const row = (k, v) => `<span class="k">${k}</span><span class="v${v ? '' : ' empty'}">${v || '—'}</span>`;
  grid.innerHTML = [
    row('Born', born ? `${born}${person.birth_place ? ' · ' + person.birth_place : ''}` : null),
    row('Age', age === 'unknown' ? null : age),
    row('Died', person.death_date ? fmtLongDate(person.death_date) : null),
    row('Gender', person.gender),
    row('Nationality', person.nationality),
    row('Marital', marital ? `${marital}${!person.marital_status && spouseName ? ' <span style="color:var(--text-3);font-size:10px">(from relationships)</span>' : ''}` : null),
    row('Occupation', person.occupation),
    row('Ref · status', `${person.ref_code || '—'} · ${person.status}`),
  ].join('');

  // ---- import information: paste, parse, save, report ----
  root.querySelector('#pi-save').addEventListener('click', async () => {
    const btn = root.querySelector('#pi-save');
    const text = root.querySelector('#pi-text').value;
    const resultEl = root.querySelector('#pi-result');
    clearInlineNote(btn);
    const parsed = parseProfileText(text);
    if (!parsed.recognised.length) {
      inlineNote(btn, text.trim() ? `Nothing recognised in that. Try "dob 15 Sept 2024", "Russian", "female", "married", "born in Moscow", "died 2020", "aka …".` : 'Paste something first.');
      return;
    }
    if (Object.keys(parsed.fields).length) await store.updatePerson(person.id, parsed.fields);
    for (const a of parsed.aliases) await store.createAlias({ person_id: person.id, alias: a.alias, kind: a.kind });
    const saved = parsed.recognised.map((r) => `${r.label}: ${r.value}`).join(' · ');
    const skipped = parsed.unrecognised.length ? ` Not recognised (left alone): ${parsed.unrecognised.map((u) => `“${u}”`).join(', ')}` : '';
    sessionStorage.setItem('c7-pi-result', `Saved — ${saved}.${skipped}`);
    render(root, ctx, personId);
  });
  // ---- Wikipedia / Wikidata lookup: search, pick, draft through Review ----
  root.querySelector('#lk-search').addEventListener('click', async () => {
    const btn = root.querySelector('#lk-search');
    const resultsEl = root.querySelector('#lk-results');
    clearInlineNote(btn);
    resultsEl.innerHTML = '';
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(root.querySelector('#lk-name').value); }
    catch (e) { inlineNote(btn, `Couldn't reach Wikidata — ${e.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = 'Look up';
    if (!matches.length) {
      if (!btn.nextElementSibling?.classList.contains('inline-note')) inlineNote(btn, 'No match on Wikidata — likely a private person, which is fine; the paste box above still works.');
      return;
    }
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${m.label}</div><div class="sub">${m.description || 'no description'} · ${m.id}</div></div><span class="chip brass">Use this ▸</span>`;
      row.addEventListener('click', async () => {
        resultsEl.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)">Fetching facts and their sources…</div>';
        try {
          const facts = await fetchProfile(m.id);
          const { drafted } = await draftFromLookup(store, ctx.caseId, person.id, facts);
          const n = drafted.length;
          resultsEl.innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">${n ? `${n} fact${n === 1 ? '' : 's'} drafted to Review (${drafted.join(', ')}), each citing Wikidata` : 'Nothing draftable on that record'} — a Wikipedia evidence item is linked to ${person.display_name}${facts.photoUrl ? ', and their picture is saved' : ''}. <a href="#/review" style="color:var(--brass)">Open Review →</a></div>`;
          // show the new picture — unless she has already moved on (the
          // timer must never paint this profile over another page)
          if (facts.photoUrl) setTimeout(() => { if (root.contains(resultsEl)) render(root, ctx, personId, tab); }, 1200);
        } catch (e) {
          resultsEl.innerHTML = `<div class="inline-note">Lookup failed — ${e.message}</div>`;
        }
      });
      resultsEl.appendChild(row);
    }
  });

  // ---- Insert family: pick the Wikidata record, then everyone comes in with their profiles ----
  root.querySelector('#lk-family').addEventListener('click', async () => {
    const btn = root.querySelector('#lk-family');
    const resultsEl = root.querySelector('#lk-results');
    clearInlineNote(btn);
    resultsEl.innerHTML = '';
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(root.querySelector('#lk-name').value); }
    catch (e) { inlineNote(btn, `Couldn't reach Wikidata — ${e.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = 'Insert family';
    if (!matches.length) { inlineNote(btn, 'No match on Wikidata — a family can only be read from a public record.'); return; }
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${m.label}</div><div class="sub">${m.description || 'no description'} · ${m.id}</div></div><span class="chip brass">Insert family from this ▸</span>`;
      row.addEventListener('click', async () => {
        resultsEl.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)" id="lk-progress">Reading the family…</div>';
        const prog = resultsEl.querySelector('#lk-progress');
        try {
          const r = await insertFamily(store, ctx.caseId, person.id, m.id, (msg) => { prog.textContent = `Inserting family… ${msg}`; });
          const bits = [
            r.created.length ? `${r.created.length} new ${r.created.length === 1 ? 'person' : 'people'} with their profiles` : null,
            r.linked.length ? `${r.linked.length} already here (${r.linked.join(', ')})` : null,
            `${r.relationships} relationship${r.relationships === 1 ? '' : 's'} drawn`,
            r.pictures ? `${r.pictures} picture${r.pictures === 1 ? '' : 's'}` : null,
            r.failed.length ? `couldn't read ${r.failed.join(', ')}` : null,
          ].filter(Boolean).join(' · ');
          sessionStorage.setItem('c7-pi-result', r.total ? `Family inserted — ${bits}. Everything cites Wikidata; relationships arrive unconfirmed.` : 'Wikidata lists no relatives on that record.');
          ctx.rerender();
        } catch (e) {
          resultsEl.innerHTML = `<div class="inline-note">Insert family failed — ${e.message}</div>`;
        }
      });
      resultsEl.appendChild(row);
    }
  });

  // ---- Works (her ask, 2026-09-04): albums / EPs / singles / songs with release
  // dates, from the person's Wikidata item, as the record — pick the types, tick
  // the works, Add; each becomes a 'release' event citing P577.
  root.querySelector('#lk-works').addEventListener('click', async () => {
    const btn = root.querySelector('#lk-works');
    const resultsEl = root.querySelector('#lk-results');
    clearInlineNote(btn);
    resultsEl.innerHTML = '';
    btn.disabled = true; btn.textContent = 'Searching…';
    let matches = [];
    try { matches = await searchPeople(root.querySelector('#lk-name').value); }
    catch (e) { inlineNote(btn, `Couldn't reach Wikidata — ${e.message}. Are you online?`); }
    btn.disabled = false; btn.textContent = '+ Works';
    // the profile's own item comes first when it already knows one
    if (person.wikidata_id && !matches.some((m) => m.id === person.wikidata_id)) matches.unshift({ id: person.wikidata_id, label: person.display_name, description: 'this profile’s own Wikidata record' });
    if (!matches.length) { inlineNote(btn, 'No match on Wikidata — works can only be read from a public record.'); return; }
    const showPicker = async (m) => {
      resultsEl.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)">Reading their works from Wikidata…</div>';
      let works = [];
      try { works = await fetchWorks(m.id); }
      catch (e) { resultsEl.innerHTML = `<div class="inline-note">Works could not be read — ${e.message}</div>`; return; }
      if (!works.length) { resultsEl.innerHTML = '<div class="inline-note">Wikidata lists no albums, EPs, singles or songs on that record.</div>'; return; }
      const existing = new Set((await store.listEventsForPerson(person.id)).map((e) => e.wikidata_id).filter(Boolean));
      const on = new Set(WORK_GROUPS.map((g) => g.key));
      const picked = new Set(works.filter((w) => !existing.has(w.qid)).map((w) => w.qid));
      const countNew = () => works.filter((w) => on.has(w.group) && picked.has(w.qid) && !existing.has(w.qid)).length;
      const paint = () => {
        const shown = works.filter((w) => on.has(w.group));
        const already = works.filter((w) => existing.has(w.qid)).length;
        const n = countNew();
        resultsEl.innerHTML = `
          <div class="row wrap" style="gap:6px;margin:8px 0;align-items:center">
            ${WORK_GROUPS.map((g) => { const c = works.filter((w) => w.group === g.key).length; return c ? `<button type="button" class="chip ${on.has(g.key) ? 'brass' : ''}" data-g="${g.key}" style="cursor:pointer;border:0" title="${on.has(g.key) ? 'Hide' : 'Show'} ${g.label.toLowerCase()}">${g.label} · ${c}</button>` : ''; }).join('')}
            ${already ? `<span class="mono" style="font-size:11px;color:var(--text-3);margin-left:auto">${already} already here</span>` : ''}
          </div>
          <div class="stack" style="gap:2px;max-height:320px;overflow:auto">
            ${shown.map((w) => `<label class="list-row" style="min-height:32px;padding:4px 8px;gap:8px;cursor:pointer"><input type="checkbox" data-w="${w.qid}" ${existing.has(w.qid) ? 'checked disabled' : picked.has(w.qid) ? 'checked' : ''}><span class="mono" style="font-size:11px;color:var(--text-3);width:82px;flex:none">${w.date || w.year || '—'}</span><span class="main" style="font-size:12px">${w.label}</span><span class="chip">${w.typeLabel}</span></label>`).join('')}
          </div>
          <div class="row wrap" style="gap:8px;margin-top:8px;align-items:center"><button class="btn btn-primary btn-sm" id="wk-add" ${n ? '' : 'disabled'}>Add ${n} work${n === 1 ? '' : 's'}</button><span style="font-size:11px;color:var(--text-3)">Each becomes a release on the timeline and the Board, citing Wikidata; the date keeps its real precision.</span></div>`;
        resultsEl.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.g; if (on.has(k)) on.delete(k); else on.add(k); paint(); }));
        resultsEl.querySelectorAll('[data-w]').forEach((cb) => cb.addEventListener('change', () => {
          if (cb.checked) picked.add(cb.dataset.w); else picked.delete(cb.dataset.w);
          const nn = countNew(); const ab = resultsEl.querySelector('#wk-add'); ab.disabled = !nn; ab.textContent = `Add ${nn} work${nn === 1 ? '' : 's'}`;
        }));
        resultsEl.querySelector('#wk-add').addEventListener('click', async () => {
          const list = works.filter((w) => on.has(w.group) && picked.has(w.qid) && !existing.has(w.qid));
          resultsEl.innerHTML = '<div class="inline-note" style="border-left-color:var(--brass)" id="wk-prog">Adding works…</div>';
          const prog = resultsEl.querySelector('#wk-prog');
          const r = await addWorks(store, ctx.caseId, person.id, list, (msg) => { prog.textContent = `Adding works… ${msg}`; });
          sessionStorage.setItem('c7-pi-result', `${r.added} work${r.added === 1 ? '' : 's'} added from Wikidata${r.undated ? ` (${r.undated} without a release date)` : ''}${r.skipped ? ` · ${r.skipped} already here` : ''}. Each cites Wikidata; they read on the timeline and the Board.`);
          ctx.rerender();
        });
      };
      paint();
    };
    for (const m of matches) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${m.label}</div><div class="sub">${m.description || 'no description'} · ${m.id}</div></div><span class="chip brass">Their works ▸</span>`;
      row.addEventListener('click', () => showPicker(m));
      resultsEl.appendChild(row);
    }
  });

  // a brand-new person-case offers Look up once — one tap to confirm, never automatic
  if (sessionStorage.getItem('c7-offer-lookup')) {
    sessionStorage.removeItem('c7-offer-lookup');
    const offer = document.createElement('div');
    offer.className = 'inline-note';
    offer.style.borderLeftColor = 'var(--brass)';
    offer.innerHTML = `Public figure? <button class="btn btn-primary btn-sm" id="lk-offer" style="margin:0 6px">Look up ${person.display_name} on Wikipedia</button> <span style="color:var(--text-3)">— facts go to Review first, nothing is saved blind.</span>`;
    root.querySelector('#lk-results').before(offer);
    offer.querySelector('#lk-offer').addEventListener('click', () => { offer.remove(); root.querySelector('#lk-search').click(); root.querySelector('#lk-results').scrollIntoView({ block: 'center' }); });
  }

  const lastResult = sessionStorage.getItem('c7-pi-result');
  if (lastResult) {
    sessionStorage.removeItem('c7-pi-result');
    const note = document.createElement('div');
    note.className = 'inline-note';
    note.style.borderLeftColor = 'var(--green)';
    note.textContent = lastResult;
    root.querySelector('#pi-result').appendChild(note);
  }

  // addresses
  const addrEl = root.querySelector('#address-list');
  if (!addresses.length) {
    addrEl.appendChild(emptyState({ missing: 'No addresses on file.', why: 'Nothing has been logged for this person yet.' }));
  } else {
    for (const a of addresses) {
      const row = document.createElement('div');
      row.innerHTML = `<div>${a.label}</div><div class="mono" style="color:var(--text-3);font-size:11px">${a.from_year || '?'}–${a.to_year || 'present'}</div>`;
      addrEl.appendChild(row);
    }
  }

  // relations — one line each. Confirming happens IN PLACE: the old handler
  // re-rendered the whole page, which threw her back to the top ("when I
  // confirm, the page skips to something else", 2026-09-03). "Confirm all"
  // clears the unconfirmed ones in one tap; Review takes them one by one.
  // The per-row confidence bar went: every row said 70, so it said nothing.
  const relEl = root.querySelector('#rel-list');
  if (!rels.length) {
    relEl.appendChild(emptyState({ missing: 'No relationships recorded.', why: 'Add family, household or associate links from the Relations map.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
  } else {
    const bulk = document.createElement('div');
    bulk.className = 'row wrap';
    bulk.style.cssText = 'gap:8px;margin-bottom:6px';
    bulk.innerHTML = `<button class="btn btn-ghost btn-sm" id="rel-confirm-all"></button><a class="btn btn-ghost btn-sm" href="#/review" style="text-decoration:none">Review them one by one</a>`;
    relEl.appendChild(bulk);
    const labelled = []; // [label element, relationship] — so Confirm all can repaint every row
    const refreshBulk = () => {
      const n = rels.filter((x) => !x.confirmed && !x.theory_id).length;
      bulk.hidden = !n;
      bulk.querySelector('#rel-confirm-all').textContent = `Confirm all ${n} unconfirmed`;
    };
    // the toggle is rebuilt on every flip so its listeners always match its state
    const setToggle = (label, r) => {
      const btn = document.createElement('button');
      btn.className = `linklike rel-toggle${r.confirmed ? '' : ' brass'}`;
      btn.title = r.confirmed ? 'Confirmed — tap twice to make it unconfirmed' : 'Unconfirmed — tap to confirm';
      btn.textContent = r.confirmed ? 'confirmed ✓' : 'unconfirmed · confirm';
      const old = label.querySelector('.rel-toggle');
      if (old) old.replaceWith(btn); else label.appendChild(btn);
      if (r.confirmed) {
        twoTapConfirm(btn, { confirmLabel: 'Really un-confirm?', onConfirm: async () => { await store.upsertRelationship({ id: r.id, confirmed: 0 }); r.confirmed = 0; setToggle(label, r); refreshBulk(); } });
      } else {
        btn.addEventListener('click', async () => { await store.upsertRelationship({ id: r.id, confirmed: 1 }); r.confirmed = 1; setToggle(label, r); refreshBulk(); });
      }
    };
    bulk.querySelector('#rel-confirm-all').addEventListener('click', async () => {
      for (const r of rels) if (!r.confirmed && !r.theory_id) { await store.upsertRelationship({ id: r.id, confirmed: 1 }); r.confirmed = 1; }
      for (const [label, r] of labelled) setToggle(label, r);
      refreshBulk();
    });
    for (const r of rels) {
      const otherId = r.a_id === person.id ? r.b_id : r.a_id;
      const other = await store.getPerson(otherId);
      if (!other) continue;
      const mySign = signFor(exactBirth(person));
      const otherSign = signFor(exactBirth(other));
      const unsettled = !(mySign.ok && !mySign.boundary && otherSign.ok && !otherSign.boundary);
      const kind = unsettled ? null : relation(mySign.animalIndex, otherSign.animalIndex);

      const row = document.createElement('div');
      row.className = 'row between';
      row.style.gap = '8px';
      const dirLabel = r.kind === 'parent' ? (r.a_id === person.id ? 'parent of' : 'child of')
        : r.kind === 'godparent' ? (r.a_id === person.id ? 'godparent of' : 'godchild of')
        : r.kind;
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.cssText = 'gap:8px;min-width:0;flex:1 1 auto';
      wrap.appendChild(relationGlyph(kind || 'neutral', { unsettled }));
      const label = document.createElement('span');
      label.innerHTML = `<a href="#/subject/${other.id}" style="color:var(--text)">${other.display_name}</a> <span class="mono" style="color:var(--text-3);font-size:11px">${dirLabel}${r.theory_id ? '' : ' · '}</span>`;
      if (r.theory_id) {
        // a theory link: named, never confirmed — it belongs to a theory timeline, not the record
        label.insertAdjacentHTML('beforeend', ' <span class="chip violet" title="From a theory timeline — not the record, never up for confirming">theory</span>');
      } else {
        setToggle(label, r);
        labelled.push([label, r]);
      }
      wrap.appendChild(label);
      row.appendChild(wrap);
      const conf = document.createElement('span');
      conf.className = 'mono';
      conf.style.cssText = 'font-size:11px;color:var(--text-3);flex:none';
      conf.title = 'Confidence';
      conf.textContent = r.confidence;
      row.appendChild(conf);
      relEl.appendChild(row);
    }
    refreshBulk();
  }

  // timeline: events + linked evidence, merged and sorted
  const timelineEl = root.querySelector('#timeline-list');
  const timelineItems = [];
  for (const e of events) {
    const evLinks = await store.listLinksForTarget('event', e.id);
    // a theory-timeline event shows here dimmed and marked (her call, 2026-09-04) — visible in context, never counted as the record
    // dates print at their real precision — a month-precision release must never read as the 1st of the month
    const when = e.date_precision === 'day' && e.date ? fmtLongDate(e.date)
      : e.date_precision === 'month' && e.date ? new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      : e.date_year_min ? (e.date_year_max && e.date_year_max !== e.date_year_min ? `${e.date_year_min}–${e.date_year_max}` : String(e.date_year_min))
      : (e.date ? fmtLongDate(e.date) : null);
    timelineItems.push({ kind: 'event', date: e.date || (e.date_year_min ? `${e.date_year_min}` : null), when, title: e.theory_id ? `${e.title} <span class="chip violet" title="From a theory timeline — not the record">theory</span>` : e.title, sub: e.theory_id ? (e.songs ? `♪ ${e.songs}` : 'theory') : (e.kind === 'release' ? 'release · Wikidata' : e.kind), links: evLinks, theory: !!e.theory_id, release: e.kind === 'release' });
  }
  for (const l of links) {
    timelineItems.push({ kind: 'evidence', date: null, title: l.evidence_title, sub: `${l.evidence_type} · ${verificationLabel(l.evidence_verification)}`, verification: l.evidence_verification, evidenceId: l.evidence_id });
  }
  timelineItems.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);

  if (!timelineItems.length) {
    timelineEl.appendChild(emptyState({ missing: 'Nothing on this timeline yet.', why: 'Add events or link evidence to this person from Evidence or Import.' }));
  } else {
    for (const item of timelineItems) {
      const card = document.createElement('div');
      card.className = 'card';
      const conf = item.evidenceId
        ? verificationConfidence(item.verification)
        : (item.links && item.links.length ? Math.max(...item.links.map((l) => verificationConfidence(l.evidence_verification))) : 0);
      card.innerHTML = `
        <div class="row between">
          <div>
            <div>${item.title}</div>
            <div class="mono" style="color:var(--text-3);font-size:11px">${item.when || item.date ? (item.when || item.date) + ' · ' : ''}${item.sub}</div>
          </div>
        </div>
      `;
      if (!item.theory && !item.release) card.appendChild(barRow({ label: 'confidence', value: conf, max: 100 })); // a theory entry is not a claim; a release already cites Wikidata
      if (item.evidenceId) card.addEventListener('click', () => ctx.navigate('#/evidence'));
      timelineEl.appendChild(card);
    }
  }

  // contradictions — the first three here, the full list on its own page
  const contras = await store.listContradictionsForPerson(person.id);
  root.querySelector('#contra-count').textContent = contras.length ? `· ${contras.length}` : '';
  renderPairs(root.querySelector('#contra-list'), ctx, contras.slice(0, 3), { onDeleted: () => render(root, ctx, personId) });
  if (contras.length > 3) {
    const more = document.createElement('a');
    more.href = `#/contradictions/${person.id}`;
    more.className = 'btn btn-ghost btn-sm';
    more.textContent = `and ${contras.length - 3} more →`;
    root.querySelector('#contra-list').appendChild(more);
  }

  // open questions — this person's own first; the rest of the case's are a
  // count with a door to the Questions tab. "+ Ask" adds one in place (her
  // Questions & theories, 2026-09-03).
  const qEl = root.querySelector('#question-list');
  const topLevel = questions.filter((q) => !q.parent_id && !q.resolved);
  const mine = topLevel.filter((q) => q.person_id === person.id);
  const others = topLevel.length - mine.length;
  const theoryCount = (qid) => questions.filter((q) => q.parent_id === qid).length;
  const questionRow = (q) => {
    const row = document.createElement('div');
    row.className = 'list-row';
    const n = theoryCount(q.id);
    const leaning = questions.some((t) => t.parent_id === q.id && t.pick);
    row.innerHTML = `<div class="main"><div class="title" style="font-size:12px">${q.text}</div></div><span class="chip ${leaning ? 'brass' : ''}">${leaning ? '★ leaning' : n ? `${n} theor${n === 1 ? 'y' : 'ies'}` : 'open'}</span>`;
    row.addEventListener('click', () => ctx.navigate(`#/subject/${person.id}/questions`));
    return row;
  };
  if (!mine.length && !others) {
    qEl.appendChild(emptyState({ missing: 'No open questions yet.', why: 'Ask one above, or raise one from Review — theories and their evidence live on the Questions tab.' }));
  } else {
    for (const q of mine) qEl.appendChild(questionRow(q));
    if (others) {
      const more = document.createElement('div');
      more.className = 'list-row';
      more.innerHTML = `<div class="main"><div class="sub">${others} more about ${others === 1 ? 'the case or someone else' : 'the case and others'} →</div></div>`;
      more.addEventListener('click', () => ctx.navigate(`#/subject/${person.id}/questions`));
      qEl.appendChild(more);
    }
  }
  root.querySelector('#ask-btn').addEventListener('click', () => {
    const slot = root.querySelector('#ask-slot');
    if (slot.querySelector('.inline-form')) return;
    slot.appendChild(inlineNameForm({
      placeholder: `What do you want to work out about ${person.display_name}?`,
      submitLabel: 'Ask',
      onSubmit: async (text) => {
        const id = await store.createQuestion({ case_id: ctx.caseId, person_id: person.id, text });
        slot.innerHTML = '';
        const q = { id, text, person_id: person.id, resolved: 0 };
        questions.push(q);
        qEl.querySelector('.empty-state')?.remove();
        qEl.prepend(questionRow(q));
      },
    }));
  });

  // attached evidence list
  const evEl = root.querySelector('#evidence-list');
  if (!links.length) {
    evEl.appendChild(emptyState({ missing: 'No evidence linked to this person.', why: 'Link evidence from the Evidence page.', action: 'Go to Evidence', onAction: () => ctx.navigate('#/evidence') }));
  } else {
    for (const l of links) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${l.evidence_title}</div><div class="sub">${l.evidence_type}</div></div><span class="chip ${l.evidence_verification === 'two_plus' ? 'green' : l.evidence_verification === 'drafted' ? '' : 'brass'}">${verificationLabel(l.evidence_verification)}</span>`;
      row.addEventListener('click', () => ctx.navigate('#/evidence'));
      evEl.appendChild(row);
    }
  }
}

// a name may hold a quote, an ampersand or an angle bracket — O'Brien is
// fine, but `Ann "Nan" Parton` closed the value attribute and swallowed the
// rest of the field (review, 2026-09-03)
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderEditForm(body, ctx, person) {
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:16px">Edit ${esc(person.display_name)}</h3>
    <div class="field"><label>Display name</label><input type="text" id="f-name" value="${esc(person.display_name)}"></div>
    <div class="field"><label>Name at birth</label><input type="text" id="f-nab" value="${esc(person.name_at_birth)}"></div>
    <div class="field"><label>Birth date</label><input type="date" id="f-bdate" value="${person.birth_date || ''}"></div>
    <div class="field"><label>Birth precision</label>
      <select id="f-bprec">
        ${['day', 'month', 'year', 'range', 'unknown'].map((p) => `<option value="${p}" ${p === person.birth_precision ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1"><label>Year min (if range)</label><input type="number" id="f-ymin" value="${person.birth_year_min ?? ''}"></div>
      <div class="field" style="flex:1"><label>Year max (if range)</label><input type="number" id="f-ymax" value="${person.birth_year_max ?? ''}"></div>
    </div>
    <div class="field"><label>Birthplace</label><input type="text" id="f-bplace" value="${esc(person.birth_place)}"></div>
    <div class="field"><label>Death date (leave blank if living)</label><input type="date" id="f-ddate" value="${esc(person.death_date)}"></div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1"><label>Gender</label><input type="text" id="f-gender" value="${esc(person.gender)}"></div>
      <div class="field" style="flex:1"><label>Nationality</label><input type="text" id="f-nat" value="${esc(person.nationality)}"></div>
    </div>
    <div class="field"><label>Marital status — leave blank to read it from the map (a spouse relationship)</label><input type="text" id="f-marital" value="${esc(person.marital_status)}" placeholder="divorced · widowed · single…"></div>
    <div class="field"><label>Occupation</label><input type="text" id="f-occ" value="${esc(person.occupation)}"></div>
    <div class="field"><label>Notes</label><textarea id="f-notes">${esc(person.notes)}</textarea></div>
    <button class="btn btn-primary" id="save-person-btn">Save</button>
  `;
  body.querySelector('#save-person-btn').addEventListener('click', async () => {
    const ddate = body.querySelector('#f-ddate').value || null;
    await ctx.store.updatePerson(person.id, {
      display_name: body.querySelector('#f-name').value,
      name_at_birth: body.querySelector('#f-nab').value || null,
      birth_date: body.querySelector('#f-bdate').value || null,
      birth_precision: body.querySelector('#f-bprec').value,
      birth_year_min: body.querySelector('#f-ymin').value ? parseInt(body.querySelector('#f-ymin').value, 10) : null,
      birth_year_max: body.querySelector('#f-ymax').value ? parseInt(body.querySelector('#f-ymax').value, 10) : null,
      birth_place: body.querySelector('#f-bplace').value || null,
      death_date: ddate,
      death_precision: ddate ? 'day' : 'unknown',
      gender: body.querySelector('#f-gender').value || null,
      nationality: body.querySelector('#f-nat').value || null,
      marital_status: body.querySelector('#f-marital').value || null,
      occupation: body.querySelector('#f-occ').value || null,
      notes: body.querySelector('#f-notes').value || null,
    });
    ctx.closeDrawer();
    ctx.rerender();
  });
}
