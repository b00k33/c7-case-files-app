import { lifePath, birthdayNumber, personalYear, universalYear, expression, soulUrge, personality } from '../numerology.js';
import { signFor } from '../chinese.js';
import { sunSign } from '../western.js';
import { relation } from '../relations.js';
import { makeToken, relationGlyph, barRow, emptyState, verificationConfidence, confidenceBand } from '../indicators.js';

function ageAt(birthISO, atISO) {
  const b = new Date(birthISO), a = new Date(atISO);
  let years = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) years--;
  return years;
}

async function evidenceStatusForPerson(store, personId) {
  const links = await store.listLinksForTarget('person', personId);
  const hasStrong = links.some((l) => ['two_plus', 'single'].includes(l.evidence_verification));
  const hasDisputed = links.some((l) => ['disputed', 'dead_link'].includes(l.evidence_verification));
  if (hasDisputed) return 'contradicted';
  if (hasStrong) return 'sourced';
  return 'drafted';
}

function chartPanel(person, status) {
  const el = document.createElement('div');
  const hasFullDate = person.birth_precision === 'day' && !!person.birth_date;

  if (!hasFullDate) {
    let why = 'No birth date on file.';
    if (person.birth_precision === 'range' && person.birth_year_min) {
      why = `Birth year contested — ${person.birth_year_min} or ${person.birth_year_max}. No day or month known for either candidate, so no chart can be drawn for either.`;
    } else if (person.birth_precision === 'year' && person.birth_year_min) {
      why = `Only the birth year (${person.birth_year_min}) is known. Life path, personal year and sun sign all need a day and month.`;
    } else if (person.birth_precision === 'month') {
      why = 'Only a birth month is known — a day is still needed.';
    }
    el.appendChild(emptyState({ missing: 'Chart cannot be drawn.', why, action: null }));
    return el;
  }

  const lp = lifePath(person.birth_date);
  const bn = birthdayNumber(person.birth_date);
  const thisYear = new Date().getFullYear();
  const py = personalYear(person.birth_date, thisYear);
  const uy = universalYear(thisYear);
  const nameForCalc = person.name_at_birth || person.display_name;
  const expr = expression(nameForCalc);
  const su = soulUrge(nameForCalc);
  const pers = personality(nameForCalc);
  const chinese = signFor(person.birth_date);
  const sun = sunSign(person.birth_date);

  const tokRow = document.createElement('div');
  tokRow.className = 'token-row';
  tokRow.style.gap = '10px';
  tokRow.appendChild(makeToken('lifePath', { status, master: lp.master, value: lp.value }));
  tokRow.appendChild(makeToken('personalYear', { status, master: py.master, value: py.value }));
  tokRow.appendChild(makeToken('animalYear', { status, boundary: chinese.boundary, animal: chinese.animal, animalIndex: chinese.animalIndex, element: chinese.element }));
  tokRow.appendChild(makeToken('sunSign', { status, cusp: sun.cusp, sign: sun.sign }));
  el.appendChild(tokRow);

  const grid = document.createElement('div');
  grid.className = 'grid-2';
  grid.style.marginTop = '16px';

  const left = document.createElement('div');
  left.className = 'stack';
  left.innerHTML = `
    <div class="mono" style="font-size:12px;color:var(--text-2)">
      Life path ${lp.value}${lp.master ? ' (master)' : ''} — ${lp.parts.day}→${lp.parts.dayReduced} · ${lp.parts.month}→${lp.parts.monthReduced} · ${lp.parts.year}→${lp.parts.yearReduced} · = ${lp.value}
    </div>
    <div class="mono" style="font-size:12px;color:var(--text-2)">Birthday number ${bn.value}${bn.master ? ' (master)' : ''}</div>
    <div class="mono" style="font-size:12px;color:var(--text-2)">Personal year ${thisYear}: ${py.value}${py.master ? ' (master)' : ''} · Universal year: ${uy.value}${uy.master ? ' (master)' : ''}</div>
    <div class="mono" style="font-size:12px;color:var(--text-2)">${chinese.boundary ? 'Animal year: unresolved (near lunar new year, no CNY date on file for this year)' : `${chinese.animal} · ${chinese.element}`}</div>
    <div class="mono" style="font-size:12px;color:var(--text-2)">${sun.sign}${sun.cusp ? ' (cusp)' : ''}</div>
  `;
  grid.appendChild(left);

  const right = document.createElement('div');
  right.className = 'stack';
  if (expr.ok) {
    right.appendChild(barRow({ label: 'Expression', value: expr.value, max: 33, colorVar: 'var(--violet)' }));
    right.appendChild(barRow({ label: 'Soul urge', value: su.value, max: 33, colorVar: 'var(--violet)' }));
    right.appendChild(barRow({ label: 'Personality', value: pers.value, max: 33, colorVar: 'var(--violet)' }));
  } else {
    right.appendChild(emptyState({ missing: 'No name to derive expression / soul urge / personality.', why: 'These need a name at birth (or display name).' }));
  }
  grid.appendChild(right);
  el.appendChild(grid);

  return el;
}

