import * as db from './db.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { seedExampleCase } from './store.js';
import { inlineNameForm, inlineNote, clearInlineNote } from './ui.js';

const ROUTES = {
  evidence: () => import('./pages/evidence.js'),
  board: () => import('./pages/board.js'),
  relations: () => import('./pages/relations.js'),
  patterns: () => import('./pages/patterns.js'),
  import: () => import('./pages/import.js'),
  review: () => import('./pages/review.js'),
  questions: () => import('./pages/questions.js'),
  subject: () => import('./pages/subject.js'),
  video: () => import('./pages/video.js'),
  fun: () => import('./pages/fun.js'),
  contradictions: () => import('./pages/contradictions.js'),
  cases: () => import('./pages/cases.js'),
  family: () => import('./pages/family.js'),
  event: () => import('./pages/event.js'),
  people: () => import('./pages/people.js'),
  compare: () => import('./pages/compare.js'),
  inbox: () => import('./pages/evidence.js'), // the Evidence page opened on its Inbox view
};
// the old Dashboard route is gone (her pick, 2026-09-07) — pages/dashboard.js
// stays only for createCaseOfKind / CASE_KINDS, which Cases and the rail use
const TITLES = {
  evidence: 'Evidence', board: 'Board', relations: 'Relations',
  patterns: 'Patterns', import: 'Import', review: 'Review', questions: 'Questions', subject: 'Subject File', video: 'Video',
  fun: 'Fun & Zodiac', contradictions: 'Contradictions', cases: 'Cases', family: 'Family', event: 'Event', people: 'People', inbox: 'Inbox',
  compare: 'Compare',
};
// routes that live "inside" a case: show the back arrow, light up Cases in the nav
const INSIDE_CASE = new Set(['subject', 'family', 'event', 'video', 'contradictions', 'evidence', 'board', 'relations', 'import', 'patterns', 'questions']);
const HOME_ROUTE = 'cases';

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
        railSelect.innerHTML = cases.map((c) => `<option value="${c.id}"${c.id === currentCaseId ? ' selected' : ''}>${c.name}</option>`).join('')
          + '<option value="__new">+ New case…</option>';
      }
    }
  } catch (_) { if (chip) chip.textContent = ''; }
}

document.getElementById('case-rail-select')?.addEventListener('change', async (e) => {
  // switching case goes INTO that case (her redesign 2026-09-02): a
  // person-case opens the person's profile, a family its overview
  const landOnDashboard = async () => {
    const { openCase } = await import('./pages/cases.js');
    const kase = await store.getCase(currentCaseId);
    if (kase) openCase(ctx, kase); else ctx.navigate(`#/${HOME_ROUTE}`);
  };
  try {
    if (e.target.value === '__fun') return; // the Fun page's label row, not a real case
    if (e.target.value === '__new') {
      // no prompt() — an inline mini-form appears in the rail block itself
      const sel = e.target;
      sel.style.display = 'none';
      const form = inlineNameForm({
        placeholder: 'Who or what is this case about?',
        submitLabel: 'Create',
        choices: [{ value: 'person', label: 'A person' }, { value: 'family', label: 'A family / household' }, { value: 'event', label: 'A major event' }],
        withFictional: true,
        onSubmit: async (name, kind, world) => {
          const { createCaseOfKind } = await import('./pages/dashboard.js');
          form.remove();
          sel.style.display = '';
          if (kind === 'person') sessionStorage.setItem('c7-offer-lookup', '1');
          await createCaseOfKind(store, ctx, name, kind, world); // navigates: person file, the family, or the event overview
          refreshCaseContext();
        },
        onCancel: () => { sel.style.display = ''; refreshCaseContext(); },
      });
      sel.after(form);
      return;
    }
    await ctx.setCaseId(e.target.value);
  } catch (err) {
    console.error('Case switch failed:', err);
    refreshCaseContext();
    return;
  }
  landOnDashboard();
});

