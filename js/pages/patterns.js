import { lifePath } from '../numerology.js';
import { signFor } from '../chinese.js';
import { relation } from '../relations.js';
import { expectedCounts, expectedDigitCount } from '../stats.js';
import { relationGlyph, barRow, emptyState } from '../indicators.js';

function resolvedSign(p) {
  const s = signFor(p.birth_date);
  return s.ok && !s.boundary ? s : null;
}

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }

  const [people, rels, events, findings] = await Promise.all([
    store.listPeople(ctx.caseId), store.listRelationships(ctx.caseId), store.listEventsForCase(ctx.caseId), store.listFindings(ctx.caseId),
  ]);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="panel-title">Pair matrix — every person against every other</div>
        <div id="matrix-slot" style="overflow-x:auto"></div>
        <div id="pair-readout" style="margin-top:12px"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Case-wide relation counts, observed vs expected by chance</div>
        <div id="overall-slot"></div>
        <button class="btn btn-ghost btn-sm" id="control-btn" style="margin-top:8px">Run a control test (shuffle the same signs at random)</button>
        <div id="control-slot" style="margin-top:8px"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Children vs. parents</div>
        <div id="parent-slot"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Event-date numbers</div>
        <div id="event-num-slot"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Findings</div>
        <div id="findings-slot" class="stack" style="gap:8px"></div>
      </div>
    </div>
  `;

  const resolved = people.map((p) => ({ p, sign: resolvedSign(p) }));
  const withSign = resolved.filter((r) => r.sign);

  // matrix
  const matrixSlot = root.querySelector('#matrix-slot');
  const readoutSlot = root.querySelector('#pair-readout');
  if (people.length < 2) {
    matrixSlot.appendChild(emptyState({ missing: 'Need at least two people to compare.', why: `This case has ${people.length}.` }));
  } else {
    const table = document.createElement('table');
    table.className = 'matrix';
    const head = document.createElement('tr');
    head.appendChild(document.createElement('th'));
    people.forEach((p) => { const th = document.createElement('th'); th.textContent = p.display_name.split(' ')[0]; head.appendChild(th); });
    table.appendChild(head);
    people.forEach((rowP, i) => {
      const tr = document.createElement('tr');
      const rh = document.createElement('th');
      rh.textContent = rowP.display_name.split(' ')[0];
      tr.appendChild(rh);
      people.forEach((colP, j) => {
        const td = document.createElement('td');
        if (i === j) { td.className = 'diag'; tr.appendChild(td); return; }
        const sa = resolved[i].sign, sb = resolved[j].sign;
        const unsettled = !sa || !sb;
        const kind = unsettled ? 'neutral' : relation(sa.animalIndex, sb.animalIndex);
        td.appendChild(relationGlyph(kind, { unsettled }));
        td.addEventListener('click', () => {
          readoutSlot.innerHTML = '';
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <div class="row between"><b>${rowP.display_name}</b> <span class="mono">×</span> <b>${colP.display_name}</b></div>
            <div class="mono" style="font-size:12px;color:var(--text-2);margin-top:6px">
              ${unsettled ? 'One or both birth years are unsettled — no relation can be read.' : `${sa.animal} (${sa.element}) × ${sb.animal} (${sb.element}) → ${kind}`}
            </div>
          `;
          readoutSlot.appendChild(card);
        });
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    matrixSlot.appendChild(table);
  }

  // overall counts
  const overallSlot = root.querySelector('#overall-slot');
  const pairCounts = { clash: 0, trine: 0, harmony: 0, same: 0 };
  let nPairs = 0;
  for (let i = 0; i < withSign.length; i++) {
    for (let j = i + 1; j < withSign.length; j++) {
      nPairs++;
      const kind = relation(withSign[i].sign.animalIndex, withSign[j].sign.animalIndex);
      if (pairCounts[kind] != null) pairCounts[kind]++;
    }
  }
  if (!nPairs) {
    overallSlot.appendChild(emptyState({ missing: 'No resolvable pairs.', why: 'Fewer than two people have a full, unambiguous birth date.' }));
  } else {
    const exp = expectedCounts(nPairs);
    for (const kind of ['clash', 'trine', 'harmony', 'same']) {
      overallSlot.appendChild(barRow({ label: kind, value: pairCounts[kind], max: Math.max(pairCounts[kind], exp[kind], 1), display: `${pairCounts[kind]} (expect ${exp[kind].toFixed(2)})` }));
    }
    root.querySelector('#control-btn').addEventListener('click', () => {
      const shuffled = [...withSign.map((r) => r.sign.animalIndex)];
      for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
      const shCounts = { clash: 0, trine: 0, harmony: 0, same: 0 };
      for (let i = 0; i < shuffled.length; i++) for (let j = i + 1; j < shuffled.length; j++) { const k = relation(shuffled[i], shuffled[j]); if (shCounts[k] != null) shCounts[k]++; }
      const cs = root.querySelector('#control-slot');
      cs.innerHTML = '<div class="section-label" style="margin-bottom:4px">One random shuffle of the same signs</div>';
      for (const kind of ['clash', 'trine', 'harmony', 'same']) {
        cs.appendChild(barRow({ label: kind, value: shCounts[kind], max: Math.max(shCounts[kind], exp[kind], 1), display: `${shCounts[kind]}` }));
      }
    });
  }

  // children vs parents
  const parentSlot = root.querySelector('#parent-slot');
  const parentRels = rels.filter((r) => r.kind === 'parent');
  const pcPairs = [];
  for (const r of parentRels) {
    const parent = resolved.find((x) => x.p.id === r.a_id);
    const child = resolved.find((x) => x.p.id === r.b_id);
    if (parent && child && parent.sign && child.sign) pcPairs.push({ parent: parent.p, child: child.p, kind: relation(parent.sign.animalIndex, child.sign.animalIndex) });
  }
  if (!parentRels.length) {
    parentSlot.appendChild(emptyState({ missing: 'No parent/child relationships recorded.', why: 'Add them from the Relations map.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
  } else if (!pcPairs.length) {
    parentSlot.appendChild(emptyState({ missing: 'No parent/child pair has two resolvable birth dates.', why: `${parentRels.length} parent/child link(s) exist, but at least one side is missing a full date.` }));
  } else {
    const exp = expectedCounts(pcPairs.length);
    const counts = { clash: 0, trine: 0, harmony: 0, same: 0 };
    for (const pc of pcPairs) if (counts[pc.kind] != null) counts[pc.kind]++;
    for (const kind of ['clash', 'trine', 'harmony', 'same']) {
      parentSlot.appendChild(barRow({ label: kind, value: counts[kind], max: Math.max(counts[kind], exp[kind], 1), display: `${counts[kind]} (expect ${exp[kind].toFixed(2)})` }));
    }
  }

  // event date numbers
  const eventNumSlot = root.querySelector('#event-num-slot');
  const datedEvents = events.filter((e) => e.date);
  if (!datedEvents.length) {
    eventNumSlot.appendChild(emptyState({ missing: 'No fully-dated events yet.', why: 'Event-date numbers need a full day/month/year on the event.' }));
  } else {
    const counts = {};
    for (const e of datedEvents) {
      const lp = lifePath(e.date);
      if (lp.ok) counts[lp.value] = (counts[lp.value] || 0) + 1;
    }
    const n = datedEvents.length;
    Object.keys(counts).map(Number).sort((a, b) => b - a).forEach((v) => {
      const expected = expectedDigitCount(n, 9);
      eventNumSlot.appendChild(barRow({ label: `Reduces to ${v}`, value: counts[v], max: Math.max(counts[v], expected, 1), display: `${counts[v]} (expect ${expected.toFixed(1)})` }));
    });
  }

  // findings
  const findingsSlot = root.querySelector('#findings-slot');
  if (!findings.length) {
    findingsSlot.appendChild(emptyState({ missing: 'No findings saved yet.', why: 'Findings are the patterns worth remembering — save one from what you see above.' }));
  } else {
    for (const f of findings) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div>${f.summary}</div><div class="mono" style="font-size:11px;color:var(--text-3);margin-top:4px">observed ${f.observed ?? '—'} · expected ${f.expected != null ? f.expected.toFixed(2) : '—'}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.style.marginTop = '6px';
      btn.textContent = f.kept ? '★ Kept' : 'Keep this';
      btn.addEventListener('click', async () => { await store.keepFinding(f.id, !f.kept); render(root, ctx); });
      card.appendChild(btn);
      findingsSlot.appendChild(card);
    }
  }
}
