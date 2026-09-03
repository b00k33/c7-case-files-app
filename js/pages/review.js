import { emptyState } from '../indicators.js';
import { inlineNameForm, twoTapConfirm } from '../ui.js';

let cursor = 0;
let keyHandler = null;
let decidedThisSession = 0; // fills the progress bar as she clears the queue
let sessionCounts = { accepted: 0, rejected: 0, question: 0 }; // for the finish stamp's tally

// Each claim announces what it is — colour + glyph by kind, so a death
// never reads the same as a wedding at a glance.
const KIND_STYLE = {
  birth: { accent: 'var(--green)', glyph: '◉' },
  death: { accent: 'var(--red)', glyph: '◌' },
  marriage: { accent: 'var(--brass)', glyph: '◈' },
  move: { accent: 'var(--teal)', glyph: '➔' },
  business: { accent: 'var(--violet)', glyph: '▣' },
};

function claimStyle(claim, value) {
  if (claim.field === 'event') return KIND_STYLE[value?.kind] || { accent: 'var(--brass)', glyph: '◆' };
  if (claim.field === 'birth') return KIND_STYLE.birth;
  if (claim.field === 'death') return KIND_STYLE.death;
  if (claim.field === 'relationship' || claim.field === 'relative') return { accent: 'var(--teal)', glyph: '◈' };
  if (claim.field === 'person') return { accent: 'var(--violet)', glyph: '◉' };
  return { accent: 'var(--brass)', glyph: '◆' };
}

const ID_FIELDS = ['person_id', 'a_id', 'b_id'];

function stripIds(value) {
  if (typeof value !== 'object' || value === null) return value;
  const rest = { ...value };
  for (const k of ID_FIELDS) delete rest[k];
  return rest;
}

