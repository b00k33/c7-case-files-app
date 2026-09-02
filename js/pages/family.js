// Family overview — what a family-case opens on: the members as faces
// (tap one → their profile), then the Relations map for the household.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

export async function render(root, ctx) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  const kase = await store.getCase(ctx.caseId);
  const people = await store.listPeople(ctx.caseId);
  ctx.setTitle(kase ? kase.name : 'Family');

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="row between"><div class="panel-title" style="margin:0">Members <span class="mono" style="color:var(--text-3);font-size:11px">· ${people.length}</span></div></div>
        <div class="faces-row" id="faces"></div>
      </div>
      <div id="map-slot"></div>
    </div>
  `;

  const faces = root.querySelector('#faces');
  if (!people.length) {
    faces.appendChild(emptyState({ missing: 'No family members yet.', why: 'Add the first person below — the map fills in as you add relationships.' }));
  }
  for (const p of people) {
    const f = document.createElement('div');
    f.className = 'face-card';
    f.innerHTML = `<div class="face" style="width:56px;height:56px"><span class="initials">${initials(p.display_name)}</span></div><div class="name">${p.display_name}</div>`;
    f.addEventListener('click', () => ctx.navigate(`#/subject/${p.id}`));
    faces.appendChild(f);
    const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
    if (src) {
      const img = document.createElement('img');
      img.alt = ''; img.src = src;
      img.addEventListener('load', () => f.querySelector('.initials')?.remove());
      img.addEventListener('error', () => img.remove());
      f.querySelector('.face').appendChild(img);
    }
  }

  // the household's map, with its own + Person / + Relationship controls
  const relations = await import('./relations.js');
  await relations.render(root.querySelector('#map-slot'), ctx);
  ctx.setTitle(kase ? kase.name : 'Family');
}
