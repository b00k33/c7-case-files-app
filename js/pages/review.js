import { emptyState } from '../indicators.js';

let cursor = 0;
let keyHandler = null;

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

// Turns a claim's raw value (often an object shaped for a specific table
// row) into something readable: a primary sentence, a row of short meta
// chips (kind, date...), and — only as a fallback for shapes not specially
// handled — a plain label/value list. Internal ids (person_id, a_id, b_id)
// never surface as raw text; a relationship resolves them to real names.
async function describeClaim(store, claim, value) {
  const f = claim.field;
  if (f === 'event') {
    const meta = [{ k: 'kind', v: value.kind }];
    if (value.date) meta.push({ k: 'date', v: fmtDate(value.date) });
    else if (value.date_year_min) meta.push({ k: 'date', v: `${value.date_year_min} (year only)` });
    return { title: value.title, meta };
  }
  if (f === 'birth' || f === 'death') {
    const label = f === 'birth' ? 'Born' : 'Died';
    const title = value.precision === 'day' ? `${label} ${fmtDate(value.date)}` : `${label} ${value.year} (year only)`;
    return { title, meta: [] };
  }
  if (f === 'relationship') {
    const [a, b] = await Promise.all([store.getPerson(value.a_id), store.getPerson(value.b_id)]);
    return { title: `${a?.display_name || '?'} — ${value.kind} of — ${b?.display_name || '?'}`, meta: [] };
  }
  if (f === 'person') {
    const meta = value.birth_date ? [{ k: 'born', v: fmtDate(value.birth_date) }] : [];
    return { title: value.display_name, meta };
  }
  if (f === 'alias') {
    return { title: value.alias, meta: [{ k: 'kind', v: value.kind }] };
  }
  if (f === 'address') {
    const range = [value.from_year, value.to_year].filter(Boolean).join('–');
    return { title: value.label, meta: range ? [{ k: 'years', v: range }] : [] };
  }
  if (typeof value === 'object' && value !== null) {
    const rows = Object.entries(value)
      .filter(([k, v]) => v != null && v !== '' && k !== 'person_id')
      .map(([k, v]) => ({ k, v }));
    return { title: null, meta: [], rows };
  }
  return { title: String(value), meta: [] };
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (keyHandler) { window.removeEventListener('keydown', keyHandler); keyHandler = null; }

  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Open a case from the Dashboard first.', action: 'Go to Dashboard', onAction: () => ctx.navigate('#/dashboard') }));
    return () => window.removeEventListener('keydown', keyHandler);
  }

  const claims = await store.listClaims(ctx.caseId, 'drafted');
  if (cursor >= claims.length) cursor = 0;

  root.innerHTML = `
    <div class="stack">
      <div class="row between">
        <span class="section-label">${claims.length} drafted claim${claims.length === 1 ? '' : 's'} in the queue</span>
        ${claims.length ? `<div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" id="bulk-accept">Accept all</button>
          <button class="btn btn-ghost btn-sm" id="bulk-reject">Reject all</button>
        </div>` : ''}
      </div>
      <div id="review-slot"></div>
    </div>
  `;

  const slot = root.querySelector('#review-slot');
  if (!claims.length) {
    slot.appendChild(emptyState({ missing: 'The review queue is empty.', why: 'Nothing drafted is waiting on a decision.', action: 'Go to Import', onAction: () => ctx.navigate('#/import') }));
    return;
  }

  root.querySelector('#bulk-accept').addEventListener('click', async () => {
    if (!confirm(`Accept all ${claims.length} drafted claims? Each still applies directly — none of this raises confidence beyond what evidence backs.`)) return;
    for (const c of claims) await store.decideClaim(c.id, 'accepted');
    cursor = 0;
    render(root, ctx);
  });
  root.querySelector('#bulk-reject').addEventListener('click', async () => {
    if (!confirm(`Reject all ${claims.length} drafted claims?`)) return;
    for (const c of claims) await store.decideClaim(c.id, 'rejected');
    cursor = 0;
    render(root, ctx);
  });

  const claim = claims[cursor];
  const value = JSON.parse(claim.value);
  const target = claim.target_id && claim.target_type === 'person' ? await store.getPerson(claim.target_id) : null;
  const desc = await describeClaim(store, claim, value);

  const card = document.createElement('div');
  card.className = 'review-card';
  card.innerHTML = `
    <div class="section-label">${cursor + 1} of ${claims.length} · from ${claim.origin}</div>
    <div class="field-name">${claim.field}${target ? ' — ' + target.display_name : ''}</div>
    ${desc.title ? `<div class="claim-title">${desc.title}</div>` : ''}
    ${desc.meta?.length ? `<div class="claim-meta">${desc.meta.map((m) => `<span class="meta-item"><span class="k">${m.k}</span>${m.v}</span>`).join('')}</div>` : ''}
    ${desc.rows?.length ? `<div class="claim-fields">${desc.rows.map((r) => `<div class="row-item"><span class="k">${r.k}</span><span class="v">${r.v}</span></div>`).join('')}</div>` : ''}
    ${claim.rationale ? `<div class="claim-note mono">${claim.rationale}</div>` : ''}
    <div class="claim-note" style="margin-top:12px">
      Accepting applies this directly. It does not raise any confidence figure by itself — only evidence you link afterward does that.
    </div>
    <div class="review-actions">
      <button class="btn btn-primary" id="act-accept"><span class="kbd">A</span> Accept</button>
      <button class="btn btn-ghost" id="act-skip"><span class="kbd">S</span> Skip</button>
      <button class="btn btn-ghost" id="act-edit"><span class="kbd">E</span> Edit</button>
      <button class="btn btn-danger" id="act-reject"><span class="kbd">R</span> Reject</button>
      <button class="btn btn-ghost" id="act-question"><span class="kbd">?</span> Question</button>
    </div>
    <div id="edit-slot"></div>
  `;
  slot.appendChild(card);

  async function decide(decision, rationale) {
    await store.decideClaim(claim.id, decision, rationale);
    render(root, ctx);
  }

  card.querySelector('#act-accept').addEventListener('click', () => decide('accepted'));
  card.querySelector('#act-reject').addEventListener('click', () => decide('rejected'));
  card.querySelector('#act-question').addEventListener('click', () => {
    const q = prompt('What\'s the open question?', `Unclear: ${claim.field}${target ? ' for ' + target.display_name : ''}`);
    if (q != null) decide('question', q);
  });
  card.querySelector('#act-skip').addEventListener('click', () => {
    cursor = (cursor + 1) % claims.length;
    render(root, ctx);
  });
  card.querySelector('#act-edit').addEventListener('click', () => {
    const editSlot = card.querySelector('#edit-slot');
    editSlot.innerHTML = `<div class="field" style="margin-top:12px"><label>Edit value before accepting</label><input type="text" id="edit-value" value="${typeof value === 'string' ? value : JSON.stringify(value)}"></div><button class="btn btn-sm" id="edit-save">Save & accept</button>`;
    editSlot.querySelector('#edit-save').addEventListener('click', async () => {
      const raw = editSlot.querySelector('#edit-value').value;
      let newValue;
      try { newValue = JSON.parse(raw); } catch { newValue = raw; }
      await store.decideClaim(claim.id, 'rejected', 'superseded by an edited value');
      await store.createClaim({ case_id: claim.case_id, target_type: claim.target_type, target_id: claim.target_id, field: claim.field, value: newValue, origin: claim.origin, rationale: claim.rationale });
      const fresh = await store.listClaims(ctx.caseId, 'drafted');
      const idx = fresh.findIndex((c) => c.field === claim.field && c.target_id === claim.target_id);
      await store.decideClaim(fresh[idx].id, 'accepted');
      render(root, ctx);
    });
  });

  keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    if (key === 'a') card.querySelector('#act-accept').click();
    else if (key === 's') card.querySelector('#act-skip').click();
    else if (key === 'e') card.querySelector('#act-edit').click();
    else if (key === 'r') card.querySelector('#act-reject').click();
    else if (key === '?') card.querySelector('#act-question').click();
  };
  window.addEventListener('keydown', keyHandler);

  return () => { if (keyHandler) window.removeEventListener('keydown', keyHandler); };
}
