import { universalYear, personalYear } from '../numerology.js';
import { emptyState } from '../indicators.js';

let stripMode = 'universal'; // 'universal' | 'density' | 'personal:<id>'

function cardYear(ev) {
  if (ev.date) return parseInt(ev.date.slice(0, 4), 10);
  if (ev.date_year_min) return ev.date_year_min;
  return null;
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Open a case from the Dashboard first.', action: 'Go to Dashboard', onAction: () => ctx.navigate('#/dashboard') }));
    return;
  }

  const [kase, events, people] = await Promise.all([
    store.getCase(ctx.caseId),
    store.listEventsForCase(ctx.caseId),
    store.listPeople(ctx.caseId),
  ]);

  const dated = events.filter((e) => cardYear(e) != null);
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
    } else if (refPerson && refPerson.birth_date) {
      const py = personalYear(refPerson.birth_date, y);
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

  let cardIndex = 0;
  for (const y of years) {
    const list = byYear[y] || [];
    list.forEach((ev, i) => {
      const x = (y - yearMin) * cellW + cellW / 2;
      const yPos = 30 + i * 92;
      const card = document.createElement('div');
      card.className = 'board-card';
      card.style.left = `${x - 75}px`;
      card.style.top = `${yPos}px`;
      card.innerHTML = `<div class="t">${ev.title}</div><div class="mono" style="font-size:10px;color:var(--text-3)">${ev.date || y} · ${ev.kind || ''}</div>`;
      card.addEventListener('click', () => { if (ev.person_id) ctx.navigate(`#/subject/${ev.person_id}`); });
      cardsLayer.appendChild(card);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x); line.setAttribute('y1', 0);
      line.setAttribute('x2', x); line.setAttribute('y2', yPos);
      line.setAttribute('stroke', ev.person_id ? 'var(--brass)' : 'var(--text-3)');
      line.setAttribute('stroke-width', '1');
      if (!ev.person_id) line.setAttribute('stroke-dasharray', '3,2');
      svgLines.appendChild(line);
      cardIndex++;
    });
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
  slot.appendChild(tray);
}
