import * as db from './db.js';
import * as store from './store.js';
import { seedExampleCase } from './store.js';

const ROUTES = {
  dashboard: () => import('./pages/dashboard.js'),
  evidence: () => import('./pages/evidence.js'),
  board: () => import('./pages/board.js'),
  relations: () => import('./pages/relations.js'),
  patterns: () => import('./pages/patterns.js'),
  import: () => import('./pages/import.js'),
  review: () => import('./pages/review.js'),
  subject: () => import('./pages/subject.js'),
  video: () => import('./pages/video.js'),
  fun: () => import('./pages/fun.js'),
};
const TITLES = {
  dashboard: 'Dashboard', evidence: 'Evidence', board: 'Board', relations: 'Relations',
  patterns: 'Patterns', import: 'Import', review: 'Review', subject: 'Subject File', video: 'Video',
  fun: 'Fun & Zodiac',
};

const connectRoot = document.getElementById('connect-root');
const appShell = document.getElementById('app-shell');
const pageRoot = document.getElementById('page-root');
const pageTitle = document.getElementById('page-title');
const saveStateEl = document.getElementById('save-state');
const saveStateText = document.getElementById('save-state-text');
const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');

let currentCaseId = localStorage.getItem('c7-current-case') || null;

// keeps every "which case am I in" marker truthful — the rail's case block
// (with its switcher) and the topbar chip. Every case switch goes through
// setCaseId, so this is the one place to refresh them.
async function refreshCaseContext() {
  const chip = document.getElementById('case-context');
  const railBlock = document.getElementById('case-rail');
  const railSelect = document.getElementById('case-rail-select');
  try {
    const cases = (await store.listCases()).filter((c) => c.kind !== 'fun');
    const kase = cases.find((c) => c.id === currentCaseId) || null;
    if (chip) chip.textContent = kase ? kase.name : '';
    if (railBlock && railSelect) {
      if (!cases.length) {
        railBlock.style.display = 'none';
      } else {
        railBlock.style.display = '';
        railSelect.innerHTML = cases.map((c) => `<option value="${c.id}"${c.id === currentCaseId ? ' selected' : ''}>${c.name}</option>`).join('');
      }
    }
  } catch (_) { if (chip) chip.textContent = ''; }
}

document.getElementById('case-rail-select')?.addEventListener('change', async (e) => {
  await ctx.setCaseId(e.target.value);
  // her call (2026-09-01): switching case always lands on that case's
  // Dashboard — its front door — not a re-render of wherever you were
  if (location.hash === '#/dashboard' || !location.hash) renderRoute();
  else ctx.navigate('#/dashboard');
});

const ctx = {
  get caseId() { return currentCaseId; },
  async setCaseId(id) {
    currentCaseId = id;
    if (id) localStorage.setItem('c7-current-case', id);
    else localStorage.removeItem('c7-current-case');
    refreshCaseContext();
  },
  navigate(hash) { location.hash = hash; },
  setTitle(t) { pageTitle.textContent = t; },
  openDrawer(render) {
    drawer.innerHTML = '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-ghost btn-sm';
    closeBtn.textContent = '✕ Close';
    closeBtn.style.marginBottom = '16px';
    closeBtn.addEventListener('click', ctx.closeDrawer);
    drawer.appendChild(closeBtn);
    const body = document.createElement('div');
    drawer.appendChild(body);
    render(body);
    drawer.classList.add('open');
    drawerBackdrop.classList.add('open');
  },
  closeDrawer() {
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  },
  store,
};
drawerBackdrop.addEventListener('click', ctx.closeDrawer);

function setNavActive(route) {
  document.querySelectorAll('.nav-link, #tab-bar a').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}

let currentUnmount = null;

async function renderRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, param] = hash.split('/');
  const key = route || 'dashboard';
  const loader = ROUTES[key] || ROUTES.dashboard;

  setNavActive(key === 'subject' || key === 'video' ? '' : key);
  ctx.setTitle(TITLES[key] || 'C7 Case Files');
  // the Fun page saves into its own case, so the research-case chip would lie there
  if (key === 'fun') document.getElementById('case-context').textContent = '';
  else refreshCaseContext();
  ctx.closeDrawer();

  if (typeof currentUnmount === 'function') { try { currentUnmount(); } catch (_) {} }
  pageRoot.classList.remove('fade-in');
  pageRoot.innerHTML = '';
  void pageRoot.offsetWidth;
  pageRoot.classList.add('fade-in');

  try {
    const mod = await loader();
    currentUnmount = await mod.render(pageRoot, ctx, param);
  } catch (e) {
    pageRoot.innerHTML = `<div class="empty-state"><p class="empty-missing">This page hit an error.</p><p class="empty-why">${String(e && e.message || e)}</p></div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', renderRoute);

function renderSaveState(state) {
  saveStateEl.dataset.state = state.saveState;
  const labels = { saved: 'saved', saving: 'saving…', unsaved: 'unsaved changes', error: 'save failed — ' + (state.error || 'unknown error') };
  saveStateText.textContent = labels[state.saveState] || state.saveState;
}

function renderConnectScreen(state) {
  appShell.style.display = 'none';
  connectRoot.style.display = '';
  let body = '';
  if (state.status === 'unsupported') {
    body = `<h1>C7 Case Files</h1><p>${state.error}</p>`;
  } else if (state.status === 'error') {
    body = `<h1>Something went wrong</h1><p class="err">${state.error}</p><button class="btn btn-primary" id="retry-btn">Try again</button>`;
  } else {
    body = `
      <h1>C7 Case Files</h1>
      <p>Pick the <span class="mono">c7-case-files</span> folder — the one with <span class="mono">data/</span> inside it — so the app can read and write your database on this computer. Nothing leaves this folder.</p>
      ${state.error ? `<p class="err">${state.error}</p>` : ''}
      <button class="btn btn-primary" id="connect-btn">${state.status === 'connecting' ? 'Connecting…' : 'Connect data folder'}</button>
    `;
  }
  connectRoot.innerHTML = `<div class="connect-screen">${body}</div>`;
  const btn = document.getElementById('connect-btn') || document.getElementById('retry-btn');
  if (btn) btn.addEventListener('click', () => db.connect());
}

let seeded = false;
let routedOnce = false;

async function boot() {
  db.subscribe(async (state) => {
    renderSaveState(state);
    if (state.status === 'ready') {
      connectRoot.style.display = 'none';
      appShell.style.display = '';
      if (state.freshlyCreated && !seeded) {
        seeded = true;
        try {
          await seedExampleCase();
        } catch (e) {
          console.error('Seeding the example case failed:', e);
          // don't block the app on this — an empty case beats a stuck screen
        }
      }
      if (routedOnce) return; // avoid re-routing on every later save-state tick
      routedOnce = true;
      if (!currentCaseId) {
        const cases = await store.listCases();
        if (cases.length) currentCaseId = cases[0].id;
      }
      refreshCaseContext();
      if (!location.hash) location.hash = '#/dashboard';
      else renderRoute();
    } else {
      renderConnectScreen(state);
    }
  });
  await db.init();
}

boot();