export async function render(root, ctx, personId) {
  const { store } = ctx;

  if (!personId || !ctx.caseId) {
    const people = ctx.caseId ? await store.listPeople(ctx.caseId) : [];
    root.innerHTML = '<div class="panel"><div class="panel-title">Open a subject file</div><div id="pick-list" class="stack" style="gap:2px"></div></div>';
    const list = root.querySelector('#pick-list');
    if (!people.length) {
      list.appendChild(emptyState({ missing: 'No people in this case yet.', why: 'Add people from the Relations map.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
    }
    for (const p of people) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${p.display_name}</div></div>`;
      row.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      list.appendChild(row);
    }
    return;
  }

  const person = await store.getPerson(personId);
  if (!person) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'This person could not be found.', why: 'They may have been deleted.' }));
    return;
  }
  ctx.setTitle(person.display_name);

  const [aliases, addresses, rels, events, links, questions, status] = await Promise.all([
    store.listAliases(person.id),
    store.listAddresses(person.id),
    store.listRelationshipsForPerson(person.id),
    store.listEventsForPerson(person.id),
    store.listLinksForTarget('person', person.id),
    store.listQuestions(ctx.caseId),
    evidenceStatusForPerson(store, person.id),
  ]);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="row between">
          <div>
            <h2 class="title" style="font-size:24px">${person.display_name}</h2>
            <div class="mono" style="color:var(--text-3);font-size:11px;margin-top:4px">
              ${person.ref_code || ''} ${person.kind !== 'person' ? '· ' + person.kind : ''} · <span class="chip">${person.status}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" id="edit-person-btn">Edit</button>
        </div>
        ${aliases.length ? `<div class="row wrap" style="margin-top:12px;gap:6px">${aliases.map((a) => `<span class="chip">${a.alias} · ${a.kind}</span>`).join('')}</div>` : ''}
        ${person.occupation ? `<p style="margin-top:12px;color:var(--text-2)">${person.occupation}</p>` : ''}
        ${person.notes ? `<p style="margin-top:8px;color:var(--text-3);font-size:12px">${person.notes}</p>` : ''}
      </div>

      <div class="panel">
        <div class="panel-title">Chart</div>
        <div id="chart-slot"></div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Addresses</div>
          <div id="address-list" class="stack" style="gap:6px"></div>
        </div>
        <div class="panel">
          <div class="panel-title">Relations</div>
          <div id="rel-list" class="stack" style="gap:6px"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Timeline</div>
        <div id="timeline-list" class="stack" style="gap:10px"></div>
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="panel-title">Open questions</div>
          <div id="question-list" class="stack" style="gap:2px"></div>
        </div>
        <div class="panel">
          <div class="panel-title">Attached evidence</div>
          <div id="evidence-list" class="stack" style="gap:2px"></div>
        </div>
      </div>
    </div>
  `;

  root.querySelector('#chart-slot').appendChild(chartPanel(person, status));

  root.querySelector('#edit-person-btn').addEventListener('click', () => {
    ctx.openDrawer((body) => renderEditForm(body, ctx, person));
  });

  // addresses
  const addrEl = root.querySelector('#address-list');
  if (!addresses.length) {
    addrEl.appendChild(emptyState({ missing: 'No addresses on file.', why: 'Nothing has been logged for this person yet.' }));
  } else {
    for (const a of addresses) {
      const row = document.createElement('div');
      row.innerHTML = `<div>${a.label}</div><div class="mono" style="color:var(--text-3);font-size:11px">${a.from_year || '?'}–${a.to_year || 'present'}</div>`;
      addrEl.appendChild(row);
    }
  }

  // relations
  const relEl = root.querySelector('#rel-list');
  if (!rels.length) {
    relEl.appendChild(emptyState({ missing: 'No relationships recorded.', why: 'Add family, household or associate links from the Relations map.', action: 'Go to Relations', onAction: () => ctx.navigate('#/relations') }));
  } else {
    for (const r of rels) {
      const otherId = r.a_id === person.id ? r.b_id : r.a_id;
      const other = await store.getPerson(otherId);
      if (!other) continue;
      const mySign = signFor(person.birth_date);
      const otherSign = signFor(other.birth_date);
      const unsettled = !(mySign.ok && !mySign.boundary && otherSign.ok && !otherSign.boundary);
      const kind = unsettled ? null : relation(mySign.animalIndex, otherSign.animalIndex);

      const row = document.createElement('div');
      row.className = 'row between';
      const dirLabel = r.kind === 'parent' ? (r.a_id === person.id ? 'parent of' : 'child of') : r.kind;
      const wrap = document.createElement('div');
      wrap.className = 'row';
      wrap.style.gap = '8px';
      const glyph = relationGlyph(kind || 'neutral', { unsettled });
      wrap.appendChild(glyph);
      const label = document.createElement('span');
      label.innerHTML = `<a href="#/subject/${other.id}" style="color:var(--text)">${other.display_name}</a> <span class="mono" style="color:var(--text-3);font-size:11px">${dirLabel}${r.confirmed ? '' : ' · unconfirmed'}</span>`;
      wrap.appendChild(label);
      row.appendChild(wrap);
      relEl.appendChild(row);
      relEl.appendChild(barRow({ label: 'confidence', value: r.confidence, max: 100 }));
    }
  }

  // timeline: events + linked evidence, merged and sorted
  const timelineEl = root.querySelector('#timeline-list');
  const timelineItems = [];
  for (const e of events) {
    const evLinks = await store.listLinksForTarget('event', e.id);
    timelineItems.push({ kind: 'event', date: e.date || (e.date_year_min ? `${e.date_year_min}` : null), title: e.title, sub: e.kind, links: evLinks });
  }
  for (const l of links) {
    timelineItems.push({ kind: 'evidence', date: null, title: l.evidence_title, sub: `${l.evidence_type} · ${l.evidence_verification}`, verification: l.evidence_verification, evidenceId: l.evidence_id });
  }
  timelineItems.sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);

  if (!timelineItems.length) {
    timelineEl.appendChild(emptyState({ missing: 'Nothing on this timeline yet.', why: 'Add events or link evidence to this person from Evidence or Import.' }));
  } else {
    for (const item of timelineItems) {
      const card = document.createElement('div');
      card.className = 'card';
      const conf = item.evidenceId
        ? verificationConfidence(item.verification)
        : (item.links && item.links.length ? Math.max(...item.links.map((l) => verificationConfidence(l.evidence_verification))) : 0);
      card.innerHTML = `
        <div class="row between">
          <div>
            <div>${item.title}</div>
            <div class="mono" style="color:var(--text-3);font-size:11px">${item.date ? item.date + ' · ' : ''}${item.sub}</div>
          </div>
        </div>
      `;
      card.appendChild(barRow({ label: 'confidence', value: conf, max: 100 }));
      if (item.evidenceId) card.addEventListener('click', () => ctx.navigate('#/evidence'));
      timelineEl.appendChild(card);
    }
  }

  // open questions (case-wide — the schema has no per-person link for questions)
  const qEl = root.querySelector('#question-list');
  const open = questions.filter((q) => !q.resolved);
  if (!open.length) {
    qEl.appendChild(emptyState({ missing: 'No open questions for this case.', why: 'Questions raised during Review land here.' }));
  } else {
    for (const q of open) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.style.cursor = 'default';
      row.innerHTML = `<div class="main"><div class="title" style="font-size:12px">${q.text}</div></div>`;
      qEl.appendChild(row);
    }
  }

  // attached evidence list
  const evEl = root.querySelector('#evidence-list');
  if (!links.length) {
    evEl.appendChild(emptyState({ missing: 'No evidence linked to this person.', why: 'Link evidence from the Evidence page.', action: 'Go to Evidence', onAction: () => ctx.navigate('#/evidence') }));
  } else {
    for (const l of links) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<div class="main"><div class="title">${l.evidence_title}</div><div class="sub">${l.evidence_type}</div></div><span class="chip ${l.evidence_verification === 'two_plus' ? 'green' : l.evidence_verification === 'drafted' ? '' : 'brass'}">${l.evidence_verification}</span>`;
      row.addEventListener('click', () => ctx.navigate('#/evidence'));
      evEl.appendChild(row);
    }
  }
}

function renderEditForm(body, ctx, person) {
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:16px">Edit ${person.display_name}</h3>
    <div class="field"><label>Display name</label><input type="text" id="f-name" value="${person.display_name}"></div>
    <div class="field"><label>Name at birth</label><input type="text" id="f-nab" value="${person.name_at_birth || ''}"></div>
    <div class="field"><label>Birth date</label><input type="date" id="f-bdate" value="${person.birth_date || ''}"></div>
    <div class="field"><label>Birth precision</label>
      <select id="f-bprec">
        ${['day', 'month', 'year', 'range', 'unknown'].map((p) => `<option value="${p}" ${p === person.birth_precision ? 'selected' : ''}>${p}</option>`).join('')}
      </select>
    </div>
    <div class="row" style="gap:8px">
      <div class="field" style="flex:1"><label>Year min (if range)</label><input type="number" id="f-ymin" value="${person.birth_year_min ?? ''}"></div>
      <div class="field" style="flex:1"><label>Year max (if range)</label><input type="number" id="f-ymax" value="${person.birth_year_max ?? ''}"></div>
    </div>
    <div class="field"><label>Occupation</label><input type="text" id="f-occ" value="${person.occupation || ''}"></div>
    <div class="field"><label>Notes</label><textarea id="f-notes">${person.notes || ''}</textarea></div>
    <button class="btn btn-primary" id="save-person-btn">Save</button>
  `;
  body.querySelector('#save-person-btn').addEventListener('click', async () => {
    await ctx.store.updatePerson(person.id, {
      display_name: body.querySelector('#f-name').value,
      name_at_birth: body.querySelector('#f-nab').value || null,
      birth_date: body.querySelector('#f-bdate').value || null,
      birth_precision: body.querySelector('#f-bprec').value,
      birth_year_min: body.querySelector('#f-ymin').value ? parseInt(body.querySelector('#f-ymin').value, 10) : null,
      birth_year_max: body.querySelector('#f-ymax').value ? parseInt(body.querySelector('#f-ymax').value, 10) : null,
      occupation: body.querySelector('#f-occ').value || null,
      notes: body.querySelector('#f-notes').value || null,
    });
    ctx.closeDrawer();
    render(document.getElementById('page-root'), ctx, person.id);
  });
}
