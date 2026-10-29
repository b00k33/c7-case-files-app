import { signFor, ANIMALS, animalIndex } from '../chinese.js';
import { emptyState, animalHtml, animalLabel, zodiacGroup } from '../indicators.js';
import { exactBirth } from '../person-dates.js';
import { clearInlineNote } from '../ui.js';
import { autoCaseName, looksHurried } from '../names.js';
import { sceneSvg, playOnArrival, zodiacSvg } from '../story-art.js';

// her 2026-10-25 "add the scene gallery to the Fun & Zodiac page": every
// Their Story milestone scene in one place, the same drawings the timeline uses
const SCENE_GALLERY = [
  ['met', 'Met', 'two people walk together, a heart pops up'],
  ['dating', 'Started dating', 'two hearts circle each other'],
  ['engaged', 'Engaged', 'the ring box opens, the diamond sparkles'],
  ['married', 'Married', 'bells swing under the arch, confetti falls'],
  ['child', 'A child is born', 'the stork flies in, the cradle rocks'],
  ['separated', 'Ended', 'the heart cracks and drifts apart'],
  ['death', 'Ended by a death', 'a quiet candle flickers'],
  ['reunited', 'Back together', 'the two halves join, the heart glows'],
  ['other', 'Anything else', 'a gold star turns'],
];
const scenesSeen = new Set(); // each scene plays once a session as it scrolls into view, not on every redraw
let zooSeen = false; // the twelve animals pop in once a session
let justAdded = null; // the person just added: their row, their group and their animal greet them after the redraw

const FUN_CASE_NAME = 'Fun & Zodiac';

// A dedicated, always-there case for this — she shouldn't have to create or
// pick a case first just to try this out. Nothing written here goes through
// claim/review; it's not evidentiary research, it's noticing patterns.
async function getOrCreateFunCase(store) {
  const cases = await store.listCases();
  const fun = cases.filter((c) => c.kind === 'fun');
  if (fun.length > 1) {
    // two Fun & Zodiac cases (found 2026-10-29: one held her 17 people, the
    // other nothing): keep the fullest; an EMPTY duplicate folds away (soft
    // delete, restorable — her pick). One that holds anybody is never touched.
    const counts = await Promise.all(fun.map((c) => store.listPeople(c.id).then((p) => p.length)));
    const keep = fun[counts.indexOf(Math.max(...counts))];
    for (let i = 0; i < fun.length; i++) if (fun[i] !== keep && counts[i] === 0) await store.softDeleteCase(fun[i].id);
    return keep;
  }
  if (fun.length) return fun[0];
  return store.createCase({
    name: FUN_CASE_NAME,
    kind: 'fun',
    description: 'Not research. Everything added here is live immediately, no review queue.',
  });
}

async function findOrCreateTag(store, name) {
  const existing = (await store.listTags()).find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return store.createTag(name);
}

let lastNote = null; // shown once, on the next render — a render() replaces the button an inline note would hang off

