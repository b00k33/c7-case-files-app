import { emptyState } from '../indicators.js';

let activeTab = 'describe';

const CLAIM_TYPES = [
  { field: 'birth_date', label: 'Birth date (existing person)', needsPerson: true, valueType: 'date' },
  { field: 'death_date', label: 'Death date (existing person)', needsPerson: true, valueType: 'date' },
  { field: 'occupation', label: 'Occupation (existing person)', needsPerson: true, valueType: 'text' },
  { field: 'notes', label: 'Note (existing person)', needsPerson: true, valueType: 'textarea' },
  { field: 'person', label: 'A new person', needsPerson: false, valueType: 'person' },
  { field: 'relationship', label: 'A relationship between two people', needsPerson: false, valueType: 'relationship' },
  { field: 'event', label: 'An event', needsPerson: false, valueType: 'event' },
  { field: 'alias', label: 'An alias (existing person)', needsPerson: true, valueType: 'alias' },
];

// ---- bulk timeline paste: a small, deterministic, pattern-based parser ----
// No network calls happen here or anywhere in this app — this is regex and
// heuristics, not language understanding. It's built to do well on
// structured input (a markdown table, or "Year — event" lines) and to be
// honest, not clever, about what it can't confidently extract.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function stripMarkdown(s) {
  return s
    .replace(/\*\*/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/\[(\d+)\]:.*/g, '') // footnote reference definitions, e.g. "[1]: https://..."
    .trim();
}

/** A full "28 June 1491" or "June 28, 1491" style date. */
function findFullDate(text) {
  const dmy = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'i');
  const mdy = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i');
  let m = text.match(dmy);
  if (m) return { day: parseInt(m[1], 10), month: MONTHS.indexOf(m[2].toLowerCase()) + 1, year: parseInt(m[3], 10) };
  m = text.match(mdy);
  if (m) return { day: parseInt(m[2], 10), month: MONTHS.indexOf(m[1].toLowerCase()) + 1, year: parseInt(m[3], 10) };
  return null;
}

