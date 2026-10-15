// Learn page helpers (2026-10-15): turn what she types or pastes into
// seconds, and a lecture link into something the in-app player can seek.
// Pure functions, no DOM — covered in tests/browser-tests.html.

/** "12:30" → 750, "1:05:10" → 3910, "90" → 90, "12m30s" → 750. Anything else → null. */
export function parseTimestamp(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const parts = [+m[1], +m[2], m[3] == null ? null : +m[3]];
    if (parts[2] == null) return parts[1] > 59 ? null : parts[0] * 60 + parts[1];
    if (parts[1] > 59 || parts[2] > 59) return null;
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  m = t.match(/^\d+$/);
  return m ? +t : null;
}

/** 750 → "12:30", 3910 → "1:05:10". */
export function formatTimestamp(secs) {
  const s = Math.max(0, Math.round(+secs || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

export const MOMENT_KINDS = [
  { key: 'quote', label: 'Quote' },
  { key: 'point', label: 'Key point' },
  { key: 'question', label: 'Question' },
  { key: 'action', label: 'Action to try' },
];

/**
 * Many moments at once. One per line: "12:30 text", "[12:30] - text",
 * "1:05:10 “quoted words”". A line whose text sits in quotation marks is a
 * quote; everything else takes `defaultKind`. Lines that don't start with a
 * time are skipped and reported back so nothing disappears silently.
 */
export function parseMomentLines(text, defaultKind = 'point') {
  const moments = [], skipped = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[?\(?(\d{1,2}(?::\d{2}){1,2}|\d+h\s*\d*m?\s*\d*s?|\d+m\s*\d*s?)\]?\)?\s*[-–—:.)]*\s*(.+)$/i);
    const secs = m ? parseTimestamp(m[1]) : null;
    if (secs == null || !m[2].trim()) { skipped.push(line); continue; }
    let body = m[2].trim();
    const q = body.match(/^["“”'‘](.+)["“”'’]$/);
    let kind = defaultKind;
    if (q) { body = q[1].trim(); kind = 'quote'; }
    moments.push({ seconds: secs, kind, text: body });
  }
  return { moments, skipped };
}

/**
 * A pasted lecture link → { platform, id, embed(startSecs), open(startSecs) }.
 * platform is 'youtube' | 'vimeo' (both play and seek inside the app) or
 * 'link' (anything else: opens in a new tab; times are still saved).
 */
export function parseLectureUrl(input) {
  let raw = String(input ?? '').trim();
  if (!raw || /\s/.test(raw)) return null; // a link has no spaces; "not a url" must not become a host
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let u;
  try { u = new URL(raw); } catch (_) { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let yt = null;
  if (host === 'youtu.be') yt = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const p = u.pathname.split('/').filter(Boolean);
    if (u.pathname === '/watch') yt = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(p[0])) yt = p[1];
  }
  if (yt && /^[\w-]{6,15}$/.test(yt)) {
    return {
      platform: 'youtube', id: yt, url: u.href,
      embed: (s = 0) => `https://www.youtube.com/embed/${yt}?enablejsapi=1&rel=0&start=${Math.floor(s)}`,
      open: (s = 0) => `https://www.youtube.com/watch?v=${yt}${s ? `&t=${Math.floor(s)}s` : ''}`,
    };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const p = u.pathname.split('/').filter(Boolean);
    const id = p.find((x) => /^\d+$/.test(x));
    const hash = p[p.indexOf(id) + 1] && /^[a-f0-9]+$/i.test(p[p.indexOf(id) + 1]) ? p[p.indexOf(id) + 1] : u.searchParams.get('h');
    if (id) {
      const h = hash ? `h=${hash}&` : '';
      return {
        platform: 'vimeo', id, url: u.href,
        embed: (s = 0) => `https://player.vimeo.com/video/${id}?${h}#t=${Math.floor(s)}s`,
        open: (s = 0) => `https://vimeo.com/${id}${hash ? '/' + hash : ''}${s ? `#t=${Math.floor(s)}s` : ''}`,
      };
    }
  }
  return { platform: 'link', id: null, url: u.href, embed: null, open: () => u.href };
}

/** Ask an already-loaded embed to jump to `secs` and play. Returns false when this platform can't seek. */
export function seekEmbed(iframe, platform, secs) {
  const w = iframe && iframe.contentWindow;
  if (!w) return false;
  if (platform === 'youtube') {
    w.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [secs, true] }), '*');
    w.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    return true;
  }
  if (platform === 'vimeo') {
    w.postMessage(JSON.stringify({ method: 'setCurrentTime', value: secs }), '*');
    w.postMessage(JSON.stringify({ method: 'play' }), '*');
    return true;
  }
  return false;
}