export async function render(root, ctx) {
  const { store } = ctx;
  const kase = await getOrCreateFunCase(store);

  // duplicates are folded away automatically, no button — this page is
  // explicitly "not research" (her call, 2026-09-05: "thats too complicated,
  // make it easier"), so a same-name match is just merged on sight rather
  // than asking her to notice and confirm it. Oldest entry survives.
  let mergedCount = 0;
  {
    const dupGroups = {};
    for (const p of await store.listPeople(kase.id)) {
      const key = p.display_name.trim().toLowerCase();
      (dupGroups[key] = dupGroups[key] || []).push(p);
    }
    for (const group of Object.values(dupGroups)) {
      if (group.length < 2) continue;
      group.sort((a, b) => (a.created_at || '') < (b.created_at || '') ? -1 : 1);
      const [keep, ...rest] = group;
      for (const dup of rest) await store.mergePerson(keep.id, dup.id);
      mergedCount += rest.length;
    }
  }
  const people = await store.listPeople(kase.id);

  root.innerHTML = `
    <div class="stack">
      <div class="panel" style="background:var(--ink-2)">
        <p style="margin:0;color:var(--text-2);font-size:12px">
          <span class="fz-spark" aria-hidden="true">✦</span> Just for fun — nothing on this page goes through Review. Add someone, note a trait, and see whether it clusters by sign.
        </p>
      </div>

      <div class="panel">
        <div class="panel-title">Add someone</div>
        <div class="field"><label>Name</label><input type="text" id="f-name" placeholder="Salma Hayek"></div>
        <div class="field"><label>Birth date</label><div class="fz-bdate"><input type="date" id="f-bdate"><div class="fz-preview" id="f-preview" aria-live="polite"></div></div></div>
        <div class="field"><label>Trait(s) you noticed — comma separated</label><input type="text" id="f-traits" placeholder="loves dogs, outspoken"></div>
        <div class="field"><label>Clip link (optional)</label><input type="text" id="f-link" placeholder="https://..."></div>
        <div class="field"><label>Quote (optional)</label><input type="text" id="f-quote" placeholder="What they said"></div>
        <button class="btn btn-primary" id="f-add">+ Add</button>
        <div id="f-note"></div>
      </div>

      <div id="sign-groups" class="stack" style="gap:16px"></div>

      <div class="panel">
        <div class="panel-title">The twelve animals</div>
        <div class="fz-zoo" id="fz-zoo"></div>
      </div>

      <div class="panel">
        <div class="panel-title">Every milestone scene</div>
        <div class="fz-scenes" id="fz-scenes"></div>
      </div>
    </div>
  `;

  // the sign shows itself as the birth date is typed: the animal's face pops in beside the
  // field and its tile in "The twelve animals" lights up
  const bdateEl = root.querySelector('#f-bdate');
  const preview = root.querySelector('#f-preview');
  let previewAnimal = null;
  const showSign = () => {
    const s = bdateEl.value ? signFor(bdateEl.value) : { ok: false };
    const animal = s.ok && !s.boundary ? s.animal : null;
    root.querySelectorAll('.fz-animal.pick').forEach((t) => t.classList.remove('pick'));
    if (animal) root.querySelector(`.fz-animal[data-animal="${animal}"]`)?.classList.add('pick');
    if (animal === previewAnimal && preview.childElementCount) return;
    previewAnimal = animal;
    preview.innerHTML = animal
      ? `<div class="fz-pv">${zodiacSvg(animal, 'fz-pv-zod')}<span><b>${animalLabel(animal)}</b>${s.element ? ` · ${s.element}` : ''}</span></div>`
      : s.ok && s.boundary ? '<div class="fz-pv"><span>Near Lunar New Year — sign unsure</span></div>' : '';
  };
  bdateEl.addEventListener('input', showSign);
  bdateEl.addEventListener('change', showSign);

  const sceneGrid = root.querySelector('#fz-scenes');
  sceneGrid.innerHTML = SCENE_GALLERY.map(([kind, title, what], i) => `
    <div class="fz-scene" data-st-key="fz-${kind}" style="--i:${i}">${sceneSvg(kind)}
      <div class="fz-scene-txt"><b>${title}</b><span>${what}</span></div>
    </div>`).join('');
  const sceneCards = [...sceneGrid.querySelectorAll('.fz-scene')];
  playOnArrival(sceneCards, scenesSeen);
  // pointing at a scene plays it again (the scene CSS moves under .st-run)
  for (const c of sceneCards) {
    c.addEventListener('mouseenter', () => c.classList.add('st-run'));
    c.addEventListener('mouseleave', () => c.classList.remove('st-run'));
  }

  if (mergedCount && !lastNote) lastNote = `Folded ${mergedCount} duplicate ${mergedCount === 1 ? 'entry' : 'entries'} into the existing ${mergedCount === 1 ? 'one' : 'ones'} — nothing lost, just tidied.`;

  if (lastNote) {
    const note = document.createElement('div');
    note.className = 'inline-note';
    note.style.borderLeftColor = 'var(--brass)';
    note.textContent = lastNote;
    root.querySelector('#f-note').appendChild(note);
    lastNote = null;
  }

  root.querySelector('#f-add').addEventListener('click', async () => {
    const btn = root.querySelector('#f-add');
    clearInlineNote(btn);
    const typedName = root.querySelector('#f-name').value.trim();
    if (!typedName) return;
    // names (2026-09-13): capitalised the moment it's typed
    const hurried = looksHurried(typedName);
    const name = hurried ? autoCaseName(typedName) : typedName;
    const bdate = root.querySelector('#f-bdate').value || null;
    const traits = root.querySelector('#f-traits').value.split(',').map((t) => t.trim()).filter(Boolean);
    const link = root.querySelector('#f-link').value.trim();
    const quote = root.querySelector('#f-quote').value.trim();

    // re-adding a name folds into the existing entry rather than making a
    // second one — a quick-capture page like this has no rename/merge tools,
    // so the duplicate would otherwise just sit there forever
    const existing = people.find((p) => p.display_name.trim().toLowerCase() === name.toLowerCase());
    let person = existing;
    if (person) {
      if (bdate && !person.birth_date) await store.updatePerson(person.id, { birth_date: bdate, birth_precision: 'day' });
    } else {
      person = await store.createPerson({
        case_id: kase.id, display_name: name,
        birth_date: bdate, birth_precision: bdate ? 'day' : 'unknown',
        name_needs_formatting: hurried ? 1 : 0,
      });
    }

    for (const t of traits) {
      const tagId = await findOrCreateTag(store, t);
      await store.tagTarget(tagId, 'person', person.id);
    }

    if (link || quote) {
      const ev = await store.createEvidence({
        case_id: kase.id, type: 'video', title: `${name} — clip`,
        original_url: link || null, verification: 'single',
      });
      await store.linkEvidence({ evidence_id: ev.id, target_type: 'person', target_id: person.id });
      if (quote) await store.createVideoMoment({ evidence_id: ev.id, t_ms: 0, quote, label: name });
    }

    if (existing) lastNote = `${name} was already here — added this to their existing entry instead of making a new one.`;
    const sign = signFor(bdate || person.birth_date);
    justAdded = { id: person.id, animal: sign.ok && !sign.boundary ? sign.animal : null };
    render(root, ctx);
  });

  // group everyone with a resolvable sign by animal; keep the rest separate
  const groups = {};
  const unresolved = [];
  for (const p of people) {
    const sign = signFor(exactBirth(p)); // never p.birth_date — see js/person-dates.js
    if (!sign.ok || sign.boundary) { unresolved.push(p); continue; }
    (groups[sign.animal] = groups[sign.animal] || []).push({ person: p, sign });
  }

  // the twelve animals (her 2026-10-25 ask): the same living cartoon faces as Their Story and
  // the zodiac map, in zodiac order, each with its latest year and how many people here share it
  const thisYear = new Date().getFullYear();
  const zoo = root.querySelector('#fz-zoo');
  zoo.innerHTML = ANIMALS.map((a, i) => {
    const year = thisYear - ((animalIndex(thisYear) - i + 12) % 12);
    const n = (groups[a] || []).length;
    return `<div class="fz-animal${year === thisYear ? ' now' : ''}" data-animal="${a}" style="--i:${i};--zone:var(--zc-${zodiacGroup(a)})" title="${animalLabel(a)} · ${year === thisYear ? 'this year' : `last ${year}`}">
      ${zodiacSvg(a, 'fz-zod')}
      <b>${animalLabel(a)}</b>
      <span class="mono">${year}${n ? ` · ${n} here` : ''}</span>
    </div>`;
  }).join('');
  if (!zooSeen) {
    zooSeen = true;
    zoo.classList.add('fz-zoo-in');
    setTimeout(() => zoo.classList.remove('fz-zoo-in'), 2400);
  }

  const tagsByPerson = {};
  for (const p of people) tagsByPerson[p.id] = await store.listTagsForTarget('person', p.id);

  const groupsEl = root.querySelector('#sign-groups');
  const signNames = Object.keys(groups).sort();

  if (!signNames.length && !unresolved.length) {
    groupsEl.appendChild(emptyState({
      missing: 'Nobody added yet.',
      why: 'Add a birth date to see their Chinese zodiac sign, and note anything you noticed about them.',
    }));
  }

  for (const sign of signNames) {
    const entries = groups[sign];
    const panel = document.createElement('div');
    panel.className = 'panel fz-group';
    panel.dataset.animal = sign;
    panel.style.setProperty('--zone', `var(--zc-${zodiacGroup(sign)})`);
    panel.innerHTML = `<div class="panel-title"><span class="fz-gface" aria-hidden="true">${zodiacSvg(sign, 'fz-gzod')}</span>${animalHtml(sign)} <span class="mono" style="color:var(--text-3);font-size:11px">· ${entries.length} ${entries.length === 1 ? 'person' : 'people'}</span></div>`;
    const list = document.createElement('div');
    list.className = 'stack';
    list.style.gap = '2px';
    for (const { person, sign: s } of entries) {
      const tags = tagsByPerson[person.id] || [];
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.id = person.id;
      row.innerHTML = `
        <div class="main">
          <div class="title">${person.display_name}</div>
          <div class="sub mono">${s.element} ${animalHtml(s.animal)}</div>
        </div>
        ${tags.length ? `<div class="row wrap" style="gap:4px;max-width:220px;justify-content:flex-end">${tags.map((t, k) => `<span class="chip brass" style="--k:${k}">${t.name}</span>`).join('')}</div>` : ''}
      `;
      row.addEventListener('click', () => ctx.navigate(`#/subject/${person.id}`));
      list.appendChild(row);
    }
    panel.appendChild(list);
    groupsEl.appendChild(panel);
  }

  if (unresolved.length) {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">No confirmed sign yet</div>`;
    const list = document.createElement('div');
    list.className = 'stack';
    list.style.gap = '2px';
    for (const p of unresolved) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.dataset.id = p.id;
      row.innerHTML = `<div class="main"><div class="title">${p.display_name}</div><div class="sub">Add a birth date to calculate their sign</div></div>`;
      row.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      list.appendChild(row);
    }
    panel.appendChild(list);
    groupsEl.appendChild(panel);
  }

  // the one just added is greeted: their row slides in with a glow and their traits pop,
  // their group's animal and its tile in the twelve hop. Only on this redraw.
  if (justAdded) {
    const { id, animal } = justAdded;
    justAdded = null;
    const row = root.querySelector(`#sign-groups .list-row[data-id="${id}"]`);
    const lit = [row, animal && root.querySelector(`.fz-group[data-animal="${animal}"]`), animal && root.querySelector(`.fz-animal[data-animal="${animal}"]`)].filter(Boolean);
    lit.forEach((el) => el.classList.add('fz-hello'));
    if (row) row.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => lit.forEach((el) => el.classList.remove('fz-hello')), 2200);
  }
}
