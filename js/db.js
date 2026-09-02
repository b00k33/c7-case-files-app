// Opens, holds and saves the SQLite file. This is the ONLY module that
// touches sql.js, the File System Access API or the filesystem shape of
// data/. Everything else goes through store.js.
//
// Persistence model: app code (js/, css/, vendor/, schema.sql) is served
// read-only over http://localhost by the launcher. The user-writable data/
// folder is reached separately via the File System Access API, which is
// exactly the capability file:// cannot offer — the reason this app has to
// be served at all. The user picks the app folder once; the handle is
// remembered in this browser's IndexedDB for next time.

const BACKUPS_TO_KEEP = 30;
const SAVE_DEBOUNCE_MS = 2000;

let SQL = null;          // sql.js module
let db = null;           // sql.js Database instance
let rootHandle = null;   // FileSystemDirectoryHandle: the app folder
let dataHandle = null;   // .../data
let assetsHandle = null; // .../data/assets
let backupsHandle = null;// .../data/backups
let dbFileHandle = null; // .../data/c7.db

let dirty = false;
let saveTimer = null;
let state = { status: 'idle', saveState: 'saved', error: null };
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const cb of listeners) cb(state);
}

export function subscribe(cb) {
  listeners.add(cb);
  cb(state);
  return () => listeners.delete(cb);
}

export function getState() {
  return state;
}

