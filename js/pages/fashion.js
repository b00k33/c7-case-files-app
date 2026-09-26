// Fashion gallery (her ask, 2026-09-26: "collect images of people's fashion
// for personal inspo and also have a timeline of their style, without
// having to copy paste images manually"). One page, reached from a button
// on People (her pick over a new bottom-tab slot) — a mixed wall of every
// picture on file, filterable by "Inspiration" (nobody named) or by person,
// per her own answer that both belong in the same gallery rather than two
// separate places. Not case-scoped, same as People itself: a person's style
// spans every case they're in.
//
// Three ways a picture gets in, per her own answers: pick or paste a file
// by hand (works from a phone's gallery or a desktop clipboard alike — the
// "no copy-pasting into somewhere else first" part of her ask); or, for a
// well-documented public figure, a best-effort pull from Wikimedia Commons
// (js/lookup.js's fetchStylePhotos) — real and free, but only really
// populated for royals/A-listers, so it is offered, never assumed.
import { emptyState } from '../indicators.js';
import { openShotViewer } from '../ui.js';
import { compressImage, queueUpload, resolveAssetUrl, flushUploads } from '../assets.js';
import { fetchStylePhotos } from '../lookup.js';

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** Any images on the clipboard, as Files — a paste usually carries one screenshot. */
function imagesFromClipboard(dt) {
  const files = [];
  for (const item of dt?.items || []) {
    if (item.kind === 'file' && /^image\//.test(item.type)) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

const FILTER_KEY = 'c7-fashion-filter'; // 'all' | 'inspo' | a person id
let pasteHandler = null;

export async function render(root, ctx) {
  const { store } = ctx;
  const [images, chipPeople, allPeople] = await Promise.all([
    store.listStyleImages(), store.listStylePeople(), store.listAllPeople(),
  ]);
  let filter = localStorage.getItem(FILTER_KEY) || 'all';
  if (filter !== 'all' && filter !== 'inspo' && !chipPeople.some((p) => p.id === filter)) filter = 'all';

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:11px;color:var(--text-3)">${images.length} ${images.length === 1 ? 'image' : 'images'}</span>
        <button class="btn btn-primary btn-sm" id="add-style-btn">+ Add</button>
      </div>
      <div class="row wrap" id="fash-chips" style="gap:6px"></div>
      <div id="add-style-slot"></div>
      <div id="fash-body"></div>
    </div>
  `;

  const chipRow = root.querySelector('#fash-chips');
  const chipDefs = [{ id: 'all', label: 'All' }, { id: 'inspo', label: 'Inspiration' }, ...chipPeople.map((p) => ({ id: p.id, label: `${p.display_name} · ${p.n}` }))];
  chipRow.innerHTML = chipDefs.map((c) => `<button type="button" class="chip" data-id="${esc(c.id)}" style="border:0;cursor:pointer${filter === c.id ? ';background:var(--brass);color:var(--on-brass)' : ''}">${esc(c.label)}</button>`).join('');
  chipRow.querySelectorAll('[data-id]').forEach((btn) => btn.addEventListener('click', () => {
    localStorage.setItem(FILTER_KEY, btn.dataset.id);
    render(root, ctx);
  }));

  const addSlot = root.querySelector('#add-style-slot');
  root.querySelector('#add-style-btn').addEventListener('click', () => renderAddForm(addSlot, ctx, allPeople, () => render(root, ctx)));

  // paste anywhere on this page while the add form isn't already collecting
  // its own paste (guarded inside renderAddForm) — her ask, "paste an image"
  if (pasteHandler) document.removeEventListener('paste', pasteHandler);
  pasteHandler = async (e) => {
    if (!document.getElementById('fash-body')) return; // left the page
    if (addSlot.children.length) return; // the add form has its own paste listener, onto ITS fields
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    const files = imagesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    // a bare paste with nothing open lands as untagged inspiration — the
    // same "nothing open → the default place" rule Evidence's own paste
    // already uses (2026-09-08); naming a person is what the "+ Add" form
    // (with the Wikidata pull) is for.
    await saveStyleFiles(ctx, files, { personId: null, date: null, caption: null, source: null });
    render(root, ctx);
  };
  document.addEventListener('paste', pasteHandler);

  const shown = filter === 'all' ? images : filter === 'inspo' ? images.filter((i) => !i.person_id) : images.filter((i) => i.person_id === filter);

  const body = root.querySelector('#fash-body');
  if (!shown.length) {
    body.appendChild(emptyState({
      missing: images.length ? 'Nothing here yet.' : 'No fashion images yet.',
      why: 'Add a picture by hand, or — for someone well documented — try the Wikidata pull in "+ Add."',
      action: '+ Add',
      onAction: () => renderAddForm(addSlot, ctx, allPeople, () => render(root, ctx)),
    }));
    return;
  }

  const wall = document.createElement('div');
  wall.className = 'fashion-wall';
  body.appendChild(wall);
  const resolved = (await Promise.all(shown.map(async (img) => ({ ...img, url: await resolveAssetUrl(img.file_path, img.mime) })))).filter((img) => img.url);
  resolved.forEach((img, idx) => {
    const card = document.createElement('div');
    card.className = 'fashion-card';
    const tag = [esc(img.person_name), img.dated ? img.dated.slice(0, 4) : null].filter(Boolean).join(' · ');
    card.innerHTML = `<img src="${img.url}" alt="" loading="lazy">${tag ? `<span class="tag">${tag}</span>` : ''}`;
    card.addEventListener('click', () => {
      openShotViewer({
        pictures: resolved.map((r) => ({ url: r.url, caption: r.caption, id: r.id })),
        index: idx,
        onCaption: async (p, text) => { await store.updateStyleImage(p.id, { caption: text }); },
        onRemove: async (p) => { await store.softDeleteStyleImage(p.id); },
        onClosed: () => render(root, ctx),
      });
    });
    wall.appendChild(card);
  });
}

/** Compress, store and record one batch of pictures — shared by the manual add form and a bare paste. */
async function saveStyleFiles(ctx, files, { personId, date, caption, source }) {
  const { store } = ctx;
  for (const raw of files) {
    try {
      const file = await compressImage(raw);
      const meta = await store.storeEvidenceFile(file);
      await store.createStyleImage({
        person_id: personId || null, ...meta,
        source_url: source || null, dated: date || null, date_precision: date ? 'day' : 'unknown',
        caption: caption || null, origin: 'upload',
      });
      queueUpload(meta.file_path, meta.mime);
    } catch (e) { console.error('Could not add style image', raw.name, e); }
  }
  flushUploads();
}

function renderAddForm(slot, ctx, allPeople, onDone) {
  const { store } = ctx;
  if (slot.children.length) { slot.innerHTML = ''; return; }
  const sortedPeople = [...allPeople].sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }));
  slot.innerHTML = `
    <div class="panel" style="padding:16px;margin:8px 0">
      <div class="field">
        <label>Who is this? (optional — leave blank for general inspiration)</label>
        <input type="text" id="fa-person" list="fa-people-list" placeholder="Type a name already in the app">
        <datalist id="fa-people-list">${sortedPeople.map((p) => `<option value="${esc(p.display_name)}">`).join('')}</datalist>
      </div>
      <div id="fa-pull-slot"></div>
      <div class="field"><label>Picture</label><input type="file" id="fa-file" accept="image/*" multiple></div>
      <div class="inline-note" style="border-left-color:var(--text-3)">Or paste an image with Ctrl+V while this is open.</div>
      <div class="row wrap" style="gap:8px">
        <div class="field"><label>Date (optional)</label><input type="date" id="fa-date"></div>
        <div class="field" style="flex:1"><label>Caption (optional)</label><input type="text" id="fa-caption" placeholder="Met Gala"></div>
      </div>
      <div class="field"><label>Source link (optional)</label><input type="text" id="fa-source" placeholder="https://instagram.com/…"></div>
      <div class="row wrap" style="gap:8px">
        <button class="btn btn-primary btn-sm" id="fa-save">Add</button>
        <button class="btn btn-ghost btn-sm" id="fa-cancel">Cancel</button>
      </div>
      <div id="fa-progress" style="margin-top:6px"></div>
    </div>
  `;

  const personField = slot.querySelector('#fa-person');
  const pullSlot = slot.querySelector('#fa-pull-slot');
  const matchPerson = () => {
    const typed = personField.value.trim().toLowerCase();
    return typed ? allPeople.find((p) => p.display_name.trim().toLowerCase() === typed) : null;
  };
  personField.addEventListener('input', () => {
    const person = matchPerson();
    pullSlot.innerHTML = person && person.wikidata_id
      ? `<button type="button" class="btn btn-ghost btn-sm" id="fa-pull-btn">Try auto-pull from Wikidata for ${esc(person.display_name)}</button><div id="fa-pull-progress" style="margin-top:6px"></div>`
      : '';
    const pullBtn = pullSlot.querySelector('#fa-pull-btn');
    if (pullBtn) pullBtn.addEventListener('click', () => runAutoPull(pullSlot, ctx, person, onDone));
  });

  // paste, scoped to while this form is open — her ask, "paste an image or a
  // link." One handler, removed on every way out of this form (Cancel, Add,
  // or the page navigating away) so re-opening the form doesn't stack a
  // second, permanently-inert listener behind it.
  const formPasteHandler = async (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
    const files = imagesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    slot.querySelector('#fa-file').files = dt.files;
  };
  document.addEventListener('paste', formPasteHandler);
  const closeForm = () => {
    document.removeEventListener('paste', formPasteHandler);
    slot.innerHTML = '';
  };

  slot.querySelector('#fa-cancel').addEventListener('click', closeForm);

  slot.querySelector('#fa-save').addEventListener('click', async () => {
    const prog = slot.querySelector('#fa-progress');
    const files = [...slot.querySelector('#fa-file').files];
    if (!files.length) { prog.textContent = 'Pick or paste at least one picture first.'; return; }
    const person = matchPerson();
    const date = slot.querySelector('#fa-date').value || null;
    const caption = slot.querySelector('#fa-caption').value.trim() || null;
    const source = slot.querySelector('#fa-source').value.trim() || null;
    prog.textContent = `Adding ${files.length === 1 ? 'the picture' : `${files.length} pictures`}…`;
    await saveStyleFiles(ctx, files, { personId: person ? person.id : null, date, caption, source });
    closeForm();
    onDone();
  });
}

async function runAutoPull(pullSlot, ctx, person, onDone) {
  const { store } = ctx;
  const btn = pullSlot.querySelector('#fa-pull-btn');
  const prog = pullSlot.querySelector('#fa-pull-progress');
  btn.disabled = true;
  prog.textContent = 'Checking Wikimedia Commons…';
  try {
    const existing = (await store.listStyleImages()).filter((i) => i.person_id === person.id);
    const already = new Set(existing.map((i) => i.source_url));
    const { category, photos } = await fetchStylePhotos(person.wikidata_id);
    if (!category) { prog.textContent = 'Wikidata has no Commons category on file for them — nothing to pull automatically.'; btn.disabled = false; return; }
    const fresh = photos.filter((p) => !already.has(p.sourceUrl));
    if (!fresh.length) {
      prog.textContent = photos.length ? `Nothing new — ${photos.length} already on file.` : 'Found their Commons category, but no usable photos in it.';
      btn.disabled = false;
      return;
    }
    let added = 0;
    for (let i = 0; i < fresh.length; i++) {
      prog.textContent = `${i + 1} of ${fresh.length}…`;
      try {
        const res = await fetch(fresh[i].url);
        if (!res.ok) continue;
        const blob = await res.blob();
        const file = await compressImage(new File([blob], 'commons.jpg', { type: blob.type || 'image/jpeg' }));
        const meta = await store.storeEvidenceFile(file);
        await store.createStyleImage({
          person_id: person.id, ...meta,
          source_url: fresh[i].sourceUrl, dated: fresh[i].date, date_precision: fresh[i].datePrecision,
          origin: 'commons',
        });
        queueUpload(meta.file_path, meta.mime);
        added++;
      } catch (_) { /* one bad file shouldn't stop the rest */ }
    }
    flushUploads();
    prog.innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">Added ${added} of ${fresh.length} found.</div><button class="btn btn-primary btn-sm" id="fa-pull-done" style="margin-top:6px">Done</button>`;
    pullSlot.querySelector('#fa-pull-done').addEventListener('click', onDone);
  } catch (_) {
    prog.textContent = 'Could not reach Wikimedia Commons just now.';
    btn.disabled = false;
  }
}