const ctx = {
  get caseId() { return currentCaseId; },
  async setCaseId(id) {
    currentCaseId = id;
    if (id) localStorage.setItem('c7-current-case', id);
    else localStorage.removeItem('c7-current-case');
    refreshCaseContext();
  },
  // the same hash fires no hashchange — switching case from the rail while
  // already on #/family left the old case on screen (2026-09-03)
  navigate(hash) { if (location.hash === hash) renderRoute(); else location.hash = hash; },
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
    // Enter in any single-line field fires the drawer's primary action —
    // the same convention as every inline form (2026-09-02: a birth date
    // typed then "entered" was silently lost when the drawer closed)
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) return;
      if (t.closest('.inline-form')) return; // an inline form submits on its own Enter
      const primary = body.querySelector('.btn-primary:not([disabled])');
      if (!primary) return;
      e.preventDefault();
      primary.click();
    });
    drawer.classList.add('open');
    drawerBackdrop.classList.add('open');
  },
  closeDrawer() {
    drawer.classList.remove('open');
    drawerBackdrop.classList.remove('open');
  },
  store,
  refreshBadges() { refreshInboxBadge(); },
  rerender() { renderRoute(); }, // pages re-render the current route in place (tabs stay tabs)
};
drawerBackdrop.addEventListener('click', ctx.closeDrawer);

