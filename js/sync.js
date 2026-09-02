// Record-by-record cloud sync — Stage 2 of the phone build (2026-09-01).
//
// Shape (the pharmacy's post-incident lessons, applied from day one):
//  - every synced record is one row in the cloud's c7_records table
//    (entity + id + full row as JSON + updated_at + deleted tombstone)
//  - every cycle PULLS before it PUSHES (catch-up gating — a stale device
//    must absorb the world before it speaks)
//  - deletes travel as tombstones, never as absences
//  - per-record last-writer-wins; a record with a pending local change is
//    never overwritten by a pull (it wins locally and pushes next)
//  - sync never blocks boot, never auto-reloads, never throws past itself
//
// change_log stays device-local audit and does not sync.

import * as db from './db.js';
import { markOutboxReady, nowISO } from './store.js';
import { SUPABASE_URL, SUPABASE_KEY, AUTH_STORAGE_KEY } from './config.js';

const SYNC_TABLES = [
  'case_file', 'person', 'person_alias', 'address', 'relationship', 'event',
  'source', 'evidence', 'video_moment', 'evidence_link', 'tag', 'tagging',
  'claim', 'question', 'finding',
];
const PAGE = 500;
const PUSH_BATCH = 100;
const INTERVAL_MS = 60000;

let sb = null;            // supabase client (null until the CDN lib loads)
let session = null;
let running = false;
let timer = null;
let tableColumns = {};    // table -> [column names]
let state = { status: 'off', pending: 0, lastSync: null, error: null };
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  for (const cb of listeners) { try { cb(state); } catch (_) {} }
}
export function subscribe(cb) { listeners.add(cb); cb(state); return () => listeners.delete(cb); }
export function getState() { return state; }
export function currentUser() { return session?.user?.email || null; }

// ---- local plumbing ------------------------------------------------------

function ensureLocalTables() {
  db.run('CREATE TABLE IF NOT EXISTS c7_outbox (entity TEXT NOT NULL, entity_id TEXT NOT NULL, queued_at TEXT NOT NULL, PRIMARY KEY (entity, entity_id))');
  db.run('CREATE TABLE IF NOT EXISTS c7_sync_meta (key TEXT PRIMARY KEY, value TEXT)');
}

function metaGet(key) {
  const r = db.exec('SELECT value FROM c7_sync_meta WHERE key=?', [key]);
  return r.length ? r[0].value : null;
}
function metaSet(key, value) {
  db.run('INSERT OR REPLACE INTO c7_sync_meta (key, value) VALUES (?,?)', [key, value]);
}

function columnsOf(table) {
  if (!tableColumns[table]) {
    tableColumns[table] = db.exec(`PRAGMA table_info(${table})`).map((c) => c.name);
  }
  return tableColumns[table];
}

function pendingCount() {
  const r = db.exec('SELECT COUNT(*) AS n FROM c7_outbox');
  return r.length ? r[0].n : 0;
}

// tagging has a composite key; its outbox entity_id is "tag:targetType:targetId"
function readLocalRow(entity, entityId) {
  if (entity === 'tagging') {
    const [tagId, targetType, targetId] = String(entityId).split(':');
    const r = db.exec('SELECT * FROM tagging WHERE tag_id=? AND target_type=? AND target_id=?', [tagId, targetType, targetId]);
    return r[0] || null;
  }
  const r = db.exec(`SELECT * FROM ${entity} WHERE id=?`, [entityId]);
  return r[0] || null;
}

function hasPendingLocalChange(entity, entityId) {
  const r = db.exec('SELECT 1 FROM c7_outbox WHERE entity=? AND entity_id=?', [entity, entityId]);
  return r.length > 0;
}

function applyRemote(record) {
  const entity = record.entity;
  if (!SYNC_TABLES.includes(entity)) return;
  const cols = columnsOf(entity);
  if (record.deleted) {
    if (entity === 'tagging') {
      const [tagId, targetType, targetId] = String(record.id).split(':');
      db.run('DELETE FROM tagging WHERE tag_id=? AND target_type=? AND target_id=?', [tagId, targetType, targetId]);
    } else if (cols.includes('deleted_at')) {
      db.run(`UPDATE ${entity} SET deleted_at=? WHERE id=? AND deleted_at IS NULL`, [record.updated_at || nowISO(), record.id]);
    } else {
      db.run(`DELETE FROM ${entity} WHERE id=?`, [record.id]);
    }
    return;
  }
  const data = record.data || {};
  // last-writer-wins per record: an older remote copy never overwrites newer local
  if (entity !== 'tagging' && cols.includes('updated_at')) {
    const local = readLocalRow(entity, record.id);
    if (local && local.updated_at && data.updated_at && local.updated_at > data.updated_at) return;
  }
  const useCols = cols.filter((c) => c in data);
  if (!useCols.length) return;
  db.run(
    `INSERT OR REPLACE INTO ${entity} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`,
    useCols.map((c) => data[c])
  );
}

// ---- the cycle: pull, then push -----------------------------------------

