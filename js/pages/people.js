// People — everyone across every case; tap → their profile.
// Table/Cards toggle (v62, 2026-09-04, same pass as the Cases database —
// STYLE.md's "tables over scattered cards" on desktop; mobile keeps the
// simple list, which already fits a phone).
// Stage 1 of her redesign (2026-09-07): the search box that used to sit
// here is now the one box at the top of every page; faces are decoded
// before the list is shown, so they arrive with the page instead of
// popping in after it.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { markOpened } from './cases.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }

const VIEW_KEY = 'c7-people-view';
function isNarrow() { return window.matchMedia('(max-width: 640px)').matches; }
function getView() {
  if (isNarrow()) return 'list';
  return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'table';
}
function setView(v) { localStorage.setItem(VIEW_KEY, v); }

const SORT_KEY = 'c7-people-sort';
function getSort() {
  try { return JSON.parse(localStorage.getItem(SORT_KEY)) || { key: 'name', dir: 'asc' }; }
  catch (_) { return { key: 'name', dir: 'asc' }; }
}
function setSort(s) { localStorage.setItem(SORT_KEY, JSON.stringify(s)); }

async function faceEl(p, size) {
  const el = document.createElement('div');
  el.className = 'face';
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = `<span class="initials">${initials(p.display_name)}</span>`;
  const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
  if (src && await preloadImage(src)) {
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    img.addEventListener('load', () => el.querySelector('.initials')?.remove());
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

function goToPerson(ctx, p) { markOpened(p.case_id); ctx.setCaseId(p.case_id).then(() => ctx.navigate(`#/subject/${p.id}`)); }

async function buildListRow(p, ctx) {
  const row = document.createElement('div');
  row.className = 'list-row people-row';
  row.innerHTML = `<div class="face-slot"></div><div class="main"><div class="title">${p.display_name}</div><div class="sub">${p.case_name}${p.occupation ? ' · ' + p.occupation : ''}</div></div>`;
  row.querySelector('.face-slot').replaceWith(await faceEl(p, 36));
  row.addEventListener('click', () => goToPerson(ctx, p));
  return row;
}

async function buildRow(p, ctx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><div class="rowname"><div class="thumb-slot"></div>${p.display_name}</div></td>
    <td><span class="chip ${p.case_kind === 'event' ? 'violet' : p.case_kind === 'family' ? 'brass' : ''}">${p.case_name}</span></td>
    <td>${p.occupation || ''}</td>
    <td>${p.nationality || ''}</td>
  `;
  tr.querySelector('.thumb-slot').replaceWith(await faceEl(p, 26));
  tr.addEventListener('click', () => goToPerson(ctx, p));
  return tr;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();
  const view = getView();

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:11px;color:var(--text-3)">${people.length} ${people.length === 1 ? 'person' : 'people'} · every case</span>
        <a class="btn btn-ghost btn-sm" href="#/compare">Compare artists →</a>
        <div class="view-toggle" id="view-toggle">
          <button type="button" data-view="table" class="${view === 'table' ? 'on' : ''}">Table</button>
          <button type="button" data-view="list" class="${view === 'list' ? 'on' : ''}">List</button>
        </div>
      </div>
      <div id="people-body"></div>
    </div>
  `;
  for (const btn of root.querySelectorAll('#view-toggle button')) {
    btn.addEventListener('click', () => { setView(btn.dataset.view); render(root, ctx); });
  }

  const body = root.querySelector('#people-body');
  const sortValue = (p, key) => (key === 'case' ? (p.case_name || '').toLowerCase() : (p.display_name || '').toLowerCase());

  const draw = async () => {
    const sortNow = getSort(); // re-read on every draw — a header click saves then redraws without a full render()
    const arrow = (key) => (sortNow.key === key ? `<span class="arrow">${sortNow.dir === 'asc' ? '▴' : '▾'}</span>` : '');
    body.innerHTML = '';
    if (!people.length) {
      body.appendChild(emptyState({ missing: 'No people yet.', why: 'Create a case about a person and they appear here.' }));
      return;
    }
    const shown = [...people].sort((a, b) => {
      const av = sortValue(a, sortNow.key), bv = sortValue(b, sortNow.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortNow.dir === 'asc' ? cmp : -cmp;
    });
    // every row is built (faces decoded) before any of them is shown
    if (view === 'list') {
      const panel = document.createElement('div');
      panel.className = 'panel';
      const list = document.createElement('div');
      list.className = 'stack';
      list.style.gap = '2px';
      const rows = await Promise.all(shown.map((p) => buildListRow(p, ctx)));
      for (const r of rows) list.appendChild(r);
      panel.appendChild(list);
      body.appendChild(panel);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'panel table-scroll';
      const table = document.createElement('table');
      table.className = 'dense';
      table.innerHTML = `
        <thead><tr>
          <th class="sortable" data-sort="name">Name${arrow('name')}</th>
          <th class="sortable" data-sort="case">Case${arrow('case')}</th>
          <th>Occupation</th>
          <th>Nationality</th>
        </tr></thead>
        <tbody></tbody>
      `;
      for (const th of table.querySelectorAll('th.sortable')) {
        th.addEventListener('click', () => {
          const key = th.dataset.sort;
          setSort(sortNow.key === key ? { key, dir: sortNow.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
          draw();
        });
      }
      const tbody = table.querySelector('tbody');
      const rows = await Promise.all(shown.map((p) => buildRow(p, ctx)));
      for (const r of rows) tbody.appendChild(r);
      wrap.appendChild(table);
      body.appendChild(wrap);
    }
  };
  draw();
}
