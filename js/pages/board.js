// The corkboard (her ask, 2026-09-13, synth22 batch stage 4 — SPEC §13x).
// The Board used to hang every dated event on a year axis; those events
// now live on the person's own "Our Story" poster (SPEC §13w). What's left
// here is the detective's board: theories (question rows with parent_id)
// pinned in a row, their evidence strung beneath them, a red thread
// wherever the case's own contradictions cross two pinned pieces of
// evidence. This page only ever READS that data — a theory is created,
// starred, answered and evidenced on the Questions tab; a click here just
// opens that tab. No drag, no saved positions: the app places everything.
import { emptyState } from '../indicators.js';
import { verificationConfidence } from '../indicators.js';

const FIT_KEY = 'c7-board-fit';
const ZOOM_MIN = 0.4, ZOOM_MAX = 1.6, ZOOM_STEP = 0.15, MIN_FIT = 0.8;
let boardScale = 1; // module-level, like the Tree's own treeState — survives re-render, not saved

const COL_PITCH = 220;      // one theory column's width + its gap
const THEORY_W = 180, THEORY_H = 104;   // must match .cork-theory in app.css
const EV_W = 148, EV_H = 56, EV_GAP = 18; // must match .cork-evidence in app.css
const EV_STEP = EV_H + EV_GAP;
const START_Y = THEORY_H + 36;
const PAD = 30;
const NS = 'http://www.w3.org/2000/svg';

const EV_GLYPH = { video: '▶ ', audio: '▶ ', note: '“', clipping: '“', document: '🔗 ', screenshot: '▣ ', photo: '▣ ' };

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// a small, stable tilt per card so the board looks pinned by hand, not
// printed (her "set slightly askew") — hashed from the id so it never
// jitters between renders.
function tilt(id, spread = 3) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 2 * spread;
}

// the same sourced/drafted law as everywhere else in the app (indicators.js):
// two_plus/single clear the amber line, disputed/dead_link/drafted don't.
const isSourced = (verification) => verificationConfidence(verification) >= 40;

