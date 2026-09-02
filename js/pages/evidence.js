import { emptyState, verificationLabel } from '../indicators.js';
import { inlineNameForm, inlineNote, clearInlineNote, twoTapConfirm } from '../ui.js';

const TYPES = ['screenshot', 'photo', 'clipping', 'document', 'note', 'video', 'audio'];
const VERIFICATIONS = ['two_plus', 'single', 'disputed', 'dead_link', 'drafted'];
const VERIFICATION_LABEL = { two_plus: 'Two or more sources', single: 'Single source', disputed: 'Disputed', dead_link: 'Dead link', drafted: 'Drafted' };

function chipClass(v) {
  if (v === 'two_plus') return 'green';
  if (v === 'single') return 'brass';
  if (v === 'disputed' || v === 'dead_link') return 'red';
  return '';
}

let currentView = 'grid';
let filters = { type: '', verification: '' };

// one options list for every source picker: real sources, a "none", and an
// inline "+ New source…" row (same pattern as the case switcher)
function sourceOptions(sources, selectedId) {
  return '<option value="">No source</option>'
    + sources.map((s) => `<option value="${s.id}"${s.id === selectedId ? ' selected' : ''}>${s.name}${s.kind === 'dramatisation' ? ' (dramatisation)' : ''}</option>`).join('')
    + '<option value="__new">+ New source…</option>';
}

// "+ New source…" picked: swap the select for an inline mini-form (no
// prompt() — STYLE.md's no-modals law). Her call (2026-09-01): inline create
// asks just a name; kind defaults to 'secondary', editable later if it
// matters. onCreated gets the new source; onCancel restores the caller's UI.
function mountNewSourceForm(store, sel, { onCreated, onCancel }) {
  sel.style.display = 'none';
  const anchor = sel.closest('.row') || sel;
  const form = inlineNameForm({
    placeholder: 'e.g. "Sexton\'s podcast"',
    submitLabel: 'Add source',
    onSubmit: async (name) => {
      const src = await store.createSource({ name, kind: 'secondary' });
      form.remove();
      sel.style.display = '';
      await onCreated(src);
    },
    onCancel: () => { sel.style.display = ''; onCancel(); },
  });
  anchor.after(form);
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Open a case from the Dashboard first.', action: 'Go to Dashboard', onAction: () => ctx.navigate('#/dashboard') }));
    return;
  }

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <div class="tabs" id="view-tabs">
          <button data-v="grid" class="${currentView === 'grid' ? 'active' : ''}">Grid</button>
          <button data-v="board" class="${currentView === 'board' ? 'active' : ''}">Board</button>
          <button data-v="table" class="${currentView === 'table' ? 'active' : ''}">Table</button>
        </div>
        <button class="btn btn-primary" id="add-evidence-btn">+ Add evidence</button>
      </div>
      <div class="row wrap" style="gap:8px">
        <select id="f-type"><option value="">All types</option>${TYPES.map((t) => `<option value="${t}" ${filters.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="f-verify"><option value="">All verification</option>${VERIFICATIONS.map((v) => `<option value="${v}" ${filters.verification === v ? 'selected' : ''}>${VERIFICATION_LABEL[v]}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" id="copy-list-btn" title="Copy what's listed below as text — one 'Title — link' line per item">Copy list</button>
      </div>
      <div id="evidence-body"></div>
    </div>
  `;

  root.querySelector('#view-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    currentView = btn.dataset.v;
    render(root, ctx);
  });
  root.querySelector('#f-type').addEventListener('change', (e) => { filters.type = e.target.value; render(root, ctx); });
  root.querySelector('#f-verify').addEventListener('change', (e) => { filters.verification = e.target.value; render(root, ctx); });
  root.querySelector('#add-evidence-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddForm(body, ctx)));

  let items = await store.listEvidence(ctx.caseId);
  if (filters.type) items = items.filter((i) => i.type === filters.type);
  if (filters.verification) items = items.filter((i) => i.verification === filters.verification);

  // copies exactly what the current filters show — set type to "video" for
  // a clean video list. One "Title — link" line per item; no URL, no dash.
  const copyBtn = root.querySelector('#copy-list-btn');
  copyBtn.addEventListener('click', async () => {
    const text = items.map((i) => (i.original_url ? `${i.title} — ${i.original_url}` : i.title)).join('\n');
    if (!text) return;
    try { await navigator.clipboard.writeText(text); } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    const old = copyBtn.textContent;
    copyBtn.textContent = `Copied ${items.length}`;
    setTimeout(() => { copyBtn.textContent = old; }, 1500);
  });
  copyBtn.disabled = !items.length;

  const bodyEl = root.querySelector('#evidence-body');
  if (!items.length) {
    bodyEl.appendChild(emptyState({
      missing: 'No evidence matches.',
      why: 'Either nothing has been added yet, or your filters exclude everything.',
      action: '+ Add evidence',
      onAction: () => ctx.openDrawer((body) => renderAddForm(body, ctx)),
    }));
    return;
  }

  if (currentView === 'grid') renderGrid(bodyEl, ctx, items);
  else if (currentView === 'board') renderBoard(bodyEl, ctx, items);
  else renderTable(bodyEl, ctx, items);
}

function renderGrid(el, ctx, items) {
  el.style.display = 'grid';
  el.style.gridTemplateColumns = 'repeat(auto-fill, minmax(180px, 1fr))';
  el.style.gap = '12px';
  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      <div class="mono" style="font-size:10px;color:var(--text-3);text-transform:uppercase">${it.type}</div>
      <div style="margin:6px 0 2px">${it.title}</div>
      ${it.source_name ? `<div class="mono" style="font-size:10px;color:var(--text-3);margin-bottom:6px">${it.source_name}</div>` : '<div style="margin-bottom:6px"></div>'}
      <div class="row between">
        <span class="chip ${chipClass(it.verification)}">${verificationLabel(it.verification)}</span>
        ${it.dated ? `<span class="mono" style="font-size:11px;color:var(--text-3)">${it.dated}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => ctx.openDrawer((body) => renderDetail(body, ctx, it.id)));
    el.appendChild(card);
  }
}

