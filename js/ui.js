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
export function inlineNameForm({ label, placeholder = '', value = '', submitLabel = 'Create', choices = null, onSubmit, onCancel }) {
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
  `;
  const input = wrap.querySelector('input');
  input.placeholder = placeholder;
  input.value = value;
  const cancel = () => { wrap.remove(); onCancel?.(); };
  const submit = async () => {
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    await onSubmit(v, wrap.querySelector('.if-choice')?.value);
  };
  wrap.querySelector('.if-submit').addEventListener('click', submit);
  wrap.querySelector('.if-cancel').addEventListener('click', cancel);
  input.addEventListener('keydown', (e) => {
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
