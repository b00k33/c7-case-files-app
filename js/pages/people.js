// People — everyone across every case, searchable; tap → their profile.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';
import { markOpened } from './cases.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();
  root.innerHTML = `
    <div class="stack">
      <div class="search-box"><span class="ic">⌕</span><input type="search" id="people-search" placeholder="Find a person in any case"></div>
      <div class="panel"><div id="people-list" class="stack" style="gap:2px"></div></div>
    </div>
  `;
  const list = root.querySelector('#people-list');
  const draw = (filter) => {
    list.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const shown = people.filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.case_name || '').toLowerCase().includes(q));
    if (!shown.length) {
      list.appendChild(emptyState({ missing: q ? `No one matching “${filter}”.` : 'No people yet.', why: q ? 'Try part of a name, or the case name.' : 'Create a case about a person and they appear here.' }));
      return;
    }
    for (const p of shown) {
      const row = document.createElement('div');
      row.className = 'list-row people-row';
      row.innerHTML = `<div class="face" style="width:36px;height:36px"><span class="initials">${initials(p.display_name)}</span></div><div class="main"><div class="title">${p.display_name}</div><div class="sub">${p.case_name}${p.occupation ? ' · ' + p.occupation : ''}</div></div>`;
      row.addEventListener('click', async () => { markOpened(p.case_id); await ctx.setCaseId(p.case_id); ctx.navigate(`#/subject/${p.id}`); });
      list.appendChild(row);
      const src = p.photo_path ? null : p.photo_url;
      const put = (s) => { if (!s) return; const img = document.createElement('img'); img.alt = ''; img.src = s; img.addEventListener('load', () => row.querySelector('.initials')?.remove()); img.addEventListener('error', () => img.remove()); row.querySelector('.face').appendChild(img); };
      if (p.photo_path) resolveAssetUrl(p.photo_path, 'image/jpeg').then((u) => put(u || p.photo_url)); else put(src);
    }
  };
  draw('');
  root.querySelector('#people-search').addEventListener('input', (e) => draw(e.target.value));
}