function renderBoard(el, ctx, items) {
  el.style.display = 'flex';
  el.style.gap = '12px';
  el.style.overflowX = 'auto';
  for (const v of VERIFICATIONS) {
    const col = document.createElement('div');
    col.className = 'panel';
    col.style.flex = '0 0 220px';
    const inCol = items.filter((i) => i.verification === v);
    col.innerHTML = `<div class="panel-title">${VERIFICATION_LABEL[v]} <span class="mono" style="color:var(--text-3)">${inCol.length}</span></div>`;
    for (const it of inCol) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.style.marginBottom = '8px';
      card.innerHTML = `<div class="mono" style="font-size:10px;color:var(--text-3)">${it.type}</div><div>${it.title}</div>`;
      card.addEventListener('click', () => ctx.openDrawer((body) => renderDetail(body, ctx, it.id)));
      col.appendChild(card);
    }
    el.appendChild(col);
  }
}

function renderTable(el, ctx, items) {
  const table = document.createElement('table');
  table.className = 'dense';
  table.innerHTML = `
    <thead><tr><th>Title</th><th>Type</th><th>Source</th><th>Dated</th><th>Verification</th><th>Bytes</th></tr></thead>
    <tbody>${items.map((it) => `
      <tr data-id="${it.id}">
        <td>${it.title}</td>
        <td class="mono">${it.type}</td>
        <td>${it.source_name || '—'}</td>
        <td class="num">${it.dated || '—'}</td>
        <td><span class="chip ${chipClass(it.verification)}">${verificationLabel(it.verification)}</span></td>
        <td class="num">${it.bytes || '—'}</td>
      </tr>`).join('')}</tbody>
  `;
  table.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    ctx.openDrawer((body) => renderDetail(body, ctx, tr.dataset.id));
  });
  el.appendChild(table);
}

