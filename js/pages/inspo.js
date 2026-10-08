// Inspo Board — people she admires, with their quotes and accomplishments,
// one page per theme (her ask, 2026-10-08: "an inspo board where i can add
// people, with their quotes and accomplishments for different themes e.g.
// productivity inspo page"). Her picks: lives inside C7; each theme has its
// OWN people (the same person under two themes is added twice — simple over
// clever); a toggle between a wall of person cards and a quote-first feed.
//
// Free-standing data (inspo_theme / inspo_person, see schema.sql), not a
// case — nothing here needs a research file. Quotes and accomplishments are
// typed one per line in a plain textarea. No photo or Wikidata pull yet:
// each person gets a coloured initial instead (deliberate scope, disclosed).
import { emptyState } from '../indicators.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

const VIEW_KEY = 'c7-inspo-view';   // 'cards' | 'quotes'
const THEME_KEY = 'c7-inspo-theme'; // last theme she was on
const SUGGESTED = ['Productivity', 'Confidence', 'Money', 'Health', 'Creativity'];
const TINTS = ['green', 'red', 'violet', 'teal']; // the app's own chip colours, cycled per person

export async function render(root, ctx) {
  const { store } = ctx;
  let themes = await store.listInspoThemes();
  let themeId = null;
  try { themeId = localStorage.getItem(THEME_KEY); } catch (_) { /* private mode */ }
  if (!themes.find((t) => t.id === themeId)) themeId = themes[0]?.id || null;
  let view = 'cards';
  try { view = localStorage.getItem(VIEW_KEY) === 'quotes' ? 'quotes' : 'cards'; } catch (_) { /* private mode */ }
  let editing = null; // person id, 'new', or null

  async function reload() { themes = await store.listInspoThemes(); paint(); }

  async function paint() {
    const people = themeId ? await store.listInspoPeople(themeId) : [];
    const theme = themes.find((t) => t.id === themeId);
    root.innerHTML = `
      <div class="inspo-page">
        <div class="shelf-topbar">
          <div>
            <p class="shelf-eyebrow">Who lifts me up</p>
            <h1 class="shelf-h1">Inspo Board</h1>
            <p class="shelf-stat">${theme ? `${people.length} ${people.length === 1 ? 'person' : 'people'} in ${esc(theme.name)}` : 'Start with a theme'}</p>
          </div>
          ${theme ? `<div class="shelf-segctrl" id="inspo-seg" role="group" aria-label="View">
            <span class="shelf-seg-thumb" style="transform:translateX(${view === 'quotes' ? '100%' : '0%'})"></span>
            <button type="button" class="shelf-seg-btn ${view === 'cards' ? 'active' : ''}" data-v="cards">Cards</button>
            <button type="button" class="shelf-seg-btn ${view === 'quotes' ? 'active' : ''}" data-v="quotes">Quotes</button>
          </div>` : ''}
        </div>
        <div class="inspo-themes">
          ${themes.map((t) => `<button type="button" class="inspo-theme-tab ${t.id === themeId ? 'active' : ''}" data-t="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
          <button type="button" class="inspo-theme-tab inspo-theme-add" id="inspo-add-theme">+ New theme</button>
        </div>
        <div id="inspo-body"></div>
      </div>`;

    root.querySelectorAll('.inspo-theme-tab[data-t]').forEach((b) => b.addEventListener('click', () => {
      themeId = b.dataset.t; editing = null;
      try { localStorage.setItem(THEME_KEY, themeId); } catch (_) { /* private mode */ }
      paint();
    }));
    root.querySelector('#inspo-add-theme').addEventListener('click', () => themeForm());
    root.querySelectorAll('#inspo-seg .shelf-seg-btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.v === view) return;
      view = b.dataset.v;
      try { localStorage.setItem(VIEW_KEY, view); } catch (_) { /* private mode */ }
      paint();
    }));

    const body = root.querySelector('#inspo-body');
    if (!theme) {
      body.appendChild(emptyState({
        missing: 'No themes yet.',
        why: 'A theme is a page of people who inspire you for one thing — Productivity, Confidence, Money…',
        action: 'Add your first theme', onAction: () => themeForm(),
      }));
      return;
    }
    paintBody(body, theme, people);
  }

  function themeForm() {
    const body = root.querySelector('#inspo-body');
    body.innerHTML = `
      <div class="card inspo-form">
        <h3>New theme</h3>
        <input class="input" id="th-name" placeholder="e.g. Productivity" maxlength="40" autocomplete="off">
        <div class="inspo-suggest">${SUGGESTED.filter((s) => !themes.some((t) => t.name.toLowerCase() === s.toLowerCase())).map((s) => `<button type="button" class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="inspo-form-actions"><button class="btn btn-primary btn-sm" id="th-save">Add theme</button><button class="btn btn-ghost btn-sm" id="th-cancel">Cancel</button></div>
      </div>`;
    const input = body.querySelector('#th-name');
    input.focus();
    body.querySelectorAll('[data-s]').forEach((c) => c.addEventListener('click', () => { input.value = c.dataset.s; input.focus(); }));
    const save = async () => {
      const name = input.value.trim();
      if (!name) return;
      themeId = await store.createInspoTheme(name);
      try { localStorage.setItem(THEME_KEY, themeId); } catch (_) { /* private mode */ }
      await reload();
    };
    body.querySelector('#th-save').addEventListener('click', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    body.querySelector('#th-cancel').addEventListener('click', paint);
  }

  function paintBody(body, theme, people) {
    const tint = (i) => TINTS[i % TINTS.length];
    const card = (p, i) => {
      const q = lines(p.quotes); const a = lines(p.accomplishments);
      return `
      <article class="inspo-card card" style="animation-delay:${(i * 0.05).toFixed(2)}s">
        <div class="inspo-head">
          <span class="inspo-avatar cat-${tint(i)}">${esc((p.name || '?')[0].toUpperCase())}</span>
          <div class="inspo-who"><h3>${esc(p.name)}</h3>${p.tagline ? `<p>${esc(p.tagline)}</p>` : ''}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Edit</button>
        </div>
        ${q[0] ? `<blockquote class="inspo-quote">“${esc(q[0])}”</blockquote>` : ''}
        ${q.length > 1 ? `<details class="inspo-more"><summary>${q.length - 1} more quote${q.length === 2 ? '' : 's'}</summary>${q.slice(1).map((x) => `<blockquote class="inspo-quote small">“${esc(x)}”</blockquote>`).join('')}</details>` : ''}
        ${a.length ? `<ul class="inspo-wins">${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </article>`;
    };
    const quoteFeed = () => {
      const all = [];
      people.forEach((p, i) => lines(p.quotes).forEach((q) => all.push({ q, p, i })));
      if (!all.length) return '<p class="shelf-stat">No quotes yet — add some to a person.</p>';
      return `<div class="inspo-feed">${all.map((x, n) => `
        <figure class="inspo-feed-item" style="animation-delay:${Math.min(n, 12) * 0.04}s">
          <blockquote class="inspo-quote big">“${esc(x.q)}”</blockquote>
          <figcaption><span class="inspo-avatar sm cat-${tint(x.i)}">${esc(x.p.name[0].toUpperCase())}</span>${esc(x.p.name)}${x.p.tagline ? ` <span class="inspo-tag">· ${esc(x.p.tagline)}</span>` : ''}</figcaption>
        </figure>`).join('')}</div>`;
    };

    body.innerHTML = `
      <div class="inspo-toolbar">
        <button class="btn btn-primary btn-sm" id="inspo-add-person">+ Add person</button>
        <button class="btn btn-ghost btn-sm" id="inspo-rename">Rename theme</button>
        <button class="btn btn-ghost btn-sm" id="inspo-del-theme">Delete theme</button>
      </div>
      <div id="inspo-form-slot"></div>
      ${people.length ? (view === 'quotes' ? quoteFeed() : `<div class="inspo-grid">${people.map(card).join('')}</div>`)
        : '<p class="shelf-stat">Nobody here yet. Add the first person who inspires you for this.</p>'}`;

    body.querySelector('#inspo-add-person').addEventListener('click', () => personForm(body, null));
    body.querySelector('#inspo-rename').addEventListener('click', async () => {
      const n = (window.prompt('Rename theme', theme.name) || '').trim();
      if (n && n !== theme.name) { await store.renameInspoTheme(theme.id, n); reload(); }
    });
    body.querySelector('#inspo-del-theme').addEventListener('click', async () => {
      if (!window.confirm(`Delete the “${theme.name}” theme and its ${people.length} ${people.length === 1 ? 'person' : 'people'}?`)) return;
      await store.deleteInspoTheme(theme.id);
      themeId = null; await reload();
      themeId = themes[0]?.id || null; paint();
    });
    body.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => personForm(body, people.find((p) => p.id === b.dataset.edit))));
  }

  function personForm(body, p) {
    const slot = body.querySelector('#inspo-form-slot');
    slot.innerHTML = `
      <div class="card inspo-form">
        <h3>${p ? 'Edit person' : 'Add person'}</h3>
        <label>Name<input class="input" id="ip-name" value="${esc(p?.name || '')}" autocomplete="off"></label>
        <label>Known for <span class="shelf-stat">(optional, one line)</span><input class="input" id="ip-tag" value="${esc(p?.tagline || '')}" autocomplete="off"></label>
        <label>Quotes <span class="shelf-stat">(one per line)</span><textarea class="input" id="ip-quotes" rows="4">${esc(p?.quotes || '')}</textarea></label>
        <label>Accomplishments <span class="shelf-stat">(one per line)</span><textarea class="input" id="ip-wins" rows="4">${esc(p?.accomplishments || '')}</textarea></label>
        <div class="inspo-form-actions">
          <button class="btn btn-primary btn-sm" id="ip-save">Save</button>
          <button class="btn btn-ghost btn-sm" id="ip-cancel">Cancel</button>
          ${p ? '<button class="btn btn-ghost btn-sm inspo-del" id="ip-del">Delete</button>' : ''}
        </div>
      </div>`;
    const $ = (s) => slot.querySelector(s);
    $('#ip-name').focus();
    $('#ip-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    $('#ip-save').addEventListener('click', async () => {
      const name = $('#ip-name').value.trim();
      if (!name) { $('#ip-name').focus(); return; }
      const data = { name, tagline: $('#ip-tag').value.trim() || null, quotes: $('#ip-quotes').value.trim() || null, accomplishments: $('#ip-wins').value.trim() || null };
      if (p) await store.updateInspoPerson(p.id, data); else await store.createInspoPerson({ ...data, theme_id: themeId });
      paint();
    });
    if (p) $('#ip-del').addEventListener('click', async () => {
      if (!window.confirm(`Remove ${p.name} from this theme?`)) return;
      await store.deleteInspoPerson(p.id); paint();
    });
    slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  paint();
}
