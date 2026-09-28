import { lifePath } from '../numerology.js';
import { emptyState } from '../indicators.js';
import { exactBirth } from '../person-dates.js';
import { searchPeople, fillFromWikidata } from '../lookup.js';

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const TRAIT_PICK_KEY = 'c7-trait-gallery-pick';

/**
 * "+ Tag people" (her ask, 2026-09-24, right after v141 shipped — she
 * pasted three lists, ~28 named celebrities, and asked for a fast way to
 * mark them all with "dimples"): paste a name per line, one trait, go.
 * Someone already anywhere in the file (by name, any case) just gets
 * tagged; anyone new is looked up on Wikidata — the same record-fill
 * "+ Person" already has (v138) — and gets their own person-kind case, same
 * as every other add-path in the app (her call, 2026-09-26: "every person
 * should get the full treatment from now on" — this used to land them
 * case-less, in "No case yet," which meant a dimple note was the only thing
 * ever on file for them, tree and lifeline included, with no door open to
 * add more later). The gallery needs a real birth date to place anyone by
 * life path or day, so a bare name with nothing else would never be able to
 * show up in it — this is the one add-path here that's allowed to hit the
 * network, for exactly that reason.
 */
function wireBatchTag(btn, slot, ctx) {
  const { store } = ctx;
  btn.addEventListener('click', () => {
    if (slot.children.length) { slot.innerHTML = ''; return; }
    slot.innerHTML = `
      <div class="field"><label>Trait</label><input type="text" id="tp-trait" placeholder="dimples"></div>
      <div class="field"><label>Names — one per line, or comma separated</label><textarea id="tp-names" style="min-height:90px" placeholder="Ariana Grande&#10;Kate Middleton"></textarea></div>
      <div class="row wrap" style="gap:8px" id="tp-actions"><button class="btn btn-primary btn-sm" id="tp-go">Tag them</button><button class="btn btn-ghost btn-sm" id="tp-cancel">Cancel</button></div>
      <div id="tp-progress" style="margin-top:6px"></div>
    `;
    slot.querySelector('#tp-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    slot.querySelector('#tp-go').addEventListener('click', async () => {
      const trait = slot.querySelector('#tp-trait').value.trim();
      const names = slot.querySelector('#tp-names').value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      const goBtn = slot.querySelector('#tp-go');
      const prog = slot.querySelector('#tp-progress');
      if (!trait || !names.length) { prog.textContent = 'Type a trait and at least one name first.'; return; }
      goBtn.disabled = true;
      const tagId = await store.ensureTag(trait);
      const existing = await store.listAllPeople(); // checked fresh each run, so a name added earlier in THIS same batch is found too
      let created = 0, matched = 0;
      const failed = [];
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        prog.textContent = `${i + 1} of ${names.length} — ${name}`;
        const already = existing.find((p) => p.display_name.trim().toLowerCase() === name.toLowerCase());
        if (already) {
          await store.tagTarget(tagId, 'person', already.id);
          matched++;
          continue;
        }
        try {
          const hits = await searchPeople(name);
          if (!hits.length) { failed.push(name); continue; }
          const m = hits[0]; // the best Wikidata match — reasonable for a named public figure, same trust the rest of this app puts in a Wikidata search
          const kase = await store.createCase({ name: m.label, kind: 'person' });
          const person = await store.createPerson({ case_id: kase.id, display_name: m.label, kind: 'person', wikidata_id: m.id, notes: `Wikidata https://www.wikidata.org/wiki/${m.id}` });
          await fillFromWikidata(store, kase.id, person.id, m.id);
          await store.tagTarget(tagId, 'person', person.id);
          existing.push(person);
          created++;
        } catch (e) { failed.push(name); }
      }
      // the gallery below needs a full page re-render to pick up new people
      // and tags — deferred to her own tap on "Done" rather than firing it
      // immediately, so the summary doesn't vanish the instant it appears
      // (same reasoning as the life-events sheet's own "Done" step)
      prog.innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">Done — ${created} added, ${matched} already here, all tagged “${esc(trait)}.”${failed.length ? ` Couldn't find: ${failed.map(esc).join(', ')}.` : ''}</div>`;
      slot.querySelector('#tp-actions').innerHTML = '<button class="btn btn-primary btn-sm" id="tp-done">Done</button>';
      slot.querySelector('#tp-done').addEventListener('click', () => ctx.rerender());
    });
  });
}

/**
 * Traits gallery (her ask, 2026-09-24: "a gallery of people who have
 * dimples and show that they are either 9 life path or born on 9 day") —
 * cross-case, unlike everything else on this page, since a physical trait
 * isn't scoped to one case. Traits ride the tag system already built for
 * Fun & Zodiac's "note a trait" box, now also settable from any real
 * person's own Edit sheet. Grouped by reason (her pick over a face-grid
 * and a flat list, from three real mocks): a "Life path 9" panel and a
 * "Born on the 9th" panel, someone satisfying both flagged in each.
 */