async function renderDetail(body, ctx, evidenceId) {
  const { store } = ctx;
  const item = await store.getEvidence(evidenceId);
  const links = await store.listLinksForEvidence(evidenceId);
  const people = ctx.caseId ? await store.listPeople(ctx.caseId) : [];
  const sources = await store.listSources();

  body.innerHTML = `
    <div class="mono" style="font-size:10px;color:var(--text-3);text-transform:uppercase">${item.type}</div>
    <h3 class="title" style="margin:6px 0 12px">${item.title}</h3>
    <div class="stack" style="gap:6px;font-size:12px">
      <div class="row between"><span class="section-label">Verification</span><span class="chip ${chipClass(item.verification)}">${verificationLabel(item.verification)}</span></div>
      <div class="row between"><span class="section-label">Source</span><select id="source-select" style="max-width:62%">${sourceOptions(sources, item.source_id)}</select></div>
      ${item.source_kind === 'dramatisation' ? '<div class="chip red" style="align-self:flex-end">dramatisation — cannot raise confidence</div>' : ''}
      <div class="row between"><span class="section-label">Captured</span><span class="mono">${item.captured_at || '—'} ${item.captured_by ? 'by ' + item.captured_by : ''}</span></div>
      <div class="row between"><span class="section-label">Content dated</span><span class="mono">${item.dated || 'unknown'} (${item.date_precision})</span></div>
      ${item.original_url ? `<div class="row between"><span class="section-label">Original URL</span><span class="mono" style="word-break:break-all">${item.original_url}</span></div>` : ''}
      ${item.file_path ? `<div class="row between"><span class="section-label">File</span><span class="mono">${item.file_path}</span></div>` : ''}
      ${item.sha256 ? `<div class="row between"><span class="section-label">SHA-256</span><span class="mono" style="word-break:break-all;font-size:10px">${item.sha256}</span></div>` : ''}
      ${item.bytes ? `<div class="row between"><span class="section-label">Size</span><span class="mono">${item.bytes} bytes</span></div>` : ''}
      ${item.duration_ms ? `<div class="row between"><span class="section-label">Duration</span><span class="mono">${Math.round(item.duration_ms / 1000)}s</span></div>` : ''}
    </div>
    ${item.notes ? `<p style="margin-top:12px;color:var(--text-2);font-size:12px">${item.notes}</p>` : ''}

    <div class="panel-title" style="margin-top:20px">Linked to</div>
    <div id="link-list" class="stack" style="gap:4px"></div>
    <div class="row" style="gap:8px;margin-top:8px">
      <select id="link-person"><option value="">Link to person…</option>${people.map((p) => `<option value="${p.id}">${p.display_name}</option>`).join('')}</select>
      <button class="btn btn-sm" id="link-btn">Link</button>
    </div>

    <div class="row" style="gap:8px;margin-top:20px">
      <select id="verify-select">${VERIFICATIONS.map((v) => `<option value="${v}" ${v === item.verification ? 'selected' : ''}>${VERIFICATION_LABEL[v]}</option>`).join('')}</select>
      <button class="btn btn-sm" id="verify-save">Update verification</button>
    </div>
    ${item.type === 'video' ? '<div id="moments-slot" style="margin-top:16px"></div>' : ''}
    <button class="btn btn-danger btn-sm" id="delete-btn" style="margin-top:20px">Delete (soft)</button>
  `;

  const linkListEl = body.querySelector('#link-list');
  if (!links.length) {
    linkListEl.appendChild(emptyState({ missing: 'Not linked to anyone yet.', why: 'Evidence with no target is easy to lose track of.' }));
  } else {
    for (const l of links) {
      const p = l.target_type === 'person' ? await store.getPerson(l.target_id) : null;
      const row = document.createElement('div');
      row.className = 'chip';
      row.textContent = p ? `${l.target_type}: ${p.display_name}` : `${l.target_type}: ${l.target_id}`;
      linkListEl.appendChild(row);
    }
  }
  body.querySelector('#link-btn').addEventListener('click', async () => {
    const pid = body.querySelector('#link-person').value;
    if (!pid) return;
    await store.linkEvidence({ evidence_id: item.id, target_type: 'person', target_id: pid });
    renderDetail(body, ctx, evidenceId);
  });

  body.querySelector('#source-select').addEventListener('change', async (e) => {
    if (e.target.value === '__new') {
      mountNewSourceForm(store, e.target, {
        onCreated: async (src) => {
          await store.updateEvidence(item.id, { source_id: src.id });
          renderDetail(body, ctx, evidenceId);
        },
        onCancel: () => renderDetail(body, ctx, evidenceId),
      });
      return;
    }
    await store.updateEvidence(item.id, { source_id: e.target.value || null });
    renderDetail(body, ctx, evidenceId);
  });

  const verifyRow = body.querySelector('#verify-save').closest('.row');
  body.querySelector('#verify-save').addEventListener('click', async () => {
    const chosen = body.querySelector('#verify-select').value;
    // her call (2026-09-01, per SPEC's "dramatisation cannot raise
    // confidence"): block, don't just warn — as an inline note, not an alert
    if ((chosen === 'single' || chosen === 'two_plus') && item.source_kind === 'dramatisation') {
      inlineNote(verifyRow, 'This item\'s source is a dramatisation — an acted retelling. A dramatisation can never raise confidence, so it can\'t be marked as a real source. If the source is set wrongly, change it above first.');
      return;
    }
    clearInlineNote(verifyRow);
    await store.updateEvidence(item.id, { verification: chosen });
    renderDetail(body, ctx, evidenceId);
  });

  twoTapConfirm(body.querySelector('#delete-btn'), {
    confirmLabel: 'Really delete? (recoverable 30 days)',
    onConfirm: async () => {
      await store.softDeleteEvidence(item.id);
      ctx.closeDrawer();
      render(document.getElementById('page-root'), ctx);
    },
  });

  if (item.type === 'video') {
    const moments = await store.listVideoMoments(item.id);
    const slot = body.querySelector('#moments-slot');
    slot.innerHTML = '<div class="panel-title">Marked moments</div>';
    for (const m of moments) {
      const row = document.createElement('div');
      row.className = 'moment-row';
      row.innerHTML = `<span class="t">${Math.floor(m.t_ms / 60000)}:${String(Math.floor((m.t_ms % 60000) / 1000)).padStart(2, '0')}</span><span>${m.label || ''}${m.conflicts ? ' <span class="chip red">conflict</span>' : ''}</span>`;
      slot.appendChild(row);
    }
    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-sm';
    openBtn.textContent = 'Open in Video player →';
    openBtn.addEventListener('click', () => { ctx.closeDrawer(); ctx.navigate(`#/video/${item.id}`); });
    slot.appendChild(openBtn);
  }
}

