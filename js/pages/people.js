// People — everyone across every case; tap → their profile.
// Picture rows (her Q15, 2026-09-07; built 2026-09-08): one layout for the
// phone and the desktop — face · name · the three tokens (life path, animal,
// sign), the case they live in as a dim mono note when it isn't just their
// own name. No kind or count text on a row. The Table/List toggle of v62 is
// gone with it: one list, sorted by name, the search box at the top of every
// page does the finding. Faces are decoded before the list is shown, so they
// arrive with the page instead of popping in after it.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { tokensHtml } from '../lifemap.js';
import { markOpened } from './cases.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

async function faceEl(p, size) {
  const el = document.createElement('div');
  el.className = 'face';
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = `<span class="initials">${initials(p.display_name)}</span>`;
  const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
  if (src && await preloadImage(src)) {
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    const initialsEl = el.querySelector('.initials');
    if (img.complete && img.naturalWidth) initialsEl?.remove();
    else img.addEventListener('load', () => initialsEl?.remove());
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

function goToPerson(ctx, p) { markOpened(p.case_id); ctx.setCaseId(p.case_id).then(() => ctx.navigate(`#/subject/${p.id}`)); }

/** One picture row: face · name (· case, when it says something) · the three tokens. */
async function buildPicRow(p, ctx) {
  const row = document.createElement('div');
  row.className = 'pic-row';
  const sameName = (p.case_name || '').trim().toLowerCase() === (p.display_name || '').trim().toLowerCase();
  row.innerHTML = `
    <div class="pic"></div>
    <div class="main">
      <div class="line"><div class="title">${esc(p.display_name)}</div>${!sameName && p.case_name ? `<span class="where" title="The case this person lives in">${esc(p.case_name)}</span>` : ''}</div>
      <div class="line"><div class="lm-tokens">${tokensHtml(p, { compact: true })}</div></div>
    </div>`;
  row.querySelector('.pic').appendChild(await faceEl(p, 48));
  row.addEventListener('click', () => goToPerson(ctx, p));
  return row;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:11px;color:var(--text-3)">${people.length} ${people.length === 1 ? 'person' : 'people'} · every case</span>
        <a class="btn btn-ghost btn-sm" href="#/compare">Compare artists →</a>
      </div>
      <div id="people-body"></div>
    </div>
  `;

  const body = root.querySelector('#people-body');
  if (!people.length) {
    body.appendChild(emptyState({ missing: 'No people yet.', why: 'Create a case about a person and they appear here.' }));
    return;
  }
  const shown = [...people].sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', undefined, { sensitivity: 'base' }));
  // every row is built (faces decoded) before any of them is shown
  const list = document.createElement('div');
  list.className = 'pic-list';
  const rows = await Promise.all(shown.map((p) => buildPicRow(p, ctx)));
  for (const r of rows) list.appendChild(r);
  body.appendChild(list);
}
