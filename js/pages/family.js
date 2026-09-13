// Family overview — what a family-case opens on: the members as faces
// (tap one → their profile), then the Relations map for the household.
// Faces are decoded before the row is shown, so they arrive with the page
// instead of popping in after it (Stage 1 of her redesign, 2026-09-07).
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { insertFamily } from '../lookup.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  // loaded early (not just for the map at the bottom): the Members header's
  // own "+ From Wikipedia" button and the empty-state offer both open its
  // "Add people" drawer directly (the family door, 2026-09-13 — the same
  // search/pick/+family flow, just reachable from the top of the page)
  const relations = await import('./relations.js');
  const kase = await store.getCase(ctx.caseId);
  const people = await store.listPeople(ctx.caseId);
  ctx.setTitle(kase ? kase.name : 'Family');

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="row between">
          <div class="panel-title" style="margin:0">Members <span class="mono" style="color:var(--text-3);font-size:11px">· ${people.length}</span></div>
          <button class="btn btn-ghost btn-sm" id="members-wiki-btn" title="Look up one or many people on Wikipedia and add them">+ From Wikipedia</button>
        </div>
        <div class="faces-row" id="faces"></div>
      </div>
      <div id="map-slot"></div>
    </div>
  `;
  root.querySelector('#members-wiki-btn').addEventListener('click', () => ctx.openDrawer((body) => relations.renderAddPerson(body, ctx, 'lookup')));

  const faces = root.querySelector('#faces');
  if (!people.length) {
    faces.appendChild(emptyState({
      missing: 'No family members yet.',
      why: 'Add the first person below, or pull the whole family from Wikipedia.',
      action: kase ? `Find ${kase.name} on Wikipedia` : 'Find them on Wikipedia',
      onAction: () => ctx.openDrawer((body) => relations.renderAddPerson(body, ctx, 'lookup', kase ? kase.name : null)),
    }));
  }
  const cards = await Promise.all(people.map(async (p) => {
    const f = document.createElement('div');
    f.className = 'face-card';
    f.innerHTML = `<div class="face" style="width:56px;height:56px"><span class="initials">${initials(p.display_name)}</span></div><div class="name">${p.display_name}</div>`;
    f.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
    const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
    if (src && await preloadImage(src)) {
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      img.addEventListener('load', () => f.querySelector('.initials')?.remove());
      img.addEventListener('error', () => img.remove());
      f.querySelector('.face').appendChild(img);
    }
    // the next hop (her ask, 2026-09-13): someone who arrived with their own
    // Wikidata record but no relatives yet gets one tap to pull theirs too
    if (p.wikidata_id) {
      const rels = await store.listRelationshipsForPerson(p.id);
      if (!rels.length) {
        const famBtn = document.createElement('button');
        famBtn.type = 'button';
        famBtn.className = 'linklike';
        famBtn.style.cssText = 'font-size:10px;color:var(--text-3)';
        famBtn.textContent = '+ family';
        famBtn.title = `Pull ${p.display_name.split(/\s+/)[0]}'s family from Wikipedia too`;
        famBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          famBtn.disabled = true;
          await insertFamily(store, ctx.caseId, p.id, p.wikidata_id, (msg) => { famBtn.textContent = msg; });
          ctx.rerender();
        });
        f.appendChild(famBtn);
      }
    }
    return f;
  }));
  for (const f of cards) faces.appendChild(f);

  // the household's map, with its own + Person / + Relationship controls
  await relations.render(root.querySelector('#map-slot'), ctx);
  ctx.setTitle(kase ? kase.name : 'Family');
}
