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

// --- tiny IndexedDB helper, just for remembering the directory handle ---
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('c7-case-files', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction('handles', 'readonly');
    const req = tx.objectStore('handles').get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}
async function idbSet(key, value) {
  const conn = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function hasFileSystemAccess() {
  return typeof window.showDirectoryPicker === 'function';
}

/** Try to reconnect silently using a previously-granted handle. */
export async function init() {
  if (!hasFileSystemAccess()) {
    setState({ status: 'unsupported', error: 'This browser cannot read or write local files. Use a recent Chrome or Edge.' });
    return false;
  }
  setState({ status: 'connecting' });
  const saved = await idbGet('root');
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

/** Must be called from a user gesture (a click). Shows the folder picker. */
export async function connect() {
  setState({ status: 'connecting' });
  try {
    const handle = state.pendingHandle
      ? state.pendingHandle
      : await window.showDirectoryPicker({ mode: 'readwrite' });
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      setState({ status: 'needs-connect', error: 'Permission was not granted.' });
      return false;
    }
    rootHandle = handle;
    await idbSet('root', handle);
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
    dataHandle = await rootHandle.getDirectoryHandle('data', { create: true });
    assetsHandle = await dataHandle.getDirectoryHandle('assets', { create: true });
    backupsHandle = await dataHandle.getDirectoryHandle('backups', { create: true });

    if (!SQL) {
      SQL = await window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
    }

    let bytes = null;
    let isNew = false;
    try {
      dbFileHandle = await dataHandle.getFileHandle('c7.db', { create: false });
      const file = await dbFileHandle.getFile();
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (e) {
      isNew = true;
      dbFileHandle = await dataHandle.getFileHandle('c7.db', { create: true });
    }

    if (isNew || !bytes || bytes.length === 0) {
      db = new SQL.Database();
      const schemaRes = await fetch('js/schema.sql');
      const schemaSql = await schemaRes.text();
      db.run(schemaSql);
      setState({ status: 'ready', saveState: 'unsaved', freshlyCreated: true });
    } else {
      db = new SQL.Database(bytes);
      setState({ status: 'ready', saveState: 'saved', freshlyCreated: false });
    }
  } catch (e) {
    setState({ status: 'error', error: String(e && e.message || e) });
  }
}

export function isReady() {
  return state.status === 'ready' && !!db;
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

export async function persist() {
  if (!db || !dirty) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  setState({ saveState: 'saving' });
  try {
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

/** Store a File's bytes under data/assets/<sha256>.<ext>, return {filePath, sha256, bytes, mime}. */
export async function storeAsset(file) {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const filePath = `${hash}.${ext}`;
  const handle = await assetsHandle.getFileHandle(filePath, { create: true });
  const w = await handle.createWritable();
  await w.write(buf);
  await w.close();
  return { filePath, sha256: hash, bytes: file.size, mime: file.type || 'application/octet-stream' };
}

/** Resolve an asset's bytes as an object URL for display (images, PDFs). */
export async function assetUrl(filePath) {
  const handle = await assetsHandle.getFileHandle(filePath, { create: false });
  const file = await handle.getFile();
  return URL.createObjectURL(file);
}
