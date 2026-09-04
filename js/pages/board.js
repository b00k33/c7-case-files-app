import { universalYear, personalYear } from '../numerology.js';
import { emptyState } from '../indicators.js';
import { exactBirth } from '../person-dates.js';
import { isMilestoneKind, MILESTONE_KIND_LABEL } from '../milestone-kinds.js';

let stripMode = 'universal'; // 'universal' | 'density' | 'personal:<id>'

function cardYear(ev) {
  if (ev.date) return parseInt(ev.date.slice(0, 4), 10);
  if (ev.date_year_min) return ev.date_year_min;
  return null;
}

function fmtT(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }

  const [kase, events, people, contradictions] = await Promise.all([
    store.getCase(ctx.caseId),
    store.listEventsForCase(ctx.caseId),
    store.listPeople(ctx.caseId),
    store.listContradictionsForCase(ctx.caseId),
  ]);

  // each side of a contradiction becomes an evidence card at its content
  // date, so the red string between them shows the gap in time
  const evidenceCards = new Map(); // evidence id -> card item
  const undatedContras = [];
  for (const c of contradictions) {
    const sides = [
      { id: c.a_evidence_id, title: c.a_title, dated: c.a_dated, t_ms: c.a_t_ms },
      { id: c.b_evidence_id, title: c.b_title, dated: c.b_dated, t_ms: c.b_t_ms },
    ];
    if (!c.a_dated || !c.b_dated) { undatedContras.push(c); continue; }
    for (const s of sides) {
      if (!evidenceCards.has(s.id)) evidenceCards.set(s.id, { _ev: true, id: s.id, title: s.title, date: s.dated, t_ms: s.t_ms });
    }
  }

  const dated = [...events.filter((e) => cardYear(e) != null), ...evidenceCards.values()];
  const undated = events.filter((e) => cardYear(e) == null);

  root.innerHTML = `
    <div class="stack">
      <div class="row wrap" style="gap:8px">
        <select id="strip-mode">
          <option value="universal">Universal year</option>
          <option value="density">Record density</option>
          ${people.map((p) => `<option value="personal:${p.id}">Personal year — ${p.display_name}</option>`).join('')}
        </select>
        <span class="row" style="gap:12px">
          <span class="row" style="gap:4px"><span style="width:14px;height:2px;background:var(--brass);display:inline-block"></span><span class="mono" style="font-size:11px;color:var(--text-3)">sourced</span></span>
          <span class="row" style="gap:4px"><span style="width:14px;height:2px;border-top:1px dashed var(--text-3);display:inline-block"></span><span class="mono" style="font-size:11px;color:var(--text-3)">drafted</span></span>
        </span>
      </div>
      <div id="board-slot"></div>
    </div>
  `;
  root.querySelector('#strip-mode').value = stripMode;
  root.querySelector('#strip-mode').addEventListener('change', (e) => { stripMode = e.target.value; render(root, ctx); });

  const slot = root.querySelector('#board-slot');

  if (!dated.length && !undated.length) {
    slot.appendChild(emptyState({
      missing: 'No events in this case yet.',
      why: 'The board reads its cards from events — none have been created.',
      action: 'Go to a subject file to add one',
      onAction: () => ctx.navigate('#/relations'),
    }));
    return;
  }

  let yearMin = kase.era_start;
  let yearMax = kase.era_end;
  if (!yearMin || !yearMax) {
    const years = dated.map(cardYear);
    yearMin = Math.min(...years) - 2;
    yearMax = Math.max(...years, new Date().getFullYear()) + 2;
  }
  yearMin = Math.min(yearMin, ...dated.map(cardYear));
  yearMax = Math.max(yearMax, ...dated.map(cardYear));

  const years = [];
  for (let y = yearMin; y <= yearMax; y++) years.push(y);
  const cellW = 64;

  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const strip = document.createElement('div');
  strip.className = 'board-strip';
  strip.style.width = `${years.length * cellW}px`;

  const refPersonId = stripMode.startsWith('personal:') ? stripMode.split(':')[1] : null;
  const refPerson = refPersonId ? people.find((p) => p.id === refPersonId) : null;

  const byYear = {};
  for (const e of dated) {
    const y = cardYear(e);
    (byYear[y] = byYear[y] || []).push(e);
  }
  const maxDensity = Math.max(1, ...Object.values(byYear).map((a) => a.length));

  for (const y of years) {
    const cell = document.createElement('div');
    cell.className = 'year-cell';
    let stripLabel = '';
    if (stripMode === 'universal') {
      const uy = universalYear(y);
      stripLabel = `${uy.value}${uy.master ? '★' : ''}`;
    } else if (stripMode === 'density') {
      stripLabel = String((byYear[y] || []).length);
    } else if (refPerson && exactBirth(refPerson)) {
      const py = personalYear(exactBirth(refPerson), y);
      stripLabel = py.ok ? `${py.value}${py.master ? '★' : ''}` : '—';
    } else {
      stripLabel = '—';
    }
    cell.innerHTML = `<span class="yr">${y}</span><span class="strip-num">${stripLabel}</span>`;
    strip.appendChild(cell);
  }

  const cardsLayer = document.createElement('div');
  cardsLayer.className = 'board-cards-layer';
  cardsLayer.style.top = '52px';

  const svgLines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgLines.setAttribute('class', 'string-svg');
  svgLines.style.top = '52px';

  const evidencePos = {}; // evidence id -> {x, y} of its card centre, for the red string
  const NS = 'http://www.w3.org/2000/svg';
  for (const y of years) {
    const list = byYear[y] || [];
    list.forEach((ev, i) => {
      const x = (y - yearMin) * cellW + cellW / 2;
      const yPos = 30 + i * 92;
      const card = document.createElement('div');
      card.className = 'board-card' + (ev._ev ? ' evidence' : '');
      card.style.left = `${x - 75}px`;
      card.style.top = `${yPos}px`;
      if (ev._ev) {
        card.innerHTML = `<div class="tag">evidence</div><div class="t">${ev.title}</div><div class="mono" style="font-size:10px;color:var(--text-3)">${ev.date}${ev.t_ms != null ? ' · ' + fmtT(ev.t_ms) : ''}</div>`;
        card.addEventListener('click', () => ctx.navigate('#/evidence'));
        evidencePos[ev.id] = { x, y: yPos + 28 };
      } else {
        const milestone = isMilestoneKind(ev.kind);
        if (milestone) card.classList.add('milestone');
        card.innerHTML = `<div class="t">${ev.title}</div><div class="mono" style="font-size:10px;color:var(--text-3)">${ev.date || y} · ${milestone ? MILESTONE_KIND_LABEL[ev.kind] : (ev.kind || '')}</div>`;
        card.addEventListener('click', () => { if (ev.person_id) ctx.navigate(`#/subject/${ev.person_id}`); });
      }
      cardsLayer.appendChild(card);

      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', 0);
      line.setAttribute('x2', x); line.setAttribute('y2', yPos);
      const sourced = ev._ev || ev.person_id;
      line.setAttribute('stroke', sourced ? 'var(--brass)' : 'var(--text-3)');
      line.setAttribute('stroke-width', '1');
      if (!sourced) line.setAttribute('stroke-dasharray', '3,2');
      svgLines.appendChild(line);
    });
  }

  // the red string: one curve per contradiction, between its two evidence cards
  for (const c of contradictions) {
    const a = evidencePos[c.a_evidence_id], b = evidencePos[c.b_evidence_id];
    if (!a || !b) continue;
    const midX = (a.x + b.x) / 2;
    const lift = Math.max(a.y, b.y) + 46; // bow below the cards so it never crosses them
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${a.x} ${a.y} Q ${midX} ${lift} ${b.x} ${b.y}`);
    path.setAttribute('stroke', 'var(--red)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    svgLines.appendChild(path);
    for (const p of [a, b]) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', '3');
      dot.setAttribute('fill', 'var(--red)');
      svgLines.appendChild(dot);
    }
    const days = Math.round(Math.abs(new Date(c.a_dated) - new Date(c.b_dated)) / 86400000);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', midX); label.setAttribute('y', (a.y + b.y) / 2 + (lift - (a.y + b.y) / 2) / 2 + 12);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'var(--red)');
    label.setAttribute('font-size', '10');
    label.setAttribute('font-family', 'JetBrains Mono, monospace');
    label.textContent = `contradiction · ${days} day${days === 1 ? '' : 's'} apart`;
    svgLines.appendChild(label);
  }
  const maxStack = Math.max(1, ...Object.values(byYear).map((a) => a.length));
  strip.style.minHeight = `${52 + 30 + maxStack * 92 + 20}px`;

  strip.appendChild(svgLines);
  strip.appendChild(cardsLayer);
  wrap.appendChild(strip);
  slot.appendChild(wrap);

  const tray = document.createElement('div');
  tray.className = 'board-tray';
  tray.innerHTML = '<span class="section-label" style="align-self:center;margin-right:8px">Undated</span>';
  if (!undated.length) {
    const p = document.createElement('span');
    p.className = 'mono';
    p.style.cssText = 'color:var(--text-3);font-size:11px';
    p.textContent = 'nothing waiting on a year';
    tray.appendChild(p);
  } else {
    for (const ev of undated) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = ev.title;
      chip.title = 'No year known — won\'t appear on the strip until dated';
      tray.appendChild(chip);
    }
  }
  for (const c of undatedContras) {
    const chip = document.createElement('span');
    chip.className = 'chip red';
    chip.textContent = `${c.a_title} vs ${c.b_title}`;
    chip.title = 'A contradiction whose evidence has no content date on one side — set "Content dated" on both items to string it on the board';
    tray.appendChild(chip);
  }
  slot.appendChild(tray);
}
