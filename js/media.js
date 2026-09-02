// Small helpers for linked media. YouTube thumbnails are an <img> load from
// YouTube's image host (her rule extension, 2026-09-02): nothing is sent
// but the video id; offline they simply don't render and the placeholder
// stays.

export function youtubeId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch (_) { /* not a URL */ }
  return null;
}

export function youtubeThumb(url) {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function fmtT(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "12:34" / "1:02:03" / "754" (seconds) → milliseconds, or null. */
export function parseT(str) {
  const s = String(str || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  return secs * 1000;
}