export async function render(root, ctx, personId = null) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }

  const [rows, contradictions] = await Promise.all([
    store.listQuestions(ctx.caseId),
    store.listContradictionsForCase(ctx.caseId),
  ]);
  const questionsById = new Map(rows.filter((r) => !r.parent_id).map((q) => [q.id, q]));
  const theories = rows.filter((r) => r.parent_id).sort((a, b) => {
    // grouped by parent question, then creation order within it — a
    // sensible default; she never arranges the board by hand
    if (a.parent_id !== b.parent_id) return a.parent_id < b.parent_id ? -1 : 1;
    return (a.created_at || '') < (b.created_at || '') ? -1 : 1;
  });

  const goToQuestions = (q) => ctx.navigate(q?.person_id ? `#/subject/${q.person_id}/questions` : personId ? `#/subject/${personId}/questions` : '#/questions');

  root.innerHTML = `<div class="stack"><div id="board-slot"></div></div>`;
  const slot = root.querySelector('#board-slot');

  if (!theories.length) {
    slot.appendChild(emptyState({
      missing: 'No theories pinned yet.',
      why: 'The board pins theories from the Questions tab, with their evidence strung beneath — ask a question there first.',
      action: '+ Question',
      onAction: () => goToQuestions(null),
    }));
    return;
  }

  const theoryLinks = await Promise.all(theories.map((t) => store.listLinksForTarget('question', t.id)));

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  wrap.innerHTML = `
    <div class="row between wrap cork-toolbar" style="gap:8px">
      <div class="row wrap" style="gap:10px">
        <span class="row" style="gap:4px"><span style="width:14px;height:2px;background:var(--brass);display:inline-block"></span><span class="mono" style="font-size:11px">supports · sourced</span></span>
        <span class="row" style="gap:4px"><span style="width:14px;height:2px;border-top:1px dashed var(--text-3);display:inline-block"></span><span class="mono" style="font-size:11px">supports · drafted</span></span>
        <span class="row" style="gap:4px"><span style="width:14px;height:2px;background:var(--red);display:inline-block"></span><span class="mono" style="font-size:11px">contradicts</span></span>
      </div>
      <span class="seg">
        <button id="board-fit" title="Shrink the board to fit this box">Fit</button>
        <button id="board-zoom-out" title="Zoom out">−</button>
        <button id="board-zoom-in" title="Zoom in">+</button>
      </span>
    </div>
    <div class="cork-scroll"><div class="cork-scale"><div class="cork-board"></div></div></div>
  `;
  slot.appendChild(wrap);

  const scrollBox = wrap.querySelector('.cork-scroll');
  const scaleBox = wrap.querySelector('.cork-scale');
  const board = wrap.querySelector('.cork-board');

  const evidencePos = new Map(); // evidence id -> {x, y} card centre, for the red string
  let maxRows = 1;
  const contentW = PAD * 2 + theories.length * COL_PITCH;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'string-svg');

  theories.forEach((t, ci) => {
    const q = questionsById.get(t.parent_id);
    const cx = PAD + ci * COL_PITCH + COL_PITCH / 2;
    const won = !!(q && q.resolved && q.answer_id === t.id);

    const tCard = document.createElement('button');
    tCard.type = 'button';
    tCard.className = `cork-theory${t.pick ? ' pick' : ''}${won ? ' won' : ''}`;
    tCard.style.left = `${cx - THEORY_W / 2}px`;
    tCard.style.top = '0px';
    tCard.style.setProperty('--tilt', `${tilt(t.id)}deg`);
    tCard.innerHTML = `
      <i class="pin"></i>
      ${q ? `<div class="cork-eyebrow">${esc(q.text)}</div>` : ''}
      <div class="cork-text">${esc(t.text)}</div>
      ${t.pick || won ? `<span class="cork-star" title="${won ? 'The theory that settled it' : 'Her leaning'}">${won ? '✓' : '★'}</span>` : ''}
    `;
    tCard.title = q ? `${q.text} — ${t.text}` : t.text;
    tCard.addEventListener('click', () => { if (scrollBox.dataset.dragged) return; goToQuestions(q); });
    board.appendChild(tCard);

    const links = theoryLinks[ci];
    links.forEach((l, ei) => {
      const y = START_Y + ei * EV_STEP;
      maxRows = Math.max(maxRows, ei + 1);
      const sourced = isSourced(l.evidence_verification);
      if (!evidencePos.has(l.evidence_id)) evidencePos.set(l.evidence_id, { x: cx, y: y + EV_H / 2 });

      const eCard = document.createElement('button');
      eCard.type = 'button';
      eCard.className = 'cork-evidence';
      eCard.style.left = `${cx - EV_W / 2}px`;
      eCard.style.top = `${y}px`;
      eCard.style.setProperty('--tilt', `${tilt(l.id, 2)}deg`);
      eCard.innerHTML = `<i class="pin"></i><div class="cork-ev-title">${EV_GLYPH[l.evidence_type] || '◆ '}${esc(l.evidence_title)}</div>`;
      eCard.title = `${l.evidence_title} · ${l.evidence_type}`;
      eCard.addEventListener('click', () => { if (scrollBox.dataset.dragged) return; ctx.navigate('#/evidence'); });
      board.appendChild(eCard);

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx); line.setAttribute('y1', THEORY_H);
      line.setAttribute('x2', cx); line.setAttribute('y2', y);
      line.setAttribute('stroke', sourced ? 'var(--brass)' : 'var(--text-3)');
      line.setAttribute('stroke-width', '1.5');
      if (!sourced) line.setAttribute('stroke-dasharray', '3,3');
      svg.appendChild(line);
    });
  });

  // the red string: one curve per contradiction, between its two evidence
  // cards — only when BOTH sides are actually pinned to a theory somewhere
  const unplaced = [];
  for (const c of contradictions) {
    const a = evidencePos.get(c.a_evidence_id), b = evidencePos.get(c.b_evidence_id);
    if (!a || !b) { unplaced.push(c); continue; }
    const midX = (a.x + b.x) / 2;
    const lift = Math.max(a.y, b.y) + 50;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${a.x} ${a.y} Q ${midX} ${lift} ${b.x} ${b.y}`);
    path.setAttribute('stroke', 'var(--red)'); path.setAttribute('stroke-width', '1.5'); path.setAttribute('fill', 'none');
    svg.appendChild(path);
    for (const p of [a, b]) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', '3'); dot.setAttribute('fill', 'var(--red)');
      svg.appendChild(dot);
    }
  }

  const contentH = START_Y + maxRows * EV_STEP + PAD;
  board.style.width = `${contentW}px`;
  board.style.height = `${contentH}px`;
  svg.setAttribute('width', contentW);
  svg.setAttribute('height', contentH);
  board.appendChild(svg);

  attachPanZoom(scrollBox, scaleBox, board, contentW, contentH, wrap);

  if (unplaced.length) {
    const tray = document.createElement('div');
    tray.className = 'board-tray';
    tray.innerHTML = '<span class="section-label" style="align-self:center;margin-right:8px">Not yet on the board</span>';
    for (const c of unplaced) {
      const chip = document.createElement('span');
      chip.className = 'chip red';
      chip.textContent = `${c.a_title} vs ${c.b_title}`;
      chip.title = 'Pin at least one side’s evidence to a theory (Questions tab) to string this contradiction on the board';
      tray.appendChild(chip);
    }
    slot.appendChild(tray);
  }
}

// pan (drag, mouse or touch) + hand zoom + Fit — the same controls and the
// same tuned values as the Relations Tree (her pick, 2026-09-13: "reuse the
// Tree's viewing controls"), kept local to this module since the Tree's own
// version is inline in relations.js and not factored out for reuse.
function attachPanZoom(scrollBox, scaleBox, content, contentW, contentH, wrap) {
  let fit = localStorage.getItem(FIT_KEY) !== '0';
  const fitBtn = wrap.querySelector('#board-fit');
  fitBtn.classList.toggle('active', fit);

  const applyScale = () => {
    const boxW = scrollBox.clientWidth || contentW;
    const s = fit ? Math.max(MIN_FIT, Math.min(1, boxW / (contentW || 1))) : boardScale;
    content.style.transform = `scale(${s})`;
    scaleBox.style.width = `${Math.round(contentW * s)}px`;
    scaleBox.style.height = `${Math.round(contentH * s)}px`;
    scaleBox.style.margin = contentW * s < boxW ? '0 auto' : '0';
    return s;
  };
  applyScale();

  if (typeof ResizeObserver !== 'undefined') {
    let lastW = scrollBox.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!document.contains(scrollBox)) { ro.disconnect(); return; }
      const w = scrollBox.clientWidth;
      if (fit && Math.abs(w - lastW) > 1) { lastW = w; applyScale(); }
    });
    ro.observe(wrap);
  }

  fitBtn.addEventListener('click', () => {
    fit = !fit;
    localStorage.setItem(FIT_KEY, fit ? '1' : '0');
    fitBtn.classList.toggle('active', fit);
    if (!fit) boardScale = applyScale();
    else applyScale();
  });
  const zoom = (dir) => {
    fit = false;
    localStorage.setItem(FIT_KEY, '0');
    fitBtn.classList.remove('active');
    boardScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((boardScale + dir * ZOOM_STEP) * 100) / 100));
    applyScale();
  };
  wrap.querySelector('#board-zoom-out').addEventListener('click', () => zoom(-1));
  wrap.querySelector('#board-zoom-in').addEventListener('click', () => zoom(1));

  let drag = null;
  scrollBox.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, left: scrollBox.scrollLeft, top: scrollBox.scrollTop, moved: false };
    delete scrollBox.dataset.dragged;
  });
  scrollBox.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    scrollBox.classList.add('dragging');
    scrollBox.dataset.dragged = '1';
    scrollBox.scrollLeft = drag.left - dx;
    scrollBox.scrollTop = drag.top - dy;
  });
  const endDrag = () => { drag = null; scrollBox.classList.remove('dragging'); setTimeout(() => delete scrollBox.dataset.dragged, 50); };
  scrollBox.addEventListener('pointerup', endDrag);
  scrollBox.addEventListener('pointercancel', endDrag);
  scrollBox.addEventListener('pointerleave', endDrag);
}