async function pull() {
  const since = metaGet('last_pull') || '1970-01-01T00:00:00Z';
  let newest = since;
  let sawAny = false;
  for (;;) {
    const { data, error } = await sb
      .from('c7_records')
      .select('id, entity, data, updated_at, deleted')
      .gt('updated_at', newest)
      .order('updated_at', { ascending: true })
      .limit(PAGE);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const rec of data) {
      sawAny = true;
      // a record she edited here and hasn't pushed yet wins locally
      if (!hasPendingLocalChange(rec.entity, rec.id)) applyRemote(rec);
      if (rec.updated_at > newest) newest = rec.updated_at;
    }
    if (data.length < PAGE) break;
  }
  if (newest !== since) metaSet('last_pull', newest);
  return sawAny;
}

async function push() {
  const items = db.exec('SELECT entity, entity_id FROM c7_outbox ORDER BY queued_at LIMIT 1000');
  if (!items.length) return;
  const uid = session.user.id;
  for (let i = 0; i < items.length; i += PUSH_BATCH) {
    const slice = items.slice(i, i + PUSH_BATCH);
    const rows = slice.map(({ entity, entity_id }) => {
      const row = readLocalRow(entity, entity_id);
      const gone = !row || (row.deleted_at != null);
      return {
        owner_id: uid,
        entity,
        id: String(entity_id),
        data: gone ? (row || {}) : row,
        deleted: gone,
        updated_at: (row && row.updated_at) || nowISO(),
      };
    });
    const { error } = await sb.from('c7_records').upsert(rows, { onConflict: 'owner_id,entity,id' });
    if (error) throw error;
    db.runMany(slice.map(({ entity, entity_id }) => ['DELETE FROM c7_outbox WHERE entity=? AND entity_id=?', [entity, entity_id]]));
  }
}

// First sign-in on any device: queue EVERY local row for upload, once.
// Upserts are idempotent and per-record last-writer-wins, so re-sending
// rows the cloud already has is harmless — and it means the order devices
// sign in can never cause a device's existing data to be skipped (an
// earlier version only uploaded when the cloud was empty; a phone that
// created one record first would have silently blocked the desktop's
// whole upload). The pull that precedes this has already applied anything
// newer from the cloud. If the cloud already holds data, this device's
// untouched example case is removed rather than pushed up as a duplicate.
async function migrateIfFirst() {
  if (metaGet('migration_done')) return;
  const { count, error } = await sb.from('c7_records').select('id', { count: 'exact', head: true });
  if (error) throw error;
  if (count > 0) {
    // the seed is named "Example: The Harrow Household" — match loosely
    const seed = db.exec("SELECT id FROM case_file WHERE name LIKE '%Harrow Household%' AND deleted_at IS NULL");
    for (const s of seed) {
      if (!hasPendingLocalChange('case_file', s.id)) {
        db.run('UPDATE case_file SET deleted_at=? WHERE id=?', [nowISO(), s.id]);
      }
    }
  }
  const statements = [];
  for (const t of SYNC_TABLES) {
    for (const row of db.exec(`SELECT * FROM ${t}`)) {
      const id = t === 'tagging' ? `${row.tag_id}:${row.target_type}:${row.target_id}` : row.id;
      statements.push(['INSERT OR REPLACE INTO c7_outbox (entity, entity_id, queued_at) VALUES (?,?,?)', [t, id, nowISO()]]);
    }
  }
  if (statements.length) db.runMany(statements);
  metaSet('migration_done', '1');
}

export async function syncNow() {
  if (!sb || !session || running || !db.isReady()) return;
  running = true;
  setState({ status: 'syncing', error: null });
  try {
    await migrateIfFirst();
    await pull();
    await push();
    setState({ status: 'idle', pending: pendingCount(), lastSync: Date.now(), error: null });
  } catch (e) {
    setState({ status: 'error', pending: pendingCount(), error: String(e && e.message || e) });
  } finally {
    running = false;
  }
}

// ---- auth ----------------------------------------------------------------

async function loadSupabaseLib() {
  if (window.supabase) return true;
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
    setTimeout(() => resolve(!!window.supabase), 15000); // never hang boot
  });
}

export async function initSync() {
  ensureLocalTables();
  markOutboxReady();
  const ok = await loadSupabaseLib();
  if (!ok) { setState({ status: 'off', error: 'Sync library could not load (offline?) — the app works normally without it.' }); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
  });
  const { data } = await sb.auth.getSession();
  session = data?.session || null;
  sb.auth.onAuthStateChange((_evt, s) => {
    session = s;
    if (session) { setState({ status: 'idle' }); syncNow(); }
    else setState({ status: 'off' });
  });
  if (session) { setState({ status: 'idle', pending: pendingCount() }); syncNow(); }
  else setState({ status: 'off' });

  window.addEventListener('online', () => syncNow());
  timer = setInterval(() => { if (pendingCount() > 0 || session) syncNow(); }, INTERVAL_MS);
}

export async function signIn(email, password) {
  if (!sb) throw new Error('Sync is not available right now.');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (!sb) return;
  await sb.auth.signOut();
}

// test hook: lets the browser harness drive a full pull/push/migrate cycle
// against a mock cloud, so the engine is proven before real data meets it.
export function _testHook(fakeSb, fakeSession) {
  sb = fakeSb;
  session = fakeSession;
  ensureLocalTables();
  markOutboxReady();
}