// ---- ← goes back to where she came from (her pick, 2026-09-07), never
// blindly home. A stack of screens for this session; every tab on one
// person counts as the same screen, so ← from a person's Relations tab
// leaves that person, it doesn't step through their tabs. ----
const NAV_KEY = 'c7-nav-stack';
const screenOf = (hash) => { const m = /^#\/subject\/([^/]+)/.exec(hash || ''); return m ? `subject/${m[1]}` : (hash || `#/${HOME_ROUTE}`); };
function navStack() { try { return JSON.parse(sessionStorage.getItem(NAV_KEY)) || []; } catch (_) { return []; } }
function saveNavStack(st) { sessionStorage.setItem(NAV_KEY, JSON.stringify(st.slice(-40))); }
let navFromBack = false;
function recordNav(hash) {
  if (navFromBack) { navFromBack = false; return; }
  const st = navStack();
  if (st.length && screenOf(st[st.length - 1]) === screenOf(hash)) st[st.length - 1] = hash; // a tab switch updates the screen, no new entry
  else st.push(hash);
  saveNavStack(st);
}
function goBack() {
  const st = navStack();
  const here = screenOf(location.hash);
  while (st.length && screenOf(st[st.length - 1]) === here) st.pop();
  const target = st.length ? st[st.length - 1] : null;
  saveNavStack(st);
  navFromBack = true;
  ctx.navigate(target || `#/${HOME_ROUTE}`);
}
document.getElementById('back-btn').addEventListener('click', goBack);

// "N images waiting" on the Evidence nav item (rail + tab bar)
async function refreshInboxBadge() {
  const els = [document.getElementById('inbox-badge-rail'), document.getElementById('inbox-badge-tab')].filter(Boolean);
  if (!els.length) return;
  let n = 0;
  try { n = currentCaseId && db.isReady() ? await store.countInbox(currentCaseId) : 0; } catch (_) { n = 0; }
  for (const el of els) el.textContent = n ? String(n) : '';
}

function setNavActive(route) {
  document.querySelectorAll('.nav-link, #tab-bar a').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
}

// ---- one search box, top of every page (her pick, 2026-09-07): results
// as she types, every case, Fun included; a person opens as their family
// slice (her pick), a Fun person as their profile (no family to show). ----
const gsInput = document.getElementById('global-search-input');
const gsResults = document.getElementById('global-search-results');
const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function hideSearch() { gsResults.hidden = true; gsResults.innerHTML = ''; }
let gsTimer = null;
async function runSearch() {
  const q = gsInput.value.trim();
  if (!q || !db.isReady()) { hideSearch(); return; }
  let hits = await store.searchAll(q);
  if (gsInput.value.trim() !== q) return; // she kept typing; a newer search is on its way
  // the person is the unit (her pick): a person-case whose person is already
  // a hit would only be the same row twice — the person row opens the same place
  const personCaseIds = new Set(hits.filter((h) => h.type === 'person').map((h) => h.case_id));
  hits = hits.filter((h) => !(h.type === 'case' && h.case_kind === 'person' && personCaseIds.has(h.case_id)));
  gsResults.innerHTML = '';
  if (!hits.length) {
    gsResults.innerHTML = `<div class="empty-state" style="padding:12px"><p class="empty-missing" style="margin:0">No one matching “${escapeHtml(q)}”.</p><p class="empty-why" style="margin:4px 0 0">Names, birth names, notes, evidence titles and quotes, in every case.</p></div>`;
    gsResults.hidden = false;
    return;
  }
  const kindLabel = { person: 'person', case: 'case', evidence: 'evidence', moment: 'quote' };
  for (const h of hits) {
    const row = document.createElement('div');
    row.className = 'list-row';
    const fun = h.case_kind === 'fun';
    // the second line never repeats the first: a person in their own case shows their occupation, not their name again
    const where = fun ? '✦ Fun' : (h.case_name && h.case_name !== h.label ? h.case_name : null);
    const sub = [kindLabel[h.type], h.sub, where].filter(Boolean).map(escapeHtml).join(' · ');
    row.innerHTML = `<div class="main"><div class="title" style="font-size:13px">${escapeHtml(h.label || '(untitled)')}</div><div class="sub">${sub}</div></div>`;
    row.addEventListener('click', () => openHit(h));
    gsResults.appendChild(row);
  }
  gsResults.hidden = false;
}
async function openHit(h) {
  hideSearch();
  gsInput.value = '';
  gsInput.blur();
  const { markOpened, openCase } = await import('./pages/cases.js');
  markOpened(h.case_id);
  await ctx.setCaseId(h.case_id);
  if (h.type === 'person') ctx.navigate(h.case_kind === 'fun' ? `#/subject/${h.id}` : `#/subject/${h.id}/relations`);
  else if (h.type === 'moment') ctx.navigate(`#/video/${h.evidence_id}`);
  else if (h.type === 'evidence') ctx.navigate('#/evidence');
  else { const kase = await store.getCase(h.case_id); if (kase) openCase(ctx, kase); else ctx.navigate(`#/${HOME_ROUTE}`); }
}
gsInput.addEventListener('input', () => { clearTimeout(gsTimer); gsTimer = setTimeout(runSearch, 120); });
gsInput.addEventListener('focus', () => { if (gsInput.value.trim()) runSearch(); });
gsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { gsInput.value = ''; hideSearch(); gsInput.blur(); }
  if (e.key === 'Enter') { const first = gsResults.querySelector('.list-row'); if (first) first.click(); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#global-search')) hideSearch(); });

let currentUnmount = null;
let redrawTimer = null; // a pull's redraw, waiting for her to finish what she is doing

async function renderRoute() {
  clearTimeout(redrawTimer);
  hideSearch();
  const hash = location.hash.replace(/^#\/?/, '');
  const [route, param, sub] = hash.split('/');
  const key = route || HOME_ROUTE;
  const loader = ROUTES[key] || ROUTES[HOME_ROUTE];
  if (key === 'inbox') localStorage.setItem('c7-evidence-view', 'inbox');
  if (ROUTES[key]) localStorage.setItem('c7-last-hash', location.hash); // launch reopens where she left off
  recordNav(location.hash || `#/${HOME_ROUTE}`);

  setNavActive(INSIDE_CASE.has(key) ? 'cases' : key);
  document.getElementById('back-btn').style.display = INSIDE_CASE.has(key) ? '' : 'none';
  ctx.setTitle(TITLES[key] || 'C7 Case Files');
  // the Fun page saves into its own case — say so honestly (her call
  // 2026-09-01: show "Fun & Zodiac" there rather than hiding the block)
  refreshInboxBadge();
  if (key === 'fun') {
    document.getElementById('case-context').textContent = 'Fun & Zodiac';
    const railBlock = document.getElementById('case-rail');
    const railSelect = document.getElementById('case-rail-select');
    if (railBlock && railSelect) {
      railBlock.style.display = '';
      railSelect.innerHTML = '<option value="__fun" selected>Fun & Zodiac</option>';
    }
  } else refreshCaseContext();
  ctx.closeDrawer();

  if (typeof currentUnmount === 'function') { try { currentUnmount(); } catch (_) {} }
  pageRoot.classList.remove('fade-in');
  pageRoot.innerHTML = '';
  void pageRoot.offsetWidth;
  pageRoot.classList.add('fade-in');

  try {
    const mod = await loader();
    currentUnmount = await mod.render(pageRoot, ctx, param, sub);
  } catch (e) {
    pageRoot.innerHTML = `<div class="empty-state"><p class="empty-missing">This page hit an error.</p><p class="empty-why">${String(e && e.message || e)}</p></div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', renderRoute);

function renderSaveState(state) {
  saveStateEl.dataset.state = state.saveState;
  // the phone folds save state into the sync dot (red = a failed write)
  const chip = document.getElementById('sync-chip');
  if (chip) chip.dataset.save = state.saveState;
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
      <p style="margin-top:20px;font-size:12px;color:var(--text-3)">No folder handy, or on a phone?</p>
      <button class="btn btn-ghost btn-sm" id="browser-storage-btn">Skip the folder — keep data in this browser</button>
      <p style="font-size:11px;color:var(--text-3);max-width:380px">Your case files then live in this browser's own storage and arrive by cloud sync once you sign in. The folder is only needed once, on the computer that already holds your data.</p>
    `;
  }
  connectRoot.innerHTML = `<div class="connect-screen">${body}</div>`;
  const btn = document.getElementById('connect-btn') || document.getElementById('retry-btn');
  if (btn) btn.addEventListener('click', () => db.connect());
  document.getElementById('browser-storage-btn')?.addEventListener('click', () => db.useBrowserStorage());
}

let seeded = false;
let routedOnce = false;

async function boot() {
  db.subscribe(async (state) => {
    renderSaveState(state);
    if (state.status === 'ready') {
      connectRoot.style.display = 'none';
      appShell.style.display = '';
      if (state.freshlyCreated && !seeded && db.storageMode() === 'folder') {
        // desktop gets the example case; a phone (idb mode) starts empty —
        // its real content arrives by sync, and a seed would just come back
        // as a duplicate of the desktop's copy
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
      if (!location.hash) location.hash = localStorage.getItem('c7-last-hash') || `#/${HOME_ROUTE}`;
      else renderRoute();
      sync.initSync(); // fire-and-forget — the app never waits on the network
    } else {
      renderConnectScreen(state);
    }
  });
  await db.init();
}

// ---- install: no strip above the page (her pick, 2026-09-07) — the
// browser's install event is held and offered inside the sync dot's drawer ----
// Chrome/Edge (phone and desktop) fire beforeinstallprompt when the app is
// installable and not yet installed; we hold that event and fire it from our
// own button in the drawer.
let installPrompt = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;

async function triggerInstall() {
  if (!installPrompt) return;
  const evt = installPrompt;
  installPrompt = null;
  evt.prompt();
  try { await evt.userChoice; } catch (_) {}
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => { installPrompt = null; });

// ---- cloud sync chip + account drawer ----
function elapsed(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// a pushed update that has downloaded and is waiting — surfaced in the sync
// chip/dot and applied from the drawer, never as a strip over the page
let updateWaiting = null;

const syncChip = document.getElementById('sync-chip');
function renderSyncChip(s) {
  syncChip.dataset.state = s.status;
  syncChip.dataset.update = updateWaiting ? '1' : '';
  if (updateWaiting) syncChip.textContent = '⇅ update ready';
  else if (s.status === 'off') syncChip.textContent = '⇅ sync off';
  else if (s.status === 'syncing') syncChip.textContent = '⇅ syncing…';
  else if (s.status === 'error') syncChip.textContent = '⇅ sync problem';
  else syncChip.textContent = s.pending > 0 ? `⇅ ${s.pending} waiting` : `⇅ synced ${elapsed(s.lastSync)}`;
  syncChip.title = updateWaiting ? 'A new version of the app is ready — tap, then Update'
    : (s.error || (sync.currentUser() ? `Signed in as ${sync.currentUser()}` : 'Not signed in — tap to set up sync'));
}
sync.subscribe(renderSyncChip);
// after each successful sync, push any queued image copies to the cloud
sync.subscribe((s) => { if (s.status === 'idle') import('./assets.js').then((m) => m.flushUploads()).catch(() => {}); });
// when a pull brought something in, the page she is looking at shows it —
// but never over work the database does not hold yet (2026-09-03: the
// phone sat on a Cases page with one card while five more had already
// arrived; then the review found the redraw wiping a pasted timeline, an
// armed "Really?" and a panned tree). While she is busy the redraw waits
// and tries again; leaving the page redraws anyway.
const REDRAW_RETRY_MS = 15000;
function screenIsBusy() {
  const a = document.activeElement;
  if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return true;
  if (drawer.classList.contains('open')) return true;
  if (document.querySelector('.btn-armed, .inline-form, .tree-full, .shot-view')) return true;
  for (const el of pageRoot.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="search"]')) {
    if (el.value && el.value.trim()) return true; // a paste, a search she is reading
  }
  if (gsInput.value.trim()) return true;
  return false;
}
function redrawAfterPull() {
  clearTimeout(redrawTimer);
  if (screenIsBusy()) { redrawTimer = setTimeout(redrawAfterPull, REDRAW_RETRY_MS); return; }
  refreshCaseContext();
  renderRoute();
}
let lastPulledAt = null;
sync.subscribe((s) => {
  if (!s.pulledAt || s.pulledAt === lastPulledAt) return;
  lastPulledAt = s.pulledAt;
  redrawAfterPull();
});
setInterval(() => renderSyncChip(sync.getState()), 30000); // keep "Xm ago" honest

syncChip.addEventListener('click', () => ctx.openDrawer((body) => renderSyncDrawer(body)));

// "3 cases · 21 people" — what this device's own database holds right now
function deviceCounts() {
  try {
    const c = db.exec("SELECT COUNT(*) AS n FROM case_file WHERE deleted_at IS NULL AND kind != 'fun'")[0]?.n || 0;
    const p = db.exec('SELECT COUNT(*) AS n FROM person WHERE deleted_at IS NULL')[0]?.n || 0;
    return `${c} case${c === 1 ? '' : 's'} · ${p} ${p === 1 ? 'person' : 'people'}`;
  } catch (_) { return '—'; }
}

// the waiting update, first thing in the drawer — tap applies it, nothing reloads on its own
function insertUpdateButton(body) {
  if (!updateWaiting) return;
  const w = document.createElement('div');
  w.style.margin = '0 0 20px';
  w.innerHTML = `
    <button class="btn btn-primary btn-sm" id="sy-update">Update ready — tap to reload</button>
    <p style="color:var(--text-3);font-size:11px;margin:8px 0 0">A new version downloaded in the background. It only switches over when you tap.</p>
  `;
  w.querySelector('#sy-update').addEventListener('click', () => {
    const b = w.querySelector('#sy-update');
    b.disabled = true; b.textContent = 'Updating…';
    updateWaiting.postMessage('c7-skip-waiting');
  });
  const title = body.querySelector('h3');
  if (title) title.after(w); else body.prepend(w);
}

function renderSyncDrawer(body) {
  const user = sync.currentUser();
  const s = sync.getState();
  if (!user) {
    body.innerHTML = `
      <h3 class="title" style="margin-bottom:4px">Cloud sync</h3>
      <p style="color:var(--text-2);font-size:12px;margin:0 0 16px">
        Sign in and this device shares one set of case files with your other devices.
        Your data stays in your own private account — the same sign-in Book33 sync uses.
      </p>
      <div class="field"><label>Email</label><input type="email" id="sy-email" autocomplete="username"></div>
      <div class="field"><label>Password</label><input type="password" id="sy-pass" autocomplete="current-password"></div>
      <button class="btn btn-primary" id="sy-signin">Sign in</button>
    `;
    const btn = body.querySelector('#sy-signin');
    btn.addEventListener('click', async () => {
      clearInlineNote(btn);
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        await sync.signIn(body.querySelector('#sy-email').value.trim(), body.querySelector('#sy-pass').value);
        ctx.closeDrawer();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
        inlineNote(btn, String(e && e.message || e));
      }
    });
    insertUpdateButton(body);
    appendBackupButton(body); // backup shouldn't require being signed in
    return;
  }
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:4px">Cloud sync</h3>
    <div class="mono" style="font-size:12px;color:var(--text-2);margin-bottom:16px">Signed in as ${user}</div>
    <div class="stack" style="gap:6px;font-size:12px">
      <div class="row between"><span class="section-label">Status</span><span class="mono">${s.status === 'error' ? 'problem — see below' : s.status}</span></div>
      <div class="row between"><span class="section-label">Last synced</span><span class="mono">${s.lastSync ? elapsed(s.lastSync) : 'not yet'}</span></div>
      <div class="row between"><span class="section-label">Waiting to upload</span><span class="mono">${s.pending || 0}</span></div>
      <div class="row between"><span class="section-label">This device holds</span><span class="mono">${deviceCounts()}</span></div>
    </div>
    ${s.error ? `<div class="inline-note" style="margin-top:12px">${s.error}</div>` : ''}
    <div class="row wrap" style="gap:8px;margin-top:20px">
      <button class="btn btn-primary btn-sm" id="sy-now">Sync now</button>
      <button class="btn btn-ghost btn-sm" id="sy-repull" title="Forget what this device thinks it has already fetched and read the whole cloud again">Re-pull everything</button>
      <button class="btn btn-ghost btn-sm" id="sy-out">Sign out</button>
    </div>
  `;
  body.querySelector('#sy-now').addEventListener('click', async () => {
    await sync.syncNow();
    renderSyncDrawer(body);
  });
  body.querySelector('#sy-repull').addEventListener('click', async () => {
    const b = body.querySelector('#sy-repull');
    b.disabled = true; b.textContent = 'Re-pulling…';
    await sync.repullAll();
    renderSyncDrawer(body);
  });
  body.querySelector('#sy-out').addEventListener('click', async () => {
    await sync.signOut();
    ctx.closeDrawer();
  });
  insertUpdateButton(body);
  appendBackupButton(body);
}

// the "keep export" half of retiring the folder version: the whole
// database, downloaded as a plain SQLite file, from any device
function appendBackupButton(body) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '24px';
  wrap.innerHTML = `
    <div class="section-label" style="margin-bottom:8px">Backup</div>
    <button class="btn btn-ghost btn-sm" id="sy-backup">Download backup (.db)</button>
    <p style="color:var(--text-3);font-size:11px;margin:8px 0 0">The whole database as one SQLite file, saved to this device.</p>
    <p class="mono" style="color:var(--text-3);font-size:11px;margin:16px 0 0">App version ${window.C7_VERSION || 'unknown'}</p>
  `;
  // the only place the install offer lives now (no strip over the page)
  if (!isStandalone() && (installPrompt || isIOS())) {
    const inst = document.createElement('div');
    inst.style.marginBottom = '16px';
    inst.innerHTML = `
      <div class="section-label" style="margin-bottom:8px">Install</div>
      ${isIOS()
        ? '<p style="color:var(--text-2);font-size:12px;margin:0">On iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>.</p>'
        : '<button class="btn btn-primary btn-sm" id="sy-install">Install app on this device</button><p style="color:var(--text-3);font-size:11px;margin:8px 0 0">Its own icon, opens instantly, works offline.</p>'}
    `;
    inst.querySelector('#sy-install')?.addEventListener('click', () => triggerInstall());
    wrap.prepend(inst);
  }
  // appearance — paper by day, ink by night (her pick, 2026-09-07); "Follow
  // phone" is the default and needs no pick. index.html stamps the ground.
  const themePick = localStorage.getItem('c7-theme') || 'auto';
  const look = document.createElement('div');
  look.style.marginBottom = '16px';
  look.innerHTML = `
    <div class="section-label" style="margin-bottom:8px">Appearance</div>
    <div class="row wrap" style="gap:6px">
      ${[['auto', 'Follow phone'], ['light', 'Day'], ['dark', 'Night']].map(([v, l]) => `<button type="button" class="chip ${themePick === v ? 'brass' : ''}" data-theme-pick="${v}" style="border:0;cursor:pointer">${l}</button>`).join('')}
    </div>
  `;
  look.querySelectorAll('[data-theme-pick]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themePick;
    if (v === 'auto') localStorage.removeItem('c7-theme'); else localStorage.setItem('c7-theme', v);
    if (window.c7ApplyTheme) window.c7ApplyTheme();
    renderSyncDrawer(body);
  }));
  wrap.prepend(look);
  wrap.querySelector('#sy-backup').addEventListener('click', () => {
    const bytes = db.exportBytes();
    const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    a.href = url;
    a.download = `c7-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.db`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });
  body.appendChild(wrap);
}

boot();

// ---- installable app: service worker + her chosen update flow ----
// A new pushed version NEVER reloads over her work. The waiting worker sits
// until she taps Update in the sync drawer; only then does it take over.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const noteUpdate = (worker) => {
    // on the connect screen there is no work to protect and no drawer to
    // offer it from — apply the update straight away
    if (appShell.style.display === 'none') { worker.postMessage('c7-skip-waiting'); return; }
    updateWaiting = worker;
    renderSyncChip(sync.getState());
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting) noteUpdate(reg.waiting); // an update already downloaded earlier
    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) return;
      fresh.addEventListener('statechange', () => {
        // 'installed' + an existing controller = a new version is waiting
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) noteUpdate(fresh);
      });
    });
  }).catch((e) => console.error('Service worker registration failed:', e));
}
