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