// --- tiny IndexedDB helper. Originally just remembered the directory
// handle; since the phone build (Stage 1, 2026-09-01) it is also the whole
// data home on browsers without the File System Access API: 'files' holds
// the SQLite bytes, 'assets' the attachment blobs, 'backups' rolling copies.
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('c7-case-files', 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const s of ['handles', 'files', 'assets', 'backups']) {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(storeName, key) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(storeName, key, value) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDelete(storeName, key) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbKeys(storeName) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function hasFileSystemAccess() {
  return typeof window.showDirectoryPicker === 'function';
}

// Some phone browsers expose showDirectoryPicker but can't actually open a
// folder — she hit exactly this on Android (2026-09-01). A phone never
// wants the folder flow anyway: its data arrives by sync.
function looksLikeAPhone() {
  if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// 'folder' = desktop Chrome/Edge, data lives in the visible data/ folder via
// the File System Access API. 'idb' = every browser without that API
// (phones, Safari, Firefox): the same SQLite database lives inside the
// browser's own IndexedDB instead — no folder picker, no connect screen.
let mode = 'folder';

export function storageMode() { return mode; }

/** Try to reconnect silently using a previously-granted handle. */
export async function init() {
  if (!hasFileSystemAccess() || looksLikeAPhone()) {
    return useBrowserStorage();
  }
  setState({ status: 'connecting' });
  const saved = await idbGet('handles', 'root');
  if (!saved) {
    setState({ status: 'needs-connect' });
    return false;
  }
  const perm = await saved.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') {
    setState({ status: 'needs-connect', pendingHandle: saved });
    return false;
  }
  rootHandle = saved;
  await open();
  return true;
}

/**
 * Skip the folder entirely and keep the database in this browser's own
 * storage. Automatic on phones; also offered as a button on the connect
 * screen so nobody is ever stuck at a folder picker.
 */
export async function useBrowserStorage() {
  mode = 'idb';
  setState({ status: 'connecting', pendingHandle: null, error: null });
  await open();
  return state.status === 'ready';
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took longer than ${Math.round(ms / 1000)}s — something is stuck, not just slow.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Must be called from a user gesture (a click). Shows the folder picker. */
export async function connect() {
  setState({ status: 'connecting' });
  try {
    const handle = state.pendingHandle
      ? state.pendingHandle
      : await window.showDirectoryPicker({ mode: 'readwrite' });
    // showDirectoryPicker({mode:'readwrite'}) already asks for readwrite —
    // check before asking again, so a granted handle never triggers a
    // second, easy-to-miss permission prompt.
    const already = await handle.queryPermission({ mode: 'readwrite' });
    const perm = already === 'granted' ? already : await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      setState({ status: 'needs-connect', error: 'Permission was not granted.' });
      return false;
    }
    rootHandle = handle;
    await idbSet('handles', 'root', handle);
    await open();
    return true;
  } catch (e) {
    if (e && e.name === 'AbortError') {
      setState({ status: 'needs-connect', error: null });
      return false;
    }
    setState({ status: 'needs-connect', error: String(e && e.message || e) });
    return false;
  }
}

async function open() {
  try {
    if (mode === 'folder') {
      dataHandle = await rootHandle.getDirectoryHandle('data', { create: true });
      assetsHandle = await dataHandle.getDirectoryHandle('assets', { create: true });
      backupsHandle = await dataHandle.getDirectoryHandle('backups', { create: true });
    }

    if (!SQL) {
      SQL = await withTimeout(
        window.initSqlJs({ locateFile: (f) => `vendor/${f}` }),
        20000,
        'Loading the database engine'
      );
    }

    let bytes = null;
    let isNew = false;
    if (mode === 'idb') {
      const stored = await idbGet('files', 'c7.db');
      if (stored && stored.byteLength) bytes = new Uint8Array(stored.buffer || stored);
      else isNew = true;
    } else {
      try {
        dbFileHandle = await dataHandle.getFileHandle('c7.db', { create: false });
        const file = await dbFileHandle.getFile();
        bytes = new Uint8Array(await file.arrayBuffer());
      } catch (e) {
        isNew = true;
        dbFileHandle = await dataHandle.getFileHandle('c7.db', { create: true });
      }
    }

    if (isNew || !bytes || bytes.length === 0) {
      db = new SQL.Database();
      const schemaRes = await withTimeout(fetch('js/schema.sql'), 10000, 'Loading the database schema');
      const schemaSql = await schemaRes.text();
      db.run(schemaSql);
      applyMigrations();
      setState({ status: 'ready', saveState: 'unsaved', freshlyCreated: true });
    } else {
      db = new SQL.Database(bytes);
      applyMigrations();
      setState({ status: 'ready', saveState: 'saved', freshlyCreated: false });
    }
  } catch (e) {
    setState({ status: 'error', error: String(e && e.message || e) });
  }
}

// Tables added after the first release. Every statement is idempotent so a
// database created from any earlier schema.sql gains them on open; keep
// each in step with its schema.sql definition.
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS contradiction (
    id TEXT PRIMARY KEY,
    case_id TEXT REFERENCES case_file(id) ON DELETE CASCADE,
    person_id TEXT REFERENCES person(id) ON DELETE SET NULL,
    a_evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    a_moment_id TEXT, a_quote TEXT,
    b_evidence_id TEXT NOT NULL REFERENCES evidence(id) ON DELETE CASCADE,
    b_moment_id TEXT, b_quote TEXT,
    note TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_contradiction_person ON contradiction(person_id)',
];
function applyMigrations() {
  for (const sql of MIGRATIONS) db.run(sql);
}

export function isReady() {
  return state.status === 'ready' && !!db;
}

/** The whole database as SQLite bytes — for the Download-backup button. */
export function exportBytes() {
  if (!db) throw new Error('database not open');
  return db.export();
}

// --- query helpers used by store.js ---

export function exec(sql, params = []) {
  if (!db) throw new Error('database not open');
  const res = db.exec(sql, params);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

export function run(sql, params = []) {
  if (!db) throw new Error('database not open');
  db.run(sql, params);
  markDirty();
}

export function runMany(statements) {
  if (!db) throw new Error('database not open');
  db.run('BEGIN');
  try {
    for (const [sql, params] of statements) db.run(sql, params || []);
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  markDirty();
}

export function markDirty() {
  dirty = true;
  setState({ saveState: 'unsaved' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persist(); }, SAVE_DEBOUNCE_MS);
}

function pad(n) { return String(n).padStart(2, '0'); }
function backupName() {
  const d = new Date();
  return `c7-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.db`;
}

async function pruneBackups() {
  const names = [];
  for await (const [name] of backupsHandle.entries()) {
    if (name.startsWith('c7-') && name.endsWith('.db')) names.push(name);
  }
  names.sort();
  const excess = names.length - BACKUPS_TO_KEEP;
  for (let i = 0; i < excess; i++) {
    try { await backupsHandle.removeEntry(names[i]); } catch (_) { /* ignore */ }
  }
}

// IDB storage is thriftier than a disk folder — keep fewer rolling backups
const IDB_BACKUPS_TO_KEEP = 5;

async function pruneIdbBackups() {
  const names = (await idbKeys('backups')).filter((n) => String(n).startsWith('c7-')).sort();
  const excess = names.length - IDB_BACKUPS_TO_KEEP;
  for (let i = 0; i < excess; i++) {
    try { await idbDelete('backups', names[i]); } catch (_) { /* ignore */ }
  }
}

export async function persist() {
  if (!db || !dirty) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  setState({ saveState: 'saving' });
  try {
    if (mode === 'idb') {
      // back up what's currently stored BEFORE overwriting it — same law
      // as the folder mode, browser-storage edition
      try {
        const existing = await idbGet('files', 'c7.db');
        if (existing && existing.byteLength) {
          await idbSet('backups', backupName(), existing);
          await pruneIdbBackups();
        }
      } catch (_) { /* first-ever save, nothing to back up yet */ }
      await idbSet('files', 'c7.db', db.export());
    } else {
      // back up whatever is currently on disk BEFORE overwriting it
      try {
        const existing = await dbFileHandle.getFile();
        if (existing.size > 0) {
          const backupHandle = await backupsHandle.getFileHandle(backupName(), { create: true });
          const w = await backupHandle.createWritable();
          await w.write(await existing.arrayBuffer());
          await w.close();
          await pruneBackups();
        }
      } catch (_) { /* first-ever save, nothing to back up yet */ }

      const bytes = db.export();
      const writable = await dbFileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
    }

    dirty = false;
    setState({ saveState: 'saved', error: null });
  } catch (e) {
    setState({ saveState: 'error', error: String(e && e.message || e) });
    // deliberately do not clear `dirty` and do not schedule a retry —
    // a failed write must stay visible, never silently swallowed.
  }
}

window.addEventListener('pagehide', () => { if (dirty) persist(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) persist(); });

// --- asset storage (data/assets/), keyed by content hash ---

export async function sha256(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a File's bytes keyed by hash, return {filePath, sha256, bytes, mime}. */
export async function storeAsset(file) {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const filePath = `${hash}.${ext}`;
  const mime = file.type || 'application/octet-stream';
  if (mode === 'idb') {
    await idbSet('assets', filePath, new Blob([buf], { type: mime }));
  } else {
    const handle = await assetsHandle.getFileHandle(filePath, { create: true });
    const w = await handle.createWritable();
    await w.write(buf);
    await w.close();
  }
  return { filePath, sha256: hash, bytes: file.size, mime };
}

/** Resolve an asset's bytes as an object URL for display (images, PDFs). */
export async function assetUrl(filePath) {
  if (mode === 'idb') {
    const blob = await idbGet('assets', filePath);
    if (!blob) throw new Error('asset not found in browser storage');
    return URL.createObjectURL(blob);
  }
  const handle = await assetsHandle.getFileHandle(filePath, { create: false });
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}
