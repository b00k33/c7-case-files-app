// Shared rendering for contradiction pairs — used by the Subject page's
// section and the per-person Contradictions page, so both read identically.
import { emptyState } from './indicators.js';
import { twoTapConfirm } from './ui.js';

export function fmtMoment(ms) {
  if (ms == null) return null;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysApart(c) {
  if (!c.a_dated || !c.b_dated) return null;
  const d = Math.abs(new Date(c.a_dated) - new Date(c.b_dated)) / 86400000;
  return Math.round(d);
}

function sideRef(title, tms) {
  return `${title}${tms != null ? ' · ' + fmtMoment(tms) : ''}`;
}

/** Plain-text block for the clipboard: quote vs quote, with links. */
export function copyText(c) {
  const side = (title, tms, quote, url) =>
    `${sideRef(title, tms)}${url ? ` (${url})` : ''}\n${quote ? `"${quote}"` : '(no quote)'}`;
  return [
    side(c.a_title, c.a_t_ms, c.a_quote, c.a_url),
    '— vs —',
    side(c.b_title, c.b_t_ms, c.b_quote, c.b_url),
    c.note ? `Note: ${c.note}` : null,
  ].filter(Boolean).join('\n');
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}

/**
 * Render a list of contradiction pairs into `container`.
 * opts.onDeleted(c) is called after a soft delete so the caller can refresh.
 */
export function renderPairs(container, ctx, pairs, opts = {}) {
  container.innerHTML = '';
  if (!pairs.length) {
    container.appendChild(emptyState({
      missing: 'No contradictions recorded.',
      why: 'Open an evidence item and use "Contradicts…" to pair it with another — quote against quote.',
      action: 'Go to Evidence',
      onAction: () => ctx.navigate('#/evidence'),
    }));
    return;
  }
  for (const c of pairs) {
    const el = document.createElement('div');
    el.className = 'contra-pair';
    const gap = daysApart(c);
    const side = (title, tms, quote, dated, type) => `
      <div class="contra-side">
        <div class="mono ref">${type === 'video' ? '▣' : '▤'} ${sideRef(title, tms)}</div>
        <div class="quote">${quote ? `“${quote}”` : '<span style="color:var(--text-3)">no quote recorded</span>'}</div>
        ${dated ? `<div class="mono when">${fmtDate(dated)}</div>` : ''}
      </div>`;
    el.innerHTML = `
      <div class="contra-grid">
        ${side(c.a_title, c.a_t_ms, c.a_quote, c.a_dated, c.a_type)}
        <div class="contra-vs">vs</div>
        ${side(c.b_title, c.b_t_ms, c.b_quote, c.b_dated, c.b_type)}
      </div>
      ${c.note ? `<div class="contra-note">${c.note}</div>` : ''}
      <div class="row wrap" style="gap:8px;margin-top:10px;align-items:center">
        <button class="btn btn-ghost btn-sm c-copy">Copy</button>
        <button class="btn btn-ghost btn-sm c-board">See on Board</button>
        <button class="btn btn-ghost btn-sm c-del" style="color:var(--red)">Delete</button>
        ${gap != null ? `<span class="mono" style="font-size:11px;color:var(--red);margin-left:auto">${gap} day${gap === 1 ? '' : 's'} apart</span>` : ''}
      </div>
    `;
    const copyBtn = el.querySelector('.c-copy');
    copyBtn.addEventListener('click', async () => {
      await copyToClipboard(copyText(c));
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
    el.querySelector('.c-board').addEventListener('click', () => ctx.navigate('#/board'));
    twoTapConfirm(el.querySelector('.c-del'), {
      confirmLabel: 'Really delete?',
      onConfirm: async () => {
        await ctx.store.softDeleteContradiction(c.id);
        if (opts.onDeleted) opts.onDeleted(c);
      },
    });
    container.appendChild(el);
  }
}