function idFields(value) {
  if (typeof value !== 'object' || value === null) return {};
  const out = {};
  for (const k of ID_FIELDS) if (k in value) out[k] = value[k];
  return out;
}

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
  if (f === 'relative') {
    // "Add Avie Lee Owens as Dolly's mother · born 1923" — or Link, when the
    // case already has someone by that name
    const [of, people] = await Promise.all([value.of ? store.getPerson(value.of) : null, store.listPeople(claim.case_id)]);
    const existing = people.find((p) => p.display_name.trim().toLowerCase() === String(value.display_name || '').trim().toLowerCase());
    const whose = of ? `${of.display_name}’s` : 'their';
    const when = (t) => (t ? (t.precision === 'day' ? fmtDate(t.date) : String(t.year)) : null);
    const meta = [];
    if (value.birth) meta.push({ k: 'born', v: when(value.birth) });
    if (value.death) meta.push({ k: 'died', v: when(value.death) });
    meta.push({ k: 'in this case', v: existing ? 'yes — links the existing person' : 'no — creates them' });
    return { title: `${existing ? 'Link' : 'Add'} ${value.display_name} as ${whose} ${value.role}`, meta };
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
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return () => window.removeEventListener('keydown', keyHandler);
  }

  const claims = await store.listClaims(ctx.caseId, 'drafted');
  // unconfirmed relationships join the queue (her ask, 2026-09-03: "allow
  // for review") — Confirm / Skip / Remove / Question, one card each
  const rels = (await store.listRelationships(ctx.caseId)).filter((r) => !r.confirmed);
  const queue = [...claims.map((claim) => ({ claim })), ...rels.map((rel) => ({ rel }))];
  if (cursor >= queue.length) cursor = 0;
  const dups = await store.findDuplicates(ctx.caseId);
  const queueLabel = [
    claims.length ? `${claims.length} drafted claim${claims.length === 1 ? '' : 's'}` : null,
    rels.length ? `${rels.length} unconfirmed relationship${rels.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ') || 'Nothing';

  root.innerHTML = `
    <div class="stack">
      <div class="row between">
        <span class="section-label">${queueLabel} in the queue</span>
        ${queue.length ? `<div class="row" style="gap:8px">
          <button class="btn btn-ghost btn-sm" id="bulk-accept">Accept all</button>
          <button class="btn btn-ghost btn-sm" id="bulk-reject">Reject all</button>
        </div>` : ''}
      </div>
      ${dups.total ? `<div class="inline-note row between wrap" style="border-left-color:var(--brass);gap:8px;margin:0">
        <span>${[dups.claims.length ? `${dups.claims.length} claim${dups.claims.length === 1 ? ' is an exact copy' : 's are exact copies'} of others in this queue` : null,
                 dups.evidenceCount ? `${dups.evidenceCount} evidence item${dups.evidenceCount === 1 ? '' : 's'} share${dups.evidenceCount === 1 ? 's' : ''} a link with another` : null].filter(Boolean).join(' · ')}</span>
        <button class="btn btn-ghost btn-sm" id="dup-remove">Remove ${dups.total} duplicate${dups.total === 1 ? '' : 's'}</button>
      </div>` : ''}
      <div id="review-slot"></div>
    </div>
  `;
  if (dups.total) {
    twoTapConfirm(root.querySelector('#dup-remove'), {
      confirmLabel: `Really remove ${dups.total}?`,
      onConfirm: async () => { await store.removeDuplicates(ctx.caseId); cursor = 0; render(root, ctx); },
    });
  }

  const slot = root.querySelector('#review-slot');
  if (!queue.length) {
    if (decidedThisSession > 0) {
      // the payoff: the dossier gets its stamp
      const tally = [
        sessionCounts.accepted ? `${sessionCounts.accepted} accepted` : null,
        sessionCounts.rejected ? `${sessionCounts.rejected} rejected` : null,
        sessionCounts.question ? `${sessionCounts.question} question${sessionCounts.question === 1 ? '' : 's'} raised` : null,
      ].filter(Boolean).join(' · ');
      const finish = document.createElement('div');
      finish.className = 'review-finish';
      finish.innerHTML = `
        <div class="stamp">Case<br>Reviewed</div>
        <div class="finish-tally mono">${tally}</div>
        <div class="finish-note">Accepted facts are live on their people now.</div>
        <button class="btn btn-primary" id="finish-board">See it on the Board</button>
      `;
      slot.appendChild(finish);
      finish.querySelector('#finish-board').addEventListener('click', () => ctx.navigate('#/board'));
    } else {
      slot.appendChild(emptyState({ missing: 'The review queue is empty.', why: 'Nothing drafted is waiting on a decision.', action: 'Go to Import', onAction: () => ctx.navigate('#/import') }));
    }
    return;
  }

  // progress: fills as claims are decided this sitting
  const totalThisSitting = decidedThisSession + queue.length;
  const pct = Math.round((decidedThisSession / totalThisSitting) * 100);
  const progress = document.createElement('div');
  progress.className = 'review-progress';
  progress.innerHTML = `
    <div class="track"><div class="fill" style="width:${pct}%"></div></div>
    <div class="counts"><span class="done">${decidedThisSession} decided</span><span>${queue.length} to go</span></div>
  `;
  slot.appendChild(progress);

  twoTapConfirm(root.querySelector('#bulk-accept'), {
    confirmLabel: `Really accept all ${queue.length}?`,
    onConfirm: async () => {
      for (const c of claims) await store.decideClaim(c.id, 'accepted');
      for (const r of rels) await store.upsertRelationship({ id: r.id, confirmed: 1 });
      decidedThisSession += queue.length;
      sessionCounts.accepted += queue.length;
      cursor = 0;
      render(root, ctx);
    },
  });
  twoTapConfirm(root.querySelector('#bulk-reject'), {
    confirmLabel: `Really reject all ${queue.length}?`,
    onConfirm: async () => {
      for (const c of claims) await store.decideClaim(c.id, 'rejected');
      for (const r of rels) await store.deleteRelationship(r.id);
      decidedThisSession += queue.length;
      sessionCounts.rejected += queue.length;
      cursor = 0;
      render(root, ctx);
    },
  });

  const item = queue[cursor];
  if (item.rel) {
    const r = item.rel;
    const [a, b] = await Promise.all([store.getPerson(r.a_id), store.getPerson(r.b_id)]);
    const dir = r.kind === 'parent' ? 'parent of' : r.kind === 'godparent' ? 'godparent of' : r.kind;
    const card = document.createElement('div');
    card.className = 'review-card';
    card.style.setProperty('--claim-accent', 'var(--teal)');
    card.innerHTML = `
      <div class="section-label">${cursor + 1} of ${queue.length} · relationship${r.notes && /Wikidata/.test(r.notes) ? ' · from lookup' : ''}</div>
      <div class="field-name" style="margin-top:6px"><span class="kind-glyph">◈</span>${r.kind}</div>
      <div class="claim-title">${a?.display_name || '?'} — ${dir} — ${b?.display_name || '?'}</div>
      <div class="claim-meta"><span class="meta-item"><span class="k">confidence</span>${r.confidence}</span>${r.start_date ? `<span class="meta-item"><span class="k">from</span>${fmtDate(r.start_date)}</span>` : ''}</div>
      ${r.notes ? `<div class="claim-note mono">${r.notes}</div>` : ''}
      <div class="claim-note" style="margin-top:12px">Confirming marks this line as confirmed on the tree and both profiles. Removing deletes the relationship — the people stay.</div>
      <div class="review-actions">
        <button class="btn btn-primary" id="act-accept"><span class="kbd">A</span> Confirm</button>
        <button class="btn btn-ghost" id="act-skip"><span class="kbd">S</span> Skip</button>
        <button class="btn btn-danger" id="act-reject"><span class="kbd">R</span> Remove</button>
        <button class="btn btn-ghost" id="act-question"><span class="kbd">?</span> Question</button>
      </div>
    `;
    slot.appendChild(card);
    const done = (bucket) => { decidedThisSession++; sessionCounts[bucket]++; render(root, ctx); };
    card.querySelector('#act-accept').addEventListener('click', async () => { await store.upsertRelationship({ id: r.id, confirmed: 1 }); done('accepted'); });
    twoTapConfirm(card.querySelector('#act-reject'), { confirmLabel: 'Really remove?', onConfirm: async () => { await store.deleteRelationship(r.id); done('rejected'); } });
    card.querySelector('#act-skip').addEventListener('click', () => { cursor = (cursor + 1) % queue.length; render(root, ctx); });
    card.querySelector('#act-question').addEventListener('click', () => {
      if (card.querySelector('.inline-form')) return;
      card.querySelector('.review-actions').after(inlineNameForm({
        label: "What's the open question?",
        value: `Unclear: ${a?.display_name || '?'} ${dir} ${b?.display_name || '?'}`,
        submitLabel: 'Raise question',
        onSubmit: async (q) => { await store.createQuestion({ case_id: ctx.caseId, text: q }); cursor = (cursor + 1) % queue.length; sessionCounts.question++; render(root, ctx); },
      }));
    });
    keyHandler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'a') card.querySelector('#act-accept').click();
      else if (key === 's') card.querySelector('#act-skip').click();
      else if (key === 'r') card.querySelector('#act-reject').click();
      else if (key === '?') card.querySelector('#act-question').click();
    };
    window.addEventListener('keydown', keyHandler);
    return () => { if (keyHandler) window.removeEventListener('keydown', keyHandler); };
  }

  const claim = item.claim;
  const value = JSON.parse(claim.value);
  const target = claim.target_id && claim.target_type === 'person' ? await store.getPerson(claim.target_id) : null;
  const desc = await describeClaim(store, claim, value);
  const style = claimStyle(claim, value);

  const card = document.createElement('div');
  card.className = 'review-card';
  card.style.setProperty('--claim-accent', style.accent);
  card.innerHTML = `
    <div class="section-label">${cursor + 1} of ${queue.length} · from ${claim.origin}</div>
    <div class="field-name" style="margin-top:6px"><span class="kind-glyph">${style.glyph}</span>${claim.field}${target ? ' — ' + target.display_name : ''}</div>
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
    decidedThisSession++;
    if (decision in sessionCounts) sessionCounts[decision]++;
    render(root, ctx);
  }

  card.querySelector('#act-accept').addEventListener('click', () => decide('accepted'));
  card.querySelector('#act-reject').addEventListener('click', () => decide('rejected'));
  card.querySelector('#act-question').addEventListener('click', () => {
    const actions = card.querySelector('.review-actions');
    if (card.querySelector('.inline-form')) return; // already open
    actions.after(inlineNameForm({
      label: "What's the open question?",
      value: `Unclear: ${claim.field}${target ? ' for ' + target.display_name : ''}`,
      submitLabel: 'Raise question',
      onSubmit: (q) => decide('question', q),
    }));
  });
  card.querySelector('#act-skip').addEventListener('click', () => {
    cursor = (cursor + 1) % queue.length;
    render(root, ctx);
  });
  card.querySelector('#act-edit').addEventListener('click', () => {
    const editSlot = card.querySelector('#edit-slot');
    editSlot.innerHTML = `<div class="field" style="margin-top:12px"><label>Edit value before accepting</label><input type="text" id="edit-value"></div><button class="btn btn-sm" id="edit-save">Save & accept</button>`;
    // set via the DOM property, not an HTML attribute — JSON.stringify
    // output contains double quotes that would otherwise break out of a
    // value="..." attribute mid-string.
    const editInput = editSlot.querySelector('#edit-value');
    editInput.value = typeof value === 'string' ? value : JSON.stringify(stripIds(value));
    editSlot.querySelector('#edit-save').addEventListener('click', async () => {
      const raw = editInput.value;
      let newValue;
      try { newValue = JSON.parse(raw); } catch { newValue = raw; }
      // person_id / a_id / b_id are never shown for editing (there's no
      // reason to hand-retype an internal id) — restore them from the
      // original value rather than losing them.
      if (newValue && typeof newValue === 'object') newValue = { ...idFields(value), ...newValue };
      await store.decideClaim(claim.id, 'rejected', 'superseded by an edited value');
      // accept the claim we just made, by its id. Searching the queue for
      // the first match on field + person accepted a DIFFERENT drafted
      // claim whenever one existed — her edit stayed in the queue and the
      // old value went in instead (review, 2026-09-03).
      const newId = await store.createClaim({ case_id: claim.case_id, target_type: claim.target_type, target_id: claim.target_id, field: claim.field, value: newValue, origin: claim.origin, rationale: claim.rationale });
      await store.decideClaim(newId, 'accepted');
      decidedThisSession++; // one claim resolved, even though it took a reject+re-accept internally
      sessionCounts.accepted++;
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
