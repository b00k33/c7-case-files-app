import { emptyState } from '../indicators.js';

let cursor = 0;
let keyHandler = null;

function fmtValue(field, value) {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
  }
  return String(value);
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

  const card = document.createElement('div');
  card.className = 'review-card';
  card.innerHTML = `
    <div class="section-label">${cursor + 1} of ${claims.length} · from ${claim.origin}</div>
    <div class="field-name">${claim.field}${target ? ' — ' + target.display_name : ''}</div>
    <div class="value">${fmtValue(claim.field, value)}</div>
    ${claim.rationale ? `<div class="mono" style="color:var(--text-3);font-size:12px">${claim.rationale}</div>` : ''}
    <div class="mono" style="color:var(--text-3);font-size:11px;margin-top:12px">
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
