// In-app replacements for browser popups — STYLE.md's "Modals: none" law,
// enforced everywhere (her call, 2026-09-01). Three patterns:
//   twoTapConfirm  — destructive buttons arm on first tap, act on second
//   inlineNameForm — a one-field form that appears in place of a prompt()
//   inlineNote     — a short explanation under a control, in place of alert()

/**
 * Arm-then-act for destructive buttons. First tap turns the button red and
 * swaps its label; a second tap within resetMs runs onConfirm; doing
 * nothing resets it. Never opens anything over the page.
 */
export function twoTapConfirm(btn, { confirmLabel = 'Really? Tap again', onConfirm, resetMs = 5000 }) {
  const original = btn.textContent;
  let armed = false, timer = null;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!armed) {
      armed = true;
      btn.classList.add('btn-armed');
      btn.textContent = confirmLabel;
      timer = setTimeout(() => {
        armed = false;
        btn.classList.remove('btn-armed');
        btn.textContent = original;
      }, resetMs);
      return;
    }
    clearTimeout(timer);
    await onConfirm();
  });
}

/**
 * A one-field form rendered in place — the prompt() replacement.
 * Enter submits, Escape cancels, ✕ cancels. Empty input refuses quietly
 * (keeps focus) rather than submitting nothing.
 */