async function renderAddForm(body, ctx) {
  const { store } = ctx;
  const kase = await store.getCase(ctx.caseId);
  const sources = await store.listSources();
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:4px">Add evidence</h3>
    <p class="mono" style="margin:0 0 16px;font-size:11px;color:var(--text-2)">→ goes into <span style="color:var(--brass)">${kase ? kase.name : 'the current case'}</span></p>
    <div class="field"><label>Type</label><select id="a-type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select></div>
    <div class="field"><label>Title</label><input type="text" id="a-title"></div>
    <div class="field"><label>Source (who this comes from)</label><select id="a-source">${sourceOptions(sources, null)}</select></div>
    <div class="field"><label>File (optional — stored in data/assets/, identified by its hash)</label><input type="file" id="a-file"></div>
    <div class="field"><label>Original URL</label><input type="url" id="a-url"></div>
    <div class="field"><label>Content dated</label><input type="date" id="a-dated"></div>
    <div class="field"><label>Notes</label><textarea id="a-notes"></textarea></div>
    <p style="color:var(--text-3);font-size:11px">New evidence starts as <b>drafted</b> — zero confidence until you set its verification.</p>
    <button class="btn btn-primary" id="a-save">Add</button>
  `;

  // pre-fill today — she's usually logging something she just captured, and
  // it's right there to change when the content is older
  const today = new Date();
  body.querySelector('#a-dated').value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // a pasted video-site link means this is video evidence — flip the type
  // automatically (only if she hasn't already picked something herself)
  // inline source creation right in the form
  body.querySelector('#a-source').addEventListener('change', async (e) => {
    if (e.target.value !== '__new') return;
    mountNewSourceForm(store, e.target, {
      onCreated: async (src) => {
        const opt = document.createElement('option');
        opt.value = src.id;
        opt.textContent = src.name;
        e.target.insertBefore(opt, e.target.querySelector('option[value="__new"]'));
        e.target.value = src.id;
      },
      onCancel: () => { e.target.value = ''; },
    });
  });

  const typeEl = body.querySelector('#a-type');
  let typeTouched = false;
  typeEl.addEventListener('change', () => { typeTouched = true; });
  body.querySelector('#a-url').addEventListener('input', (e) => {
    if (typeTouched) return;
    if (/youtube\.com|youtu\.be|tiktok\.com|instagram\.com\/(reel|tv)|vimeo\.com/i.test(e.target.value)) {
      typeEl.value = 'video';
    }
  });
  body.querySelector('#a-save').addEventListener('click', async () => {
    const titleInput = body.querySelector('#a-title');
    const title = titleInput.value.trim();
    if (!title) { inlineNote(titleInput, 'A title is required.'); titleInput.focus(); return; }
    clearInlineNote(titleInput);
    let fileMeta = {};
    const file = body.querySelector('#a-file').files[0];
    if (file) fileMeta = await store.storeEvidenceFile(file);
    await store.createEvidence({
      case_id: ctx.caseId,
      type: body.querySelector('#a-type').value,
      title,
      source_id: (body.querySelector('#a-source').value && body.querySelector('#a-source').value !== '__new') ? body.querySelector('#a-source').value : null,
      original_url: body.querySelector('#a-url').value || null,
      dated: body.querySelector('#a-dated').value || null,
      notes: body.querySelector('#a-notes').value || null,
      verification: 'drafted',
      ...fileMeta,
    });
    ctx.closeDrawer();
    render(document.getElementById('page-root'), ctx);
  });
}
