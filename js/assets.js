// Image compression + cloud copies of evidence files (her call, 2026-09-02:
// images added on the phone must be reviewable on the computer).
//
// Local storage (data/assets or IndexedDB) stays the first home of every
// file. A copy goes to private cloud storage under <user id>/<file path>;
// anything that can't upload right now (offline, signed out) waits in a
// local queue and is retried after each sync cycle. When a device is asked
// to show a file it doesn't hold, it downloads the cloud copy once and keeps
// it locally from then on.

import * as db from './db.js';
import { getClient, currentUserId } from './sync.js';

export const BUCKET = 'c7-assets';
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Shrink a screenshot/photo to ≤1600px JPEG (her pick). Non-images and GIFs pass through. */
export async function compressImage(file) {
  if (!/^image\//.test(file.type) || file.type === 'image/gif') return file;
  let bmp = null;
  try { bmp = await createImageBitmap(file); } catch (_) { return file; }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) return file;
  const base = (file.name || 'image').replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified || Date.now() });
}

function ensureQueue() {
  db.run('CREATE TABLE IF NOT EXISTS c7_asset_queue (file_path TEXT PRIMARY KEY, mime TEXT, queued_at TEXT NOT NULL)');
}

export function queueUpload(filePath, mime) {
  ensureQueue();
  db.run('INSERT OR REPLACE INTO c7_asset_queue (file_path, mime, queued_at) VALUES (?,?,?)', [filePath, mime || null, new Date().toISOString()]);
}

export function pendingUploads() {
  if (!db.isReady()) return 0;
  ensureQueue();
  const r = db.exec('SELECT COUNT(*) AS n FROM c7_asset_queue');
  return r.length ? r[0].n : 0;
}

let flushing = false;
/** Upload queued files to the cloud. Stops at the first failure and retries next cycle. */
export async function flushUploads() {
  const sb = getClient();
  const uid = currentUserId();
  if (!sb || !uid || flushing || !db.isReady()) return 0;
  flushing = true;
  let done = 0;
  try {
    ensureQueue();
    const rows = db.exec('SELECT file_path, mime FROM c7_asset_queue ORDER BY queued_at LIMIT 25');
    for (const r of rows) {
      let url = null;
      try {
        url = await db.assetUrl(r.file_path);
        const blob = await fetch(url).then((x) => x.blob());
        const { error } = await sb.storage.from(BUCKET).upload(`${uid}/${r.file_path}`, blob, { contentType: r.mime || blob.type || 'application/octet-stream', upsert: true });
        if (error) throw error;
        db.run('DELETE FROM c7_asset_queue WHERE file_path=?', [r.file_path]);
        done++;
      } catch (e) {
        console.warn('Asset upload deferred:', r.file_path, e && e.message);
        break;
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }
  } finally {
    flushing = false;
  }
  return done;
}

// object URLs per file path, so a grid of thumbnails doesn't re-read files
const urlCache = new Map();

/** Local first; otherwise fetch the cloud copy, keep it locally, serve it. Null if nowhere. */
export async function resolveAssetUrl(filePath, mime) {
  if (!filePath) return null;
  if (urlCache.has(filePath)) return urlCache.get(filePath);
  try {
    const u = await db.assetUrl(filePath);
    urlCache.set(filePath, u);
    return u;
  } catch (_) { /* not on this device — try the cloud */ }
  const sb = getClient();
  const uid = currentUserId();
  if (!sb || !uid) return null;
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(`${uid}/${filePath}`);
    if (error || !data) return null;
    await db.importAsset(filePath, data, mime || data.type);
    const u = URL.createObjectURL(data);
    urlCache.set(filePath, u);
    return u;
  } catch (_) {
    return null;
  }
}