export function inlineNameForm({ label, placeholder = '', value = '', submitLabel = 'Create', choices = null, withFictional = false, onSubmit, onCancel }) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-form';
  wrap.innerHTML = `
    ${label ? `<label class="inline-form-label">${label}</label>` : ''}
    <div class="row wrap" style="gap:8px">
      <input type="text" style="flex:1 1 160px;min-width:0">
      ${choices ? `<select class="if-choice">${choices.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')}</select>` : ''}
      <button type="button" class="btn btn-primary btn-sm if-submit">${submitLabel}</button>
      <button type="button" class="btn btn-ghost btn-sm if-cancel" title="Cancel">✕</button>
    </div>
    ${withFictional ? `
    <div class="row wrap" style="gap:8px;margin-top:6px;align-items:center">
      <label class="row" style="gap:4px;font-size:12px;color:var(--text-3);align-items:center"><input type="checkbox" class="if-fictional"> Fictional (a made-up world, not real research)</label>
      <input type="text" class="if-world" placeholder="World, e.g. Harry Potter" style="display:none;flex:1 1 140px;min-width:0">
    </div>` : ''}
  `;
  const input = wrap.querySelector('input');
  input.placeholder = placeholder;
  input.value = value;
  const worldCheck = wrap.querySelector('.if-fictional');
  const worldInput = wrap.querySelector('.if-world');
  worldCheck?.addEventListener('change', () => {
    worldInput.style.display = worldCheck.checked ? '' : 'none';
    if (worldCheck.checked) worldInput.focus();
  });
  const cancel = () => { wrap.remove(); onCancel?.(); };
  const submit = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    const world = worldCheck?.checked ? (worldInput.value.trim() || 'Fictional') : null;
    await onSubmit(v, wrap.querySelector('.if-choice')?.value, world);
  };
  wrap.querySelector('.if-submit').addEventListener('click', submit);
  wrap.querySelector('.if-cancel').addEventListener('click', cancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') cancel();
  });
  worldInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') cancel();
  });
  queueMicrotask(() => input.focus());
  return wrap;
}

/**
 * A short explanation rendered under a control — the alert() replacement.
 * Re-calling on the same anchor replaces the note instead of stacking.
 */
export function inlineNote(anchorEl, message) {
  let note = anchorEl.nextElementSibling;
  if (!note || !note.classList || !note.classList.contains('inline-note')) {
    note = document.createElement('div');
    note.className = 'inline-note';
    anchorEl.after(note);
  }
  note.textContent = message;
  return note;
}

export function clearInlineNote(anchorEl) {
  const n = anchorEl.nextElementSibling;
  if (n && n.classList && n.classList.contains('inline-note')) n.remove();
}

/**
 * The hard block behind "do not allow duplicates" (her ask, 2026-09-11) —
 * same slot as inlineNote (an existing note right after `anchorEl` is
 * replaced, not stacked), but for "someone by this name is already here"
 * instead of a plain validation message. One button per existing match —
 * using one is never destructive, so it's a single tap, not a two-tap
 * confirm. No "create anyway": she edits the name above for someone new.
 */
export function duplicateNameBlock(anchorEl, matches, onUse) {
  let note = anchorEl.nextElementSibling;
  if (!note || !note.classList || !note.classList.contains('inline-note')) {
    note = document.createElement('div');
    note.className = 'inline-note';
    anchorEl.after(note);
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const when = (p) => p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  note.innerHTML = `
    <div>${matches.length === 1 ? 'Already in this case' : `${matches.length} people by this name are already in this case`} — use one of them, or change the name above for someone new.</div>
    <div class="row wrap" style="gap:6px;margin-top:6px">
      ${matches.map((p) => `<button type="button" class="btn btn-ghost btn-sm dnb-use" data-id="${p.id}">Use ${esc(p.display_name)}${when(p) ? ` (added ${when(p)})` : ''} →</button>`).join('')}
    </div>
  `;
  note.querySelectorAll('.dnb-use').forEach((btn) => btn.addEventListener('click', () => onUse(matches.find((p) => p.id === btn.dataset.id))));
  return note;
}

/**
 * Full-screen picture viewer with arrows through a set (2026-09-08). Built
 * for the pictures on one evidence item, but takes any list.
 *
 * `pictures` is [{ url, caption, id, cover }] — URLs already resolved by the
 * caller, so the viewer never waits on storage. onCaption/onRemove are
 * optional; without them the viewer is read-only.
 *
 * Follows the full-tree overlay: appended to <body>, Escape closes, the
 * page underneath is frozen while it is up and restored exactly on close.
 */
export function openShotViewer({ pictures, index = 0, onCaption, onRemove, onClosed }) {
  if (!pictures.length || document.querySelector('.shot-view')) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  let list = pictures.slice();
  let i = Math.max(0, Math.min(index, list.length - 1));

  const overlay = document.createElement('div');
  overlay.className = 'shot-view';
  overlay.innerHTML = `
    <button class="close" type="button">‹ Close</button>
    <button class="drop" type="button" ${onRemove ? '' : 'hidden'}>Remove</button>
    <button class="nav prev" type="button" aria-label="Previous picture">‹</button>
    <div class="frame"><img alt=""></div>
    <button class="nav next" type="button" aria-label="Next picture">›</button>
    <div class="bar">
      <span class="count"></span>
      <input type="text" placeholder="What does this picture show? (optional)" ${onCaption ? '' : 'disabled'}>
    </div>
  `;
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const img = overlay.querySelector('img');
  const cap = overlay.querySelector('input');
  const count = overlay.querySelector('.count');
  const prev = overlay.querySelector('.prev');
  const next = overlay.querySelector('.next');
  const dropBtn = overlay.querySelector('.drop');
  let armed = false, armTimer = null;
  const disarm = () => {
    armed = false;
    clearTimeout(armTimer);
    dropBtn.textContent = 'Remove';
  };

  const paint = () => {
    const p = list[i];
    img.src = p.url;
    cap.value = p.caption || '';
    // the cover picture has no caption of its own to save into — say so
    // rather than letting her type into a box that quietly forgets
    cap.disabled = !onCaption || !!p.cover;
    cap.placeholder = p.cover
      ? 'The cover picture is described by the item’s own title'
      : 'What does this picture show? (optional)';
    // the cover is the card thumbnail everywhere else, so say so rather than
    // letting her wonder why picture 1 behaves differently
    count.textContent = `${i + 1} of ${list.length}${p.cover ? ' · cover' : ''}`;
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    disarm();
  };
  const go = (d) => {
    // the caption is saved before moving, or typing then arrowing loses it
    saveCaption();
    i = Math.max(0, Math.min(i + d, list.length - 1));
    paint();
  };
  const saveCaption = () => {
    const p = list[i];
    if (!onCaption || !p || p.cover) return;
    const text = cap.value.trim();
    if (text === (p.caption || '')) return;
    p.caption = text;
    onCaption(p, text);
  };

  const close = () => {
    saveCaption();
    clearTimeout(armTimer);
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    if (onClosed) onClosed();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.target === cap) return;                 // typing a caption, not paging
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  };
  document.addEventListener('keydown', onKey);

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  overlay.querySelector('.close').addEventListener('click', close);
  cap.addEventListener('blur', saveCaption);
  cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveCaption(); cap.blur(); } });
  // tapping the dark space around the picture closes, like any lightbox —
  // but not a tap on the picture itself, which is what she is reading
  overlay.querySelector('.frame').addEventListener('click', (e) => { if (e.target !== img) close(); });

  // Arm-then-act, written out rather than twoTapConfirm: that helper keeps
  // `armed` in a closure that outlives the picture on screen, so arming on
  // page 1 and then arrowing to page 2 would delete page 2 on a single tap.
  // Here paging calls disarm(), and the flag and the label move together.
  if (onRemove) {
    dropBtn.addEventListener('click', async () => {
      if (!armed) {
        armed = true;
        dropBtn.textContent = 'Really remove?';
        clearTimeout(armTimer);
        armTimer = setTimeout(disarm, 5000);
        return;
      }
      disarm();
      const p = list[i];
      await onRemove(p);
      list.splice(i, 1);
      if (!list.length) { close(); return; }
      i = Math.min(i, list.length - 1);
      paint();
    });
  }

  paint();
  return { close };
}
