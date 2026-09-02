import { emptyState, verificationLabel } from '../indicators.js';
import { inlineNameForm, inlineNote, clearInlineNote, twoTapConfirm } from '../ui.js';
import { compressImage, queueUpload, resolveAssetUrl, flushUploads } from '../assets.js';
import { INBOX_TAG, PURPOSES } from '../store.js';

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

  // arriving from the Dashboard's "images waiting" line, or from the phone's share sheet
  if (localStorage.getItem('c7-evidence-view') === 'inbox') { currentView = 'inbox'; localStorage.removeItem('c7-evidence-view'); }
  const sharedIn = await drainSharedImages(ctx);
  if (sharedIn) currentView = 'inbox';
  const inboxCount = await store.countInbox(ctx.caseId);

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <div class="tabs" id="view-tabs">
          <button data-v="grid" class="${currentView === 'grid' ? 'active' : ''}">Grid</button>
          <button data-v="board" class="${currentView === 'board' ? 'active' : ''}">Board</button>
          <button data-v="table" class="${currentView === 'table' ? 'active' : ''}">Table</button>
          <button data-v="inbox" class="${currentView === 'inbox' ? 'active' : ''}">Inbox${inboxCount ? ` <span style="color:var(--brass)">${inboxCount}</span>` : ''}</button>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-ghost" id="add-images-btn">+ Add images</button>
          <input type="file" id="add-images-input" accept="image/*" multiple style="display:none">
          <button class="btn btn-primary" id="add-evidence-btn">+ Add evidence</button>
        </div>
      </div>
      <div class="dropzone" id="dropzone">Drop images here — or on your phone, share them to Case Files from the gallery</div>
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
  root.querySelector('#dropzone').style.display = currentView === 'inbox' ? '' : 'none';
  root.querySelector('#f-type').addEventListener('change', (e) => { filters.type = e.target.value; render(root, ctx); });
  root.querySelector('#f-verify').addEventListener('change', (e) => { filters.verification = e.target.value; render(root, ctx); });
  root.querySelector('#add-evidence-btn').addEventListener('click', () => ctx.openDrawer((body) => renderAddForm(body, ctx)));

  // the image inbox's three ways in: picker, drag-and-drop, share sheet (drained above)
  const fileInput = root.querySelector('#add-images-input');
  root.querySelector('#add-images-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    if (files.length) { await addImages(ctx, files, root); currentView = 'inbox'; render(root, ctx); }
  });
  const dz = root.querySelector('#dropzone');
  root.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  root.addEventListener('dragleave', () => dz.classList.remove('over'));
  root.addEventListener('drop', async (e) => {
    e.preventDefault(); dz.classList.remove('over');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => /^image\//.test(f.type));
    if (files.length) { await addImages(ctx, files, root); currentView = 'inbox'; render(root, ctx); }
  });

  if (currentView === 'inbox') {
    const bodyEl0 = root.querySelector('#evidence-body');
    const people = await store.listPeople(ctx.caseId);
    const inbox = await store.listInboxEvidence(ctx.caseId);
    root.querySelector('#copy-list-btn').disabled = true;
    await renderInbox(bodyEl0, ctx, inbox, people, root);
    return;
  }

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

// ---- the image inbox: capture now, title/person/purpose later ----

function guessType(file) {
  const n = (file.name || '').toLowerCase();
  return n.includes('screenshot') || n.includes('screen') || file.type === 'image/png' ? 'screenshot' : 'photo';
}

/** Compress, store locally, create a drafted evidence row tagged 'inbox', queue the cloud copy. */
async function addImages(ctx, files, root) {
  const { store } = ctx;
  const status = document.createElement('div');
  status.className = 'inline-note';
  status.style.borderLeftColor = 'var(--brass)';
  root.querySelector('#dropzone').after(status);
  const today = new Date().toISOString().slice(0, 10);
  let n = 0;
  for (const raw of files) {
    n++;
    status.textContent = `Adding image ${n} of ${files.length}…`;
    try {
      const file = await compressImage(raw);
      const meta = await store.storeEvidenceFile(file);
      const ev = await store.createEvidence({
        case_id: ctx.caseId,
        type: guessType(raw),
        title: (raw.name || 'image').replace(/\.[^.]+$/, ''),
        dated: today,
        verification: 'drafted',
        ...meta,
      });
      await store.tagEvidence(ev.id, INBOX_TAG);
      await store.tagEvidence(ev.id, 'untitled'); // the filename is a stand-in, not a title
      queueUpload(meta.file_path, meta.mime);
    } catch (e) {
      console.error('Could not add image', raw.name, e);
    }
  }
  status.remove();
  flushUploads(); // cloud copies, in the background; retried by sync if this fails
  ctx.refreshBadges?.();
}