async function traitsGalleryPanel(ctx) {
  const { store } = ctx;
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.marginBottom = 'var(--sp-4)';
  panel.innerHTML = `
    <div class="row between wrap" style="gap:8px">
      <div class="panel-title">Traits gallery — a trait, crossed with life path 9 or a birthday on the 9th</div>
      <button class="btn btn-ghost btn-sm" id="tag-people-btn">+ Tag people</button>
    </div>
    <div id="tag-people-slot"></div>
  `;
  wireBatchTag(panel.querySelector('#tag-people-btn'), panel.querySelector('#tag-people-slot'), ctx);

  const people = await store.listAllPeople();
  const tagsByPerson = {};
  for (const p of people) tagsByPerson[p.id] = await store.listTagsForTarget('person', p.id);

  // every trait actually in use, anywhere — excludes the event-outcome
  // tags ('outcome:worked'/'outcome:failed'), which ride this same tag
  // table for an unrelated reason (2026-09-07) and aren't traits
  const traitCount = new Map();
  for (const p of people) for (const t of tagsByPerson[p.id]) {
    if (t.name.startsWith('outcome:')) continue;
    traitCount.set(t.name, (traitCount.get(t.name) || 0) + 1);
  }
  const traitNames = [...traitCount.keys()].sort((a, b) => a.localeCompare(b));

  if (!traitNames.length) {
    panel.appendChild(emptyState({
      missing: 'No traits noted on anyone yet.',
      why: 'Add one from a person\'s own Edit sheet — "Traits you\'ve noticed" — or the "+ Tag people" button above, which finds or adds a whole pasted list at once.',
    }));
    return panel;
  }

  const remembered = localStorage.getItem(TRAIT_PICK_KEY);
  let current = traitNames.includes(remembered) ? remembered : traitNames[0];

  const chipRow = document.createElement('div');
  chipRow.className = 'row wrap';
  chipRow.style.cssText = 'gap:6px;margin:8px 0';
  const resultsEl = document.createElement('div');
  panel.appendChild(chipRow);
  panel.appendChild(resultsEl);

  const paintChips = () => {
    chipRow.innerHTML = traitNames.map((name) => `<button type="button" class="chip" data-name="${esc(name)}" style="border:0;cursor:pointer${name === current ? ';background:var(--brass);color:var(--on-brass)' : ''}">${esc(name)} · ${traitCount.get(name)}</button>`).join('');
    chipRow.querySelectorAll('[data-name]').forEach((btn) => btn.addEventListener('click', () => {
      current = btn.dataset.name;
      localStorage.setItem(TRAIT_PICK_KEY, current);
      paintChips();
      paintResults();
    }));
  };

  const paintResults = () => {
    const holders = people.filter((p) => tagsByPerson[p.id].some((t) => t.name === current));
    const withLP = holders.map((p) => ({ p, lp: lifePath(exactBirth(p)) })).filter((r) => r.lp.ok); // never p.birth_date — see js/person-dates.js
    const life9 = withLP.filter((r) => r.lp.value === 9);
    const day9 = withLP.filter((r) => r.lp.parts.day === 9);
    const bothIds = new Set(life9.filter((r) => day9.some((d) => d.p.id === r.p.id)).map((r) => r.p.id));

    resultsEl.innerHTML = '';
    if (!life9.length && !day9.length) {
      resultsEl.appendChild(emptyState({
        missing: `Nobody tagged “${current}” is life path 9 or born on the 9th.`,
        why: `${holders.length} ${holders.length === 1 ? 'person has' : 'people have'} this trait — ${withLP.length} of them have a full birth date to check against.`,
      }));
      return;
    }
    const group = (title, rows) => {
      const box = document.createElement('div');
      box.style.cssText = 'background:var(--ink-2);border-radius:var(--r-lg);padding:var(--sp-3);margin-top:8px';
      box.innerHTML = `<div class="section-label" style="margin-bottom:8px">${title} · ${rows.length}</div>`;
      const list = document.createElement('div');
      list.className = 'stack';
      list.style.gap = '2px';
      for (const r of rows) {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `<div class="main"><div class="title">${esc(r.p.display_name)}</div></div>${bothIds.has(r.p.id) ? '<span class="chip brass" style="border:0">★ both</span>' : ''}`;
        row.addEventListener('click', () => ctx.navigate(`#/subject/${r.p.id}`));
        list.appendChild(row);
      }
      box.appendChild(list);
      return box;
    };
    if (life9.length) resultsEl.appendChild(group('Life path 9', life9));
    if (day9.length) resultsEl.appendChild(group('Born on the 9th', day9));
  };

  paintChips();
  paintResults();
  return panel;
}

// The pair matrix, case-wide relation counts, children-vs-parents, event-date
// numbers and Findings panels were cut 2026-09-28 (ask28 declutter round) —
// no usage signal since they shipped. The Traits gallery above is unrelated
// (cross-case, her own ask, still in active use) and stays as the whole page.
export async function render(root, ctx) {
  root.innerHTML = '<div class="stack"></div>';
  root.querySelector('.stack').appendChild(await traitsGalleryPanel(ctx));
}