/** A day+month with no year nearby — used to upgrade a year-only row's precision. */
function findInlineDayMonth(text) {
  const dayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})\\b`, 'i');
  const monthDay = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i');
  let m = text.match(dayMonth);
  if (m) return { day: parseInt(m[1], 10), month: MONTHS.indexOf(m[2].toLowerCase()) + 1 };
  m = text.match(monthDay);
  if (m) return { day: parseInt(m[2], 10), month: MONTHS.indexOf(m[1].toLowerCase()) + 1 };
  return null;
}

function detectKind(text) {
  const t = text.toLowerCase();
  if (/\bborn\b|\bbirth\b/.test(t)) return 'birth';
  if (/\bdies\b|\bdied\b|\bdeath\b/.test(t)) return 'death';
  if (/\bmarr(y|ies|ied|iage)\b|\bwedding\b/.test(t)) return 'marriage';
  if (/\bmove[ds]?\b|\brelocat/.test(t)) return 'move';
  if (/\bbusiness\b|\bcompany\b|\bventure\b|\btrade\b|\bstore\b|\bbankrupt/.test(t)) return 'business';
  return 'other';
}

function pad2(n) { return String(n).padStart(2, '0'); }

// A source citation cleans up to just its readable name. Either the whole
// cell IS a markdown-link-reference, "([The Royal Household][1])" — pull the
// name out of it — or a name is followed by that construct as a trailing
// tail, "The Royal Household ([1])" — strip the tail and keep the name.
function cleanSource(s) {
  const whole = s.trim().match(/^\(?\[([^\]]+)\](?:\[\d+\])?\)?$/);
  if (whole) return whole[1].trim();
  return s.replace(/\s*\(\[.*$/, '').trim() || s.trim();
}

/** Split one line into cells on '|', markdown-stripped, blanks dropped. */
function splitCells(line) {
  return line.split('|').map((c) => stripMarkdown(c)).filter((c) => c !== '');
}

/**
 * Given a row's cells, find the date (full date preferred, else a bare
 * year), the longest remaining cell as the event text, and — if a further
 * cell remains after dropping any short numeric "Age" cell — treat it as a
 * source citation.
 */
function cellsToRow(cells) {
  let date = null, dateCellIdx = -1;
  for (let i = 0; i < cells.length; i++) {
    const full = findFullDate(cells[i]);
    if (full) { date = full; dateCellIdx = i; break; }
  }
  if (!date) {
    for (let i = 0; i < cells.length; i++) {
      if (/^\d{4}$/.test(cells[i])) { date = { year: parseInt(cells[i], 10) }; dateCellIdx = i; break; }
    }
  }
  if (!date) return null; // header row, separator row, or nothing we can confidently read

  const rest = cells.filter((c, i) => i !== dateCellIdx && !/^\d{1,3}$/.test(c)); // drop date cell + Age-like cell
  if (!rest.length) return null;
  rest.sort((a, b) => b.length - a.length);
  const eventText = rest[0];
  const sourceText = rest.length > 1 ? cleanSource(rest[1]) : null;
  return { date, eventText, sourceText };
}

/** Turn one row into a draft-ready event shape. */
function rowToEvent({ date, eventText, sourceText }) {
  const clean = eventText.replace(/\s+/g, ' ').trim();
  const title = clean.length > 140 ? clean.slice(0, 137) + '…' : clean;
  const notes = sourceText ? `${clean}\n\nSource: ${sourceText}` : clean;
  const base = { title, kind: detectKind(clean), notes, source: sourceText };

  if (date.day && date.month) {
    return { ...base, date: `${date.year}-${pad2(date.month)}-${pad2(date.day)}`, date_precision: 'day', date_year_min: null, date_year_max: null };
  }
  const inline = findInlineDayMonth(clean);
  if (inline) {
    return { ...base, date: `${date.year}-${pad2(inline.month)}-${pad2(inline.day)}`, date_precision: 'day', date_year_min: null, date_year_max: null };
  }
  return { ...base, date: null, date_precision: 'year', date_year_min: date.year, date_year_max: date.year };
}

/**
 * Parse pasted text into an array of event rows. Handles any pipe-delimited
 * table — standard markdown (`| a | b |`), or a whole row wrapped in bold
 * (`**a | b | c**`) — with a date column (full date or bare year), an
 * optional Age column, an optional Source column, and header/separator
 * rows all detected and skipped; falls back to plain "1509 — event" lines
 * with no table at all.
 */
// A table row with no recognisable date — once we're confidently inside a
// real data table (at least one dated row already found, so this isn't the
// header) — may still be a genuine fact about the subject worth keeping,
// rather than silently dropping it.
function factFromCells(cells) {
  const candidates = cells.filter((c) => !/^\d{1,4}$/.test(c));
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0];
  return best.length >= 15 ? best : null;
}

export function parseTimelinePaste(text) {
  const lines = (text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const events = [];
  const facts = [];

  for (const line of lines) {
    if (/^\[\d+\]:/.test(line)) continue; // footnote definition line
    if (/^\|?[\s|:\-]+\|?$/.test(line)) continue; // markdown table separator row

    if (line.includes('|')) {
      const cells = splitCells(line);
      const row = cellsToRow(cells);
      if (row) { events.push(rowToEvent(row)); continue; }
      if (events.length) { // only once we're past the header row
        const fact = factFromCells(cells);
        if (fact) facts.push(fact);
      }
      continue;
    }

    const full = findFullDate(line);
    if (full) {
      const rest = stripMarkdown(line.replace(findFullDateSourceMatch(line), '')).trim();
      if (rest) { events.push(rowToEvent({ date: full, eventText: rest, sourceText: null })); continue; }
    }
    const m = line.match(/^\*{0,2}(\d{4})\*{0,2}\s*[-–—:]\s*(.+)$/);
    if (m) events.push(rowToEvent({ date: { year: parseInt(m[1], 10) }, eventText: m[2], sourceText: null }));
  }
  return { events, facts };
}

// Re-finds whichever full-date pattern matched, so it can be stripped out of
// a non-table line to leave just the event text.
function findFullDateSourceMatch(text) {
  const dmy = new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS.join('|')})\\s+\\d{4}\\b`, 'i');
  const mdy = new RegExp(`\\b(?:${MONTHS.join('|')})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'i');
  const m = text.match(dmy) || text.match(mdy);
  return m ? m[0] : '';
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Open a case from the Dashboard first.', action: 'Go to Dashboard', onAction: () => ctx.navigate('#/dashboard') }));
    return;
  }
  const people = await store.listPeople(ctx.caseId);
  const drafted = await store.listClaims(ctx.caseId, 'drafted');

  root.innerHTML = `
    <div class="stack">
      <div class="panel" style="background:var(--ink-2)">
        <p style="margin:0;color:var(--text-2);font-size:12px">
          🔒 Everything entered here arrives <b>drafted, at zero confidence</b>. Nothing lands on a person, relationship or event
          until you approve it in Review. This lock cannot be turned off.
        </p>
      </div>

      <div class="tabs" id="tabs">
        <button data-t="describe" class="${activeTab === 'describe' ? 'active' : ''}">Describe a topic</button>
        <button data-t="paste" class="${activeTab === 'paste' ? 'active' : ''}">Paste text</button>
        <button data-t="lookup" class="${activeTab === 'lookup' ? 'active' : ''}">Look up a record</button>
      </div>

      <div id="tab-body" class="panel"></div>

      <div class="panel">
        <div class="panel-title">Drafted this session, waiting on Review</div>
        <div id="drafted-list" class="stack" style="gap:2px"></div>
      </div>
    </div>
  `;

  root.querySelector('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    activeTab = btn.dataset.t;
    render(root, ctx);
  });

  const body = root.querySelector('#tab-body');
  if (activeTab === 'lookup') {
    body.appendChild(emptyState({
      missing: 'No live record lookup.',
      why: 'This app makes no network calls, by design — nothing here reaches the internet. Paste what you found elsewhere instead, using the "Paste text" tab.',
    }));
  } else if (activeTab === 'paste') {
    renderPasteTab(body, ctx, people);
  } else {
    renderClaimForm(body, ctx, people, activeTab);
  }

  const draftedEl = root.querySelector('#drafted-list');
  if (!drafted.length) {
    draftedEl.appendChild(emptyState({ missing: 'Nothing drafted yet.', why: 'Claims you submit above will queue here until reviewed.' }));
  } else {
    for (const c of drafted) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'default';
      const val = (() => { try { return JSON.parse(c.value); } catch { return c.value; } })();
      row.innerHTML = `<div class="main"><div class="title" style="font-size:12px">${c.field} — ${typeof val === 'object' ? (val.title || val.display_name || JSON.stringify(val)) : val}</div><div class="sub">${c.origin}</div></div><span class="chip">drafted</span>`;
      draftedEl.appendChild(row);
    }
    const goBtn = document.createElement('button');
    goBtn.className = 'btn btn-primary btn-sm';
    goBtn.style.marginTop = '8px';
    goBtn.textContent = 'Go to Review →';
    goBtn.addEventListener('click', () => ctx.navigate('#/review'));
    draftedEl.appendChild(goBtn);
  }
}

function renderClaimForm(body, ctx, people, origin) {
  const personOpts = people.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join('');
  body.innerHTML = `
    <div class="field">
      <label>What did you find?</label>
      <select id="c-type">${CLAIM_TYPES.map((t) => `<option value="${t.field}">${t.label}</option>`).join('')}</select>
    </div>
    <div id="c-fields"></div>
    <div class="field"><label>Where from (rationale / source note)</label><textarea id="c-rationale" placeholder="e.g. pasted from a forum thread, unconfirmed"></textarea></div>
    <button class="btn btn-primary" id="c-save">Add to review queue, drafted</button>
  `;
  const fieldsEl = body.querySelector('#c-fields');
  const typeSel = body.querySelector('#c-type');

  function drawFields() {
    const type = CLAIM_TYPES.find((t) => t.field === typeSel.value);
    fieldsEl.innerHTML = '';
    if (type.needsPerson) {
      fieldsEl.innerHTML += `<div class="field"><label>About</label><select id="c-person">${personOpts}</select></div>`;
    }
    if (type.valueType === 'date') fieldsEl.innerHTML += `<div class="field"><label>Date</label><input type="date" id="c-value"></div>`;
    else if (type.valueType === 'text') fieldsEl.innerHTML += `<div class="field"><label>Value</label><input type="text" id="c-value"></div>`;
    else if (type.valueType === 'textarea') fieldsEl.innerHTML += `<div class="field"><label>Value</label><textarea id="c-value"></textarea></div>`;
    else if (type.valueType === 'alias') fieldsEl.innerHTML += `<div class="field"><label>Alias</label><input type="text" id="c-alias"></div><div class="field"><label>Kind</label><select id="c-alias-kind">${['handle', 'maiden', 'title', 'nickname', 'other'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>`;
    else if (type.valueType === 'person') fieldsEl.innerHTML += `<div class="field"><label>Display name</label><input type="text" id="c-name"></div><div class="field"><label>Birth date, if known</label><input type="date" id="c-bdate"></div>`;
    else if (type.valueType === 'relationship') fieldsEl.innerHTML += `
      <div class="field"><label>Person A</label><select id="c-a">${personOpts}</select></div>
      <div class="field"><label>Kind</label><select id="c-kind">${['parent', 'spouse', 'sibling', 'business', 'associate', 'household'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
      <div class="field"><label>Person B</label><select id="c-b">${personOpts}</select></div>`;
    else if (type.valueType === 'event') fieldsEl.innerHTML += `
      <div class="field"><label>About</label><select id="c-person">${personOpts}</select></div>
      <div class="field"><label>Title</label><input type="text" id="c-title"></div>
      <div class="field"><label>Kind</label><select id="c-ekind">${['birth', 'death', 'marriage', 'move', 'business', 'other'].map((k) => `<option value="${k}">${k}</option>`).join('')}</select></div>
      <div class="field"><label>Date</label><input type="date" id="c-edate"></div>`;
  }
  typeSel.addEventListener('change', drawFields);
  drawFields();

  body.querySelector('#c-save').addEventListener('click', async () => {
    const type = CLAIM_TYPES.find((t) => t.field === typeSel.value);
    const rationale = body.querySelector('#c-rationale').value || null;
    let target_type = 'case', target_id = ctx.caseId, value;

    if (type.field === 'person') {
      value = { display_name: body.querySelector('#c-name').value, birth_date: body.querySelector('#c-bdate').value || null, birth_precision: body.querySelector('#c-bdate').value ? 'day' : 'unknown' };
    } else if (type.field === 'relationship') {
      value = { a_id: body.querySelector('#c-a').value, b_id: body.querySelector('#c-b').value, kind: body.querySelector('#c-kind').value };
    } else if (type.field === 'event') {
      const pid = body.querySelector('#c-person').value;
      target_type = 'person'; target_id = pid;
      value = { person_id: pid, title: body.querySelector('#c-title').value, kind: body.querySelector('#c-ekind').value, date: body.querySelector('#c-edate').value || null, date_precision: 'day' };
    } else if (type.field === 'alias') {
      target_type = 'person'; target_id = body.querySelector('#c-person').value;
      value = { alias: body.querySelector('#c-alias').value, kind: body.querySelector('#c-alias-kind').value };
    } else {
      target_type = 'person'; target_id = body.querySelector('#c-person').value;
      value = body.querySelector('#c-value').value;
    }

    await ctx.store.createClaim({ case_id: ctx.caseId, target_type, target_id, field: type.field, value, origin, rationale });
    render(document.getElementById('page-root'), ctx);
  });
}

const RELATIONSHIP_KINDS = ['parent', 'spouse', 'sibling', 'business', 'associate', 'household'];

function renderPasteTab(body, ctx, people) {
  const personOpts = people.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join('');
  let mode = people.length ? 'existing' : 'new'; // "existing" is unusable with nobody in the case yet

  body.innerHTML = `
    <div class="field">
      <label>Whose timeline is this?</label>
      <div class="row" style="gap:8px">
        <button type="button" class="btn btn-ghost btn-sm" id="mode-existing" ${people.length ? '' : 'disabled'} title="${people.length ? '' : 'No people in this case yet — start with + New person'}">Existing person</button>
        <button type="button" class="btn btn-ghost btn-sm" id="mode-new">+ New person</button>
      </div>
      <div id="mode-body" style="margin-top:12px"></div>
    </div>
    <div class="field">
      <label>Paste a table or a list of dated events</label>
      <textarea id="p-text" placeholder="| Year | Age | Major event |&#10;| 1509 | 17 | 21 April: Henry VIII becomes king |&#10;&#10;— or —&#10;1509 — Henry VIII becomes king" style="min-height:160px;font-family:var(--font-mono);font-size:12px"></textarea>
    </div>
    <p style="color:var(--text-3);font-size:11px">
      Pattern-based, not AI — no network calls happen here. Works best on markdown tables and "Year — event" lines.
      A row with only a year queues honestly as year-only precision, same as everywhere else in this app.
      A detected birth or death row also drafts the person's own birth/death fields, not just the event.
    </p>
    <button class="btn btn-primary" id="p-parse">Parse</button>
    <div id="p-preview" style="margin-top:20px"></div>
  `;

  const modeBodyEl = body.querySelector('#mode-body');
  const existingBtn = body.querySelector('#mode-existing');
  const newBtn = body.querySelector('#mode-new');
  const parseBtn = body.querySelector('#p-parse');

  function drawMode() {
    existingBtn.classList.toggle('btn-primary', mode === 'existing');
    existingBtn.classList.toggle('btn-ghost', mode !== 'existing');
    newBtn.classList.toggle('btn-primary', mode === 'new');
    newBtn.classList.toggle('btn-ghost', mode !== 'new');

    if (mode === 'existing') {
      modeBodyEl.innerHTML = people.length
        ? `<select id="p-person">${personOpts}</select>`
        : `<div class="empty-state" style="padding:16px"><p class="empty-missing" style="margin:0">No people in this case yet.</p><p class="empty-why" style="margin:4px 0 0">Switch to "+ New person," or add someone from the Relations map first.</p></div>`;
      parseBtn.disabled = !people.length;
    } else {
      modeBodyEl.innerHTML = `
        <div class="field"><label>Name</label><input type="text" id="np-name" placeholder="e.g. Arthur, Prince of Wales"></div>
        ${people.length ? `
          <div class="field"><label>Related to (optional)</label>
            <div class="row" style="gap:8px">
              <select id="np-kind"><option value="">— no relationship —</option>${RELATIONSHIP_KINDS.map((k) => `<option value="${k}">${k}</option>`).join('')}</select>
              <select id="np-b">${personOpts}</select>
            </div>
          </div>
          <p style="color:var(--text-3);font-size:11px;margin-top:-8px">For "parent," the new person is the parent of whoever's picked.</p>
        ` : ''}
      `;
      parseBtn.disabled = false;
    }
  }
  existingBtn.addEventListener('click', () => { mode = 'existing'; drawMode(); });
  newBtn.addEventListener('click', () => { mode = 'new'; drawMode(); });
  drawMode();

  parseBtn.addEventListener('click', () => {
    const text = body.querySelector('#p-text').value;
    const { events, facts } = parseTimelinePaste(text);
    const previewEl = body.querySelector('#p-preview');
    previewEl.innerHTML = '';

    if (mode === 'new' && !body.querySelector('#np-name').value.trim()) {
      previewEl.appendChild(emptyState({ missing: 'Name the new person first.', why: 'The paste needs a person to belong to.' }));
      return;
    }
    if (!events.length && !facts.length) {
      previewEl.appendChild(emptyState({
        missing: 'Nothing recognisable in that paste.',
        why: 'Expecting a markdown table with a 4-digit year column, or lines like "1509 — Henry becomes king".',
      }));
      return;
    }

    const title = document.createElement('div');
    title.className = 'panel-title';
    const parts = [];
    if (events.length) parts.push(`${events.length} event${events.length === 1 ? '' : 's'}`);
    if (facts.length) parts.push(`${facts.length} other fact${facts.length === 1 ? '' : 's'}`);
    title.textContent = `${parts.join(', ')} found — review before queuing`;
    previewEl.appendChild(title);

    const list = document.createElement('div');
    list.className = 'stack';
    list.style.gap = '4px';
    for (const r of events) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'default';
      row.innerHTML = `
        <div class="main">
          <div class="title" style="font-size:12.5px">${r.title}</div>
          <div class="sub mono">${r.date || `${r.date_year_min} (year only)`} · ${r.kind}</div>
        </div>
      `;
      list.appendChild(row);
    }
    for (const f of facts) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'default';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:12.5px">${f}</div><div class="sub mono">no date · note</div></div>`;
      list.appendChild(row);
    }
    previewEl.appendChild(list);

    const total = events.length + (facts.length ? 1 : 0);
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.style.marginTop = '16px';
    confirmBtn.textContent = mode === 'new' ? `Create person and add ${total} drafted item${total === 1 ? '' : 's'}, to Review` : `Add ${total} drafted item${total === 1 ? '' : 's'}, to Review`;
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Adding…';

      let personId, personName;
      if (mode === 'new') {
        personName = body.querySelector('#np-name').value.trim();
        const person = await ctx.store.createPerson({ case_id: ctx.caseId, display_name: personName, kind: 'person' });
        personId = person.id;
        await ctx.store.createClaim({ case_id: ctx.caseId, target_type: 'person', target_id: personId, field: 'name_at_birth', value: personName, origin: 'paste', rationale: 'from paste: new person' });
        const relKind = body.querySelector('#np-kind')?.value;
        const relB = body.querySelector('#np-b')?.value;
        if (relKind && relB) {
          await ctx.store.createClaim({ case_id: ctx.caseId, target_type: 'case', target_id: ctx.caseId, field: 'relationship', value: { a_id: personId, b_id: relB, kind: relKind }, origin: 'paste', rationale: 'from paste: new person' });
        }
      } else {
        personId = body.querySelector('#p-person').value;
        personName = people.find((p) => p.id === personId)?.display_name || '';
      }

      // A timeline about one person often mentions others in the same
      // row ("Arthur dies. Henry becomes heir.") — detectKind flags that
      // row as a death, but it isn't THIS person's death. Only draft the
      // person's own birth/death fields when their name is actually in the
      // SAME clause as the birth/death word — checking the whole title
      // isn't enough, since the subject's name can legitimately appear in
      // a neighbouring clause about someone else's death ("Henry VII dies.
      // Henry becomes King Henry VIII.").
      const KIND_KEYWORDS = { birth: /\bborn\b|\bbirth\b/i, death: /\bdies\b|\bdied\b|\bdeath\b/i };
      const mentionsPerson = (title, kind) => {
        if (!personName) return false;
        const re = KIND_KEYWORDS[kind];
        const clause = re ? title.split(/(?<=[.!?])\s+/).find((s) => re.test(s)) || title : title;
        return clause.toLowerCase().includes(personName.toLowerCase());
      };

      for (const r of events) {
        await ctx.store.createClaim({
          case_id: ctx.caseId,
          target_type: 'person',
          target_id: personId,
          field: 'event',
          value: { person_id: personId, title: r.title, kind: r.kind, date: r.date, date_precision: r.date_precision, date_year_min: r.date_year_min, date_year_max: r.date_year_max },
          origin: 'paste',
          rationale: r.source ? `Source: ${r.source}` : r.notes,
        });
        if (!mentionsPerson(r.title, r.kind)) continue;
        if (r.kind === 'birth') {
          const value = r.date ? { precision: 'day', date: r.date } : { precision: 'year', year: r.date_year_min };
          await ctx.store.createClaim({ case_id: ctx.caseId, target_type: 'person', target_id: personId, field: 'birth', value, origin: 'paste', rationale: r.notes });
        } else if (r.kind === 'death' && r.date) {
          await ctx.store.createClaim({ case_id: ctx.caseId, target_type: 'person', target_id: personId, field: 'death', value: { precision: 'day', date: r.date }, origin: 'paste', rationale: r.notes });
        }
      }
      if (facts.length) {
        await ctx.store.createClaim({ case_id: ctx.caseId, target_type: 'person', target_id: personId, field: 'notes', value: facts.join('\n\n'), origin: 'paste', rationale: 'from paste: non-dated facts' });
      }
      render(document.getElementById('page-root'), ctx);
    });
    previewEl.appendChild(confirmBtn);
  });
}
