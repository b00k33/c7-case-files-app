import { signFor } from '../chinese.js';
import { emptyState, animalHtml } from '../indicators.js';
import { exactBirth } from '../person-dates.js';

const FUN_CASE_NAME = 'Fun & Zodiac';

// A dedicated, always-there case for this — she shouldn't have to create or
// pick a case first just to try this out. Nothing written here goes through
// claim/review; it's not evidentiary research, it's noticing patterns.
async function getOrCreateFunCase(store) {
  const cases = await store.listCases();
  const existing = cases.find((c) => c.kind === 'fun');
  if (existing) return existing;
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

export async function render(root, ctx) {
  const { store } = ctx;
  const kase = await getOrCreateFunCase(store);
  const people = await store.listPeople(kase.id);

  root.innerHTML = `
    <div class="stack">
      <div class="panel" style="background:var(--ink-2)">
        <p style="margin:0;color:var(--text-2);font-size:12px">
          ✦ Just for fun — nothing on this page goes through Review. Add someone, note a trait, and see whether it clusters by sign.
        </p>
      </div>

      <div class="panel">
        <div class="panel-title">Add someone</div>
        <div class="field"><label>Name</label><input type="text" id="f-name" placeholder="Salma Hayek"></div>
        <div class="field"><label>Birth date</label><input type="date" id="f-bdate"></div>
        <div class="field"><label>Trait(s) you noticed — comma separated</label><input type="text" id="f-traits" placeholder="loves dogs, outspoken"></div>
        <div class="field"><label>Clip link (optional)</label><input type="text" id="f-link" placeholder="https://..."></div>
        <div class="field"><label>Quote (optional)</label><input type="text" id="f-quote" placeholder="What they said"></div>
        <button class="btn btn-primary" id="f-add">+ Add</button>
      </div>

      <div id="sign-groups" class="stack" style="gap:16px"></div>
    </div>
  `;

  root.querySelector('#f-add').addEventListener('click', async () => {
    const name = root.querySelector('#f-name').value.trim();
    if (!name) return;
    const bdate = root.querySelector('#f-bdate').value || null;
    const traits = root.querySelector('#f-traits').value.split(',').map((t) => t.trim()).filter(Boolean);
    const link = root.querySelector('#f-link').value.trim();
    const quote = root.querySelector('#f-quote').value.trim();

    const person = await store.createPerson({
      case_id: kase.id, display_name: name,
      birth_date: bdate, birth_precision: bdate ? 'day' : 'unknown',
    });

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
    panel.className = 'panel';
    panel.innerHTML = `<div class="panel-title">${animalHtml(sign)} <span class="mono" style="color:var(--text-3);font-size:11px">· ${entries.length} ${entries.length === 1 ? 'person' : 'people'}</span></div>`;
    const list = document.createElement('div');
    list.className = 'stack';
    list.style.gap = '2px';
    for (const { person, sign: s } of entries) {
      const tags = tagsByPerson[person.id] || [];
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <div class="main">
          <div class="title">${person.display_name}</div>
          <div class="sub mono">${s.element} ${animalHtml(s.animal)}</div>
        </div>
        ${tags.length ? `<div class="row wrap" style="gap:4px;max-width:220px;justify-content:flex-end">${tags.map((t) => `<span class="chip brass">${t.name}</span>`).join('')}</div>` : ''}
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
      row.innerHTML = `<div class="main"><div class="title">${p.display_name}</div><div class="sub">Add a birth date to calculate their sign</div></div>`;
      row.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
      list.appendChild(row);
    }
    panel.appendChild(list);
    groupsEl.appendChild(panel);
  }
}
