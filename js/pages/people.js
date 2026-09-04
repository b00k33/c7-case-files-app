// People — everyone across every case, searchable; tap → their profile.
// Table/Cards toggle (v62, 2026-09-04, same pass as the Cases database —
// STYLE.md's "tables over scattered cards" on desktop; mobile keeps the
// simple list, which already fits a phone).
import { emptyState } from '../indicators.js';
import { resolveAssetUrl } from '../assets.js';
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
  if (src) {
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
  row.innerHTML = `<div class="face" style="width:36px;height:36px"><span class="initials">${initials(p.display_name)}</span></div><div class="main"><div class="title">${p.display_name}</div><div class="sub">${p.case_name}${p.occupation ? ' · ' + p.occupation : ''}</div></div>`;
  row.addEventListener('click', () => goToPerson(ctx, p));
  const src = p.photo_path ? null : p.photo_url;
  const put = (s) => { if (!s) return; const img = document.createElement('img'); img.alt = ''; img.src = s; img.addEventListener('load', () => row.querySelector('.initials')?.remove()); img.addEventListener('error', () => img.remove()); row.querySelector('.face').appendChild(img); };
  if (p.photo_path) resolveAssetUrl(p.photo_path, 'image/jpeg').then((u) => put(u || p.photo_url)); else put(src);
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
        <div class="search-box" style="flex:1;min-width:220px"><span class="ic">⌕</span><input type="search" id="people-search" placeholder="Find a person in any case"></div>
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

  const draw = (filter) => {
    const sortNow = getSort(); // re-read on every draw — a header click saves then redraws without a full render()
    const arrow = (key) => (sortNow.key === key ? `<span class="arrow">${sortNow.dir === 'asc' ? '▴' : '▾'}</span>` : '');
    body.innerHTML = '';
    const q = (filter || '').toLowerCase();
    const shown = people.filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.case_name || '').toLowerCase().includes(q));
    if (!shown.length) {
      body.appendChild(emptyState({ missing: q ? `No one matching “${filter}”.` : 'No people yet.', why: q ? 'Try part of a name, or the case name.' : 'Create a case about a person and they appear here.' }));
      return;
    }
    shown.sort((a, b) => {
      const av = sortValue(a, sortNow.key), bv = sortValue(b, sortNow.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortNow.dir === 'asc' ? cmp : -cmp;
    });
    if (view === 'list') {
      const panel = document.createElement('div');
      panel.className = 'panel';
      const list = document.createElement('div');
      list.className = 'stack';
      list.style.gap = '2px';
      panel.appendChild(list);
      body.appendChild(panel);
      (async () => { for (const p of shown) list.appendChild(await buildListRow(p, ctx)); })();
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
          draw(root.querySelector('#people-search')?.value || '');
        });
      }
      wrap.appendChild(table);
      body.appendChild(wrap);
      const tbody = table.querySelector('tbody');
      (async () => { for (const p of shown) tbody.appendChild(await buildRow(p, ctx)); })();
    }
  };
  draw('');
  root.querySelector('#people-search').addEventListener('input', (e) => draw(e.target.value));
}