/** Images shared in from the phone's share sheet sit in a small cache until the app drains them. */
async function drainSharedImages(ctx) {
  if (!location.search.includes('shared=1') || !window.caches) return false;
  history.replaceState(null, '', location.pathname + location.hash);
  try {
    const cache = await caches.open('c7-share');
    const keys = await cache.keys();
    const files = [];
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const name = decodeURIComponent(res.headers.get('X-File-Name') || 'shared-image');
      files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') || 'image/jpeg' }));
      await cache.delete(req);
    }
    if (!files.length) return false;
    await addImages(ctx, files, document.getElementById('page-root'));
    return true;
  } catch (e) {
    console.error('Shared images could not be read', e);
    return false;
  }
}

async function renderInbox(el, ctx, inbox, people, root) {
  const { store } = ctx;
  el.style.display = 'block';
  if (!inbox.length) {
    el.appendChild(emptyState({
      missing: 'The inbox is empty.',
      why: 'Add images and they wait here until each has a title and a person — then they leave for the main collection.',
      action: '+ Add images',
      onAction: () => root.querySelector('#add-images-input').click(),
    }));
    return;
  }

  // batch defaults: set once, then tweak any card. The last subject file she
  // opened is the likely person (code7: don't ask for what's knowable).
  const lastSubject = localStorage.getItem('c7-last-subject');
  const defaultPerson = people.some((p) => p.id === lastSubject) ? lastSubject : '';
  const personOpts = (sel) => `<option value="">Person…</option>${people.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${p.display_name}</option>`).join('')}`;
  const purposeOpts = (sel) => `<option value="">Purpose…</option>${PURPOSES.map((p) => `<option value="${p.key}"${p.key === sel ? ' selected' : ''}>${p.label}</option>`).join('')}`;

  el.innerHTML = `
    <div class="batch-bar">
      <span class="section-label">Apply to all</span>
      <select id="batch-person">${personOpts(defaultPerson)}</select>
      <select id="batch-purpose">${purposeOpts('')}</select>
      <button class="btn btn-ghost btn-sm" id="batch-apply">Apply</button>
      <span style="font-size:11px;color:var(--text-3)">then tweak any card</span>
    </div>
    <div class="inbox-grid" id="inbox-grid"></div>
    <div class="row" style="justify-content:flex-end;margin-top:16px;gap:12px;align-items:center">
      <span id="inbox-summary" class="mono" style="font-size:11px;color:var(--text-3)"></span>
      <button class="btn btn-primary" id="inbox-save">Save</button>
    </div>
  `;

  const grid = el.querySelector('#inbox-grid');
  const cards = [];
  for (const it of inbox) {
    const links = await store.listLinksForEvidence(it.id);
    const existingLink = links.find((l) => l.target_type === 'person')?.target_id || '';
    const linkedPerson = existingLink || defaultPerson; // what the select shows; only existingLink is a real link
    const tags = await store.evidenceTagNames(it.id);
    const purpose = (tags.find((t) => t.startsWith('purpose:')) || '').replace('purpose:', '');
    const untitled = tags.includes('untitled'); // filename stand-in: shown as a hint, not a value
    const card = document.createElement('div');
    card.className = 'inbox-card';
    card.innerHTML = `
      <div class="inbox-thumb"><span class="mono" style="font-size:10px;color:var(--text-3)">${it.type} · ${it.dated || ''}</span></div>
      <div class="inbox-fields">
        <input type="text" class="ib-title" placeholder="${untitled ? `Title… (file: ${(it.title || '').replace(/"/g, '&quot;')})` : 'Title…'}" value="${untitled ? '' : (it.title || '').replace(/"/g, '&quot;')}">
        <div class="row" style="gap:6px">
          <select class="ib-person" style="flex:1;min-width:0">${personOpts(linkedPerson)}</select>
          <select class="ib-purpose" style="flex:1;min-width:0">${purposeOpts(purpose)}</select>
        </div>
        <details><summary style="cursor:pointer;font-size:11px;color:var(--text-3);list-style:none">note ▸</summary><textarea class="ib-note" placeholder="What this shows, specifically" style="min-height:48px;margin-top:6px">${it.notes || ''}</textarea></details>
        <div class="row between" style="align-items:center">
          <span class="ib-status mono" style="font-size:10px"></span>
          <button class="btn btn-ghost btn-sm ib-del" style="color:var(--red)">Delete</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
    const entry = { item: it, card, existingLink };
    cards.push(entry);
    resolveAssetUrl(it.file_path, it.mime).then((url) => {
      if (!url) return;
      const img = document.createElement('img');
      img.src = url; img.alt = it.title || '';
      img.addEventListener('click', () => ctx.openDrawer((body) => renderDetail(body, ctx, it.id)));
      card.querySelector('.inbox-thumb').prepend(img);
    });
    const refresh = () => {
      const ready = card.querySelector('.ib-title').value.trim() && card.querySelector('.ib-person').value;
      const st = card.querySelector('.ib-status');
      st.textContent = ready ? '✓ ready — leaves the inbox on save' : (!card.querySelector('.ib-title').value.trim() ? 'needs a title' : 'needs a person');
      st.style.color = ready ? 'var(--green)' : 'var(--red)';
      updateSummary();
    };
    card.querySelector('.ib-title').addEventListener('input', refresh);
    card.querySelector('.ib-person').addEventListener('change', refresh);
    twoTapConfirm(card.querySelector('.ib-del'), {
      confirmLabel: 'Really delete?',
      onConfirm: async () => { await store.softDeleteEvidence(it.id); render(root, ctx); },
    });
    entry.refresh = refresh;
  }
  function updateSummary() {
    const ready = cards.filter((c) => c.card.querySelector('.ib-title').value.trim() && c.card.querySelector('.ib-person').value).length;
    el.querySelector('#inbox-summary').textContent = `${ready} ready · ${cards.length - ready} stay in the inbox`;
    el.querySelector('#inbox-save').textContent = ready ? `Save ${ready} ready` : 'Save';
  }
  cards.forEach((c) => c.refresh());

  el.querySelector('#batch-apply').addEventListener('click', () => {
    const p = el.querySelector('#batch-person').value, pu = el.querySelector('#batch-purpose').value;
    for (const c of cards) {
      if (p) c.card.querySelector('.ib-person').value = p;
      if (pu) c.card.querySelector('.ib-purpose').value = pu;
      c.refresh();
    }
  });

  el.querySelector('#inbox-save').addEventListener('click', async () => {
    const btn = el.querySelector('#inbox-save');
    btn.disabled = true; btn.textContent = 'Saving…';
    for (const c of cards) {
      const title = c.card.querySelector('.ib-title').value.trim();
      const personId = c.card.querySelector('.ib-person').value;
      const purpose = c.card.querySelector('.ib-purpose').value;
      const notes = c.card.querySelector('.ib-note').value.trim();
      const patch = {};
      if (title && title !== c.item.title) patch.title = title;
      if ((notes || null) !== (c.item.notes || null)) patch.notes = notes || null;
      if (Object.keys(patch).length) await store.updateEvidence(c.item.id, patch);
      if (title) await store.untagEvidence(c.item.id, 'untitled');
      if (personId && personId !== c.existingLink) {
        await store.linkEvidence({ evidence_id: c.item.id, target_type: 'person', target_id: personId });
      }
      const tags = await store.evidenceTagNames(c.item.id);
      for (const t of tags) if (t.startsWith('purpose:') && t !== `purpose:${purpose}`) await store.untagEvidence(c.item.id, t);
      if (purpose && !tags.includes(`purpose:${purpose}`)) await store.tagEvidence(c.item.id, `purpose:${purpose}`);
      if (title && (personId || c.existingLink)) await store.untagEvidence(c.item.id, INBOX_TAG);
    }
    ctx.refreshBadges?.();
    render(root, ctx);
  });
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

    <div class="panel-title" style="margin-top:20px">Contradictions</div>
    <button class="btn btn-ghost btn-sm" id="contra-btn">Contradicts…</button>
    <div id="contra-slot"></div>
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

  body.querySelector('#contra-btn').addEventListener('click', () => {
    const slot = body.querySelector('#contra-slot');
    if (slot.querySelector('.contra-form')) return;
    renderContradictForm(slot, ctx, item, people, links);
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

// "This vs that": pair this item with another as a contradiction about one
// person. Each side is a marked video moment (picked) or a typed quote —
// no forced detour through the Video player. Descriptive only: never
// touches verification or confidence (her rule, 2026-09-01).
async function renderContradictForm(slot, ctx, item, people, links) {
  const { store } = ctx;
  const others = (await store.listEvidence(ctx.caseId)).filter((e) => e.id !== item.id);
  const myMoments = await store.listVideoMoments(item.id);
  const linkedIds = links.filter((l) => l.target_type === 'person').map((l) => l.target_id);
  const orderedPeople = [...people.filter((p) => linkedIds.includes(p.id)), ...people.filter((p) => !linkedIds.includes(p.id))];
  const fmtT = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const momentOpts = (moments) => moments.length
    ? `<option value="">— type a quote below instead —</option>${moments.map((m) => `<option value="${m.id}">${fmtT(m.t_ms)} — ${(m.quote || m.label || 'moment').slice(0, 60)}</option>`).join('')}`
    : '<option value="">no marked moments — type a quote below</option>';

  slot.innerHTML = `
    <div class="contra-form stack" style="gap:10px;margin-top:12px;padding:12px;background:var(--ink-2);border-radius:var(--r-lg)">
      <div class="field"><label>Contradicts which item?</label>
        <select id="cf-other"><option value="">Pick evidence…</option>${others.map((e) => `<option value="${e.id}">${e.title}</option>`).join('')}</select></div>
      <div class="field"><label>About which person?</label>
        <select id="cf-person">${orderedPeople.map((p) => `<option value="${p.id}">${p.display_name}${linkedIds.includes(p.id) ? ' (linked)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label>This side — moment</label><select id="cf-a-moment">${momentOpts(myMoments)}</select></div>
      <div class="field"><label>This side — quote</label><input type="text" id="cf-a-quote" placeholder="What is said or shown here"></div>
      <div class="field"><label>Other side — moment</label><select id="cf-b-moment"><option value="">pick the other item first</option></select></div>
      <div class="field"><label>Other side — quote</label><input type="text" id="cf-b-quote" placeholder="What is said or shown there"></div>
      <div class="field"><label>Note — what contradicts what?</label><textarea id="cf-note" style="min-height:56px"></textarea></div>
      <div class="row" style="gap:8px">
        <button class="btn btn-primary btn-sm" id="cf-save">Save contradiction</button>
        <button class="btn btn-ghost btn-sm" id="cf-cancel">Cancel</button>
      </div>
    </div>
  `;
  const q = (id) => slot.querySelector(id);
  let otherMoments = [];
  q('#cf-other').addEventListener('change', async (e) => {
    otherMoments = e.target.value ? await store.listVideoMoments(e.target.value) : [];
    q('#cf-b-moment').innerHTML = momentOpts(otherMoments);
  });
  // picking a moment pre-fills its quote (editable) — no retyping
  q('#cf-a-moment').addEventListener('change', (e) => {
    const m = myMoments.find((x) => x.id === e.target.value);
    if (m && !q('#cf-a-quote').value) q('#cf-a-quote').value = m.quote || m.label || '';
  });
  q('#cf-b-moment').addEventListener('change', (e) => {
    const m = otherMoments.find((x) => x.id === e.target.value);
    if (m && !q('#cf-b-quote').value) q('#cf-b-quote').value = m.quote || m.label || '';
  });
  q('#cf-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
  q('#cf-save').addEventListener('click', async () => {
    const saveBtn = q('#cf-save');
    clearInlineNote(saveBtn);
    const other = q('#cf-other').value;
    if (!other) { inlineNote(saveBtn, 'Pick the other evidence item first.'); return; }
    const aQuote = q('#cf-a-quote').value.trim(), bQuote = q('#cf-b-quote').value.trim();
    if (!aQuote && !q('#cf-a-moment').value) { inlineNote(saveBtn, 'This side needs a moment or a quote.'); return; }
    if (!bQuote && !q('#cf-b-moment').value) { inlineNote(saveBtn, 'The other side needs a moment or a quote.'); return; }
    await store.createContradiction({
      case_id: ctx.caseId,
      person_id: q('#cf-person').value || null,
      a_evidence_id: item.id, a_moment_id: q('#cf-a-moment').value || null, a_quote: aQuote || null,
      b_evidence_id: other, b_moment_id: q('#cf-b-moment').value || null, b_quote: bQuote || null,
      note: q('#cf-note').value.trim() || null,
    });
    const personName = orderedPeople.find((p) => p.id === q('#cf-person').value)?.display_name;
    slot.innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">Saved — it's on ${personName ? personName + "'s" : 'the'} Contradictions page and strung on the Board.</div>`;
  });
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
