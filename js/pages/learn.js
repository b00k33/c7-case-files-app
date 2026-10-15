// Learn — the people she studies from, their lectures, and the moments worth
// keeping (her ask, 2026-10-15: "list people as part of my education journey
// so i can post links of their video lectures and include timestamps of
// significant things they say and quotes"). Her picks from the mock: its own
// page (not the Inspo Board); tapping a time plays the video INSIDE C7 and
// jumps there (YouTube + Vimeo; any other link is saved and opens in a new
// tab); moments are Quote / Key point / Question / Action to try; teachers
// grouped by subject; each lecture Queued → Watching → Watched; add one at
// a time or paste many; Wikidata photo, upload and optional C7 link work
// exactly as on the Inspo Board (that code is repeated here, not shared —
// see the note in CLAUDE.md before touching either).
//
// Redraw rule: the video player is an <iframe>, and moving or re-creating it
// restarts the video. So adding / editing / ticking a moment repaints only
// that lecture's moment list; the player and the rest of the card stay put.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, compressImage } from '../assets.js';
import { searchPeople, fetchItemPhoto } from '../lookup.js';
import { parseTimestamp, formatTimestamp, parseMomentLines, parseLectureUrl, seekEmbed, MOMENT_KINDS } from '../learn-parse.js';

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const VIEW_KEY = 'c7-learn-view';   // 'lectures' | 'quotes'
const TEACHER_KEY = 'c7-learn-teacher';
const KIND_KEY = 'c7-learn-kind';   // the kind she used last — the next moment starts there
const TINTS = ['green', 'red', 'violet', 'teal'];
const KIND_CHIP = { quote: 'violet', point: 'teal', question: 'brass', action: 'green' };
const KIND_LABEL = Object.fromEntries(MOMENT_KINDS.map((k) => [k.key, k.label]));
const STATUS = ['queued', 'watching', 'watched'];
const STATUS_LABEL = { queued: 'Queued', watching: 'Watching', watched: 'Watched' };
const STATUS_CHIP = { queued: '', watching: 'brass', watched: 'green' };
const PLATFORM_ICON = { youtube: '▶', vimeo: '▶', link: '↗' };

const ls = {
  get(k, d) { try { return localStorage.getItem(k) || d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
};

export async function render(root, ctx) {
  const { store } = ctx;
  let teachers = await store.listLearnTeachers();
  let teacherId = ls.get(TEACHER_KEY, null);
  if (!teachers.find((t) => t.id === teacherId)) teacherId = teachers[0]?.id || null;
  let view = ls.get(VIEW_KEY, 'lectures') === 'quotes' ? 'quotes' : 'lectures';
  let kindPick = ls.get(KIND_KEY, 'point'); if (!KIND_LABEL[kindPick]) kindPick = 'point';
  let mobileDetail = false;
  let lectures = [], moments = [];
  const players = new Map(); // lecture id → its live <iframe>; survives moment redraws
  const editingMoment = new Set();
  let lastAdded = null; // the moment just saved — the only row that animates in on a redraw

  let c7People = [];
  try { c7People = await store.listAllPeople(); } catch (_) { /* the page still works without the link */ }
  const c7ById = new Map(c7People.map((x) => [x.id, x]));

  // ---------------------------------------------------------- photos -----
  async function photoSrc(t) {
    const own = t.photo_path ? await resolveAssetUrl(t.photo_path, 'image/jpeg') : t.photo_url;
    if (own) return own;
    const c7 = t.person_id ? c7ById.get(t.person_id) : null;
    if (!c7) return null;
    return c7.photo_path ? resolveAssetUrl(c7.photo_path, 'image/jpeg') : c7.photo_url;
  }
  function hydratePhotos(scope) {
    const byId = new Map(teachers.map((t) => [t.id, t]));
    scope.querySelectorAll('.inspo-avatar[data-tid]').forEach(async (el) => {
      const t = byId.get(el.dataset.tid);
      const src = t && await photoSrc(t);
      if (!src) return;
      const img = new Image();
      img.alt = ''; img.className = 'inspo-photo';
      img.onload = () => el.appendChild(img);
      img.src = src;
    });
  }
  async function savePhotoFile(file) {
    const meta = await store.storeEvidenceFile(await compressImage(file));
    const { queueUpload, flushUploads } = await import('../assets.js');
    queueUpload(meta.file_path, meta.mime); flushUploads();
    return meta.file_path;
  }
  async function downloadPhoto(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await savePhotoFile(new File([blob], 'learn.jpg', { type: blob.type || 'image/jpeg' }));
    } catch (_) { return null; }
  }

  // ------------------------------------------------------------ shell ----
  const tint = (id) => TINTS[Math.max(0, teachers.findIndex((t) => t.id === id)) % TINTS.length];
  const avatar = (t, size = '') => `<span class="inspo-avatar ${size} cat-${tint(t.id)}" data-tid="${esc(t.id)}">${esc((t.name || '?')[0].toUpperCase())}</span>`;

  async function reloadTeachers() { teachers = await store.listLearnTeachers(); }
  async function loadTeacher() {
    lectures = teacherId ? await store.listLearnLectures(teacherId) : [];
    moments = teacherId ? await store.listLearnMoments(teacherId) : [];
  }

  async function paint() {
    await loadTeacher();
    const total = teachers.reduce((n, t) => n + t.moment_count, 0);
    root.innerHTML = `
      <div class="learn-page">
        <div class="shelf-topbar">
          <div>
            <p class="shelf-eyebrow">My education journey</p>
            <h1 class="shelf-h1">Learn</h1>
            <p class="shelf-stat">${teachers.length} teacher${teachers.length === 1 ? '' : 's'} &middot; ${total} saved moment${total === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div class="learn-shell ${mobileDetail ? 'detail-open' : ''}">
          <aside class="learn-list" id="learn-list"></aside>
          <section class="learn-detail" id="learn-detail"></section>
        </div>
      </div>`;
    paintList();
    paintDetail();
  }

  function paintList() {
    const el = root.querySelector('#learn-list');
    const bySubject = new Map();
    for (const t of teachers) { const k = (t.subject || '').trim() || 'No subject yet'; (bySubject.get(k) || bySubject.set(k, []).get(k)).push(t); }
    el.innerHTML = [...bySubject].map(([subj, ts]) => `
      <p class="learn-subject">${esc(subj)}</p>
      ${ts.map((t) => `
        <button type="button" class="learn-teacher ${t.id === teacherId ? 'on' : ''}" data-t="${esc(t.id)}">
          ${avatar(t, 'sm')}
          <span class="learn-teacher-text"><b>${esc(t.name)}</b><small>${t.lecture_count} lecture${t.lecture_count === 1 ? '' : 's'} &middot; ${t.moment_count} moment${t.moment_count === 1 ? '' : 's'}</small></span>
        </button>`).join('')}`).join('')
      + `<button type="button" class="btn btn-ghost btn-sm learn-add-teacher" id="learn-add-teacher">+ Add teacher</button>`;
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', async () => {
      teacherId = b.dataset.t; ls.set(TEACHER_KEY, teacherId); mobileDetail = true;
      players.clear(); editingMoment.clear();
      await paint();
    }));
    el.querySelector('#learn-add-teacher').addEventListener('click', () => { mobileDetail = true; root.querySelector('.learn-shell').classList.add('detail-open'); teacherForm(null); });
    hydratePhotos(el);
  }

  // ----------------------------------------------------------- detail ----
  function paintDetail() {
    const el = root.querySelector('#learn-detail');
    const t = teachers.find((x) => x.id === teacherId);
    if (!t) {
      el.innerHTML = '';
      el.appendChild(emptyState({
        missing: 'No teachers yet.',
        why: 'Add someone you learn from, then paste a link to one of their lectures and save the moments worth keeping.',
        action: 'Add your first teacher', onAction: () => teacherForm(null),
      }));
      return;
    }
    el.innerHTML = `
      <button type="button" class="btn btn-ghost btn-sm learn-back" id="learn-back">← Teachers</button>
      <div class="learn-head">
        ${avatar(t)}
        <div class="learn-head-text">
          <h2>${esc(t.name)}</h2>
          <p>${t.subject ? `<span class="chip teal">${esc(t.subject)}</span> ` : ''}${esc(t.tagline || '')}</p>
        </div>
        ${t.person_id && c7ById.has(t.person_id) ? '<button type="button" class="btn btn-ghost btn-sm" id="learn-open-c7">C7 ↗</button>' : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="learn-edit-teacher">Edit</button>
        <div class="shelf-segctrl" id="learn-seg" role="group" aria-label="View">
          <span class="shelf-seg-thumb" style="transform:translateX(${view === 'quotes' ? '100%' : '0%'})"></span>
          <button type="button" class="shelf-seg-btn ${view === 'lectures' ? 'active' : ''}" data-v="lectures">By lecture</button>
          <button type="button" class="shelf-seg-btn ${view === 'quotes' ? 'active' : ''}" data-v="quotes">Quotes only</button>
        </div>
      </div>
      <div id="learn-form-slot"></div>
      <div id="learn-body"></div>`;
    el.querySelector('#learn-back').addEventListener('click', () => { mobileDetail = false; root.querySelector('.learn-shell').classList.remove('detail-open'); });
    el.querySelector('#learn-edit-teacher').addEventListener('click', () => teacherForm(t));
    el.querySelector('#learn-open-c7')?.addEventListener('click', () => {
      const c7 = c7ById.get(t.person_id);
      if (c7) ctx.setCaseId(c7.case_id).then(() => ctx.navigate(`#/subject/${c7.id}`));
    });
    el.querySelectorAll('#learn-seg .shelf-seg-btn').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.v === view) return;
      view = b.dataset.v; ls.set(VIEW_KEY, view); players.clear(); paintDetail();
    }));
    hydratePhotos(el);
    if (view === 'quotes') paintQuotes(); else paintLectures();
  }

  function paintQuotes() {
    const body = root.querySelector('#learn-body');
    const rows = [];
    for (const l of lectures) for (const m of moments) if (m.lecture_id === l.id && m.kind === 'quote') rows.push({ l, m });
    body.innerHTML = rows.length ? `<div class="inspo-feed">${rows.map((r, n) => `
      <figure class="inspo-feed-item" style="animation-delay:${Math.min(n, 12) * 0.04}s">
        <blockquote class="inspo-quote big">“${esc(r.m.text)}”</blockquote>
        <figcaption>
          <button type="button" class="learn-ts" data-goto="${esc(r.l.id)}" data-s="${r.m.seconds}" title="Play from here">${formatTimestamp(r.m.seconds)}</button>
          ${esc(r.l.title)}
        </figcaption>
      </figure>`).join('')}</div>`
      : '<p class="shelf-stat">No quotes saved for this teacher yet. Switch to “By lecture” and add one with the Quote tag.</p>';
    body.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
      view = 'lectures'; ls.set(VIEW_KEY, view); paintDetail();
      const lid = b.dataset.goto;
      root.querySelector(`.learn-lecture[data-lid="${lid}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      playAt(lid, +b.dataset.s);
    }));
  }

  function paintLectures() {
    const body = root.querySelector('#learn-body');
    body.innerHTML = `
      ${lectures.map(lectureCard).join('') || '<p class="shelf-stat">No lectures yet. Paste a link below to add the first.</p>'}
      <div class="card learn-add-lecture">
        <input class="input" id="ll-url" placeholder="Paste a lecture link (YouTube, Vimeo, or any page)" autocomplete="off">
        <input class="input" id="ll-title" placeholder="Title (optional — filled in for YouTube and Vimeo)" autocomplete="off">
        <div class="inspo-form-actions"><button class="btn btn-primary btn-sm" id="ll-add">Add lecture</button><span class="shelf-stat" id="ll-msg"></span></div>
      </div>`;
    lectures.forEach((l) => { paintMoments(l.id, true); wireLecture(l); });
    body.querySelector('#ll-add').addEventListener('click', addLecture);
    body.querySelector('#ll-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') addLecture(); });
  }

  function lectureCard(l) {
    const info = parseLectureUrl(l.url);
    const canPlay = info && info.platform !== 'link';
    return `
      <article class="learn-lecture card" data-lid="${esc(l.id)}">
        <div class="learn-lec-head">
          <span class="learn-plat">${PLATFORM_ICON[info?.platform || 'link']}</span>
          <div class="learn-lec-title">
            <h3>${esc(l.title)}</h3>
            ${l.url ? `<small>${esc(String(l.url).replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</small>` : '<small>No link yet</small>'}
          </div>
          <button type="button" class="chip ${STATUS_CHIP[l.status] || ''} learn-status" data-act="status" title="Tap to change">${STATUS_LABEL[l.status] || 'Queued'}</button>
        </div>
        <div class="learn-lec-actions">
          ${canPlay ? '<button type="button" class="btn btn-ghost btn-sm" data-act="play">Play here</button>' : ''}
          ${info ? '<button type="button" class="btn btn-ghost btn-sm" data-act="open">Open in new tab</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-act="rename">Rename</button>
          <button type="button" class="btn btn-ghost btn-sm inspo-del" data-act="del-lec">Delete lecture</button>
        </div>
        <div class="learn-player" data-player="${esc(l.id)}"></div>
        <div class="learn-moments" data-moments="${esc(l.id)}"></div>
        <div class="learn-addmoment">
          <div class="learn-add-row">
            <input class="input learn-time" data-f="time" placeholder="1:23:45" autocomplete="off" aria-label="Time in the video">
            <input class="input learn-text" data-f="text" placeholder="What did they say or teach?" autocomplete="off">
            <button type="button" class="btn btn-primary btn-sm" data-act="add-moment">Add</button>
          </div>
          <div class="learn-kinds" role="group" aria-label="Kind of moment">
            ${MOMENT_KINDS.map((k) => `<button type="button" class="chip ${KIND_CHIP[k.key]} learn-kind ${k.key === kindPick ? 'on' : ''}" data-kind="${k.key}">${k.label}</button>`).join('')}
            <span class="shelf-stat" data-f="hint"></span>
          </div>
          <details class="learn-paste">
            <summary>Paste many at once</summary>
            <textarea class="input" data-f="paste" rows="5" placeholder="12:30 Clarity about what matters&#10;1:05:10 “Words in quote marks save as a quote”"></textarea>
            <div class="inspo-form-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="paste-add">Add all as <b data-f="pastekind">${esc(KIND_LABEL[kindPick])}</b></button><span class="shelf-stat" data-f="pastemsg"></span></div>
          </details>
        </div>
      </article>`;
  }

  // restore a live player after a full lecture redraw only happens on a new paint; players are cleared then.
  function wireLecture(l) {
    const card = root.querySelector(`.learn-lecture[data-lid="${l.id}"]`);
    if (!card) return;
    const $f = (n) => card.querySelector(`[data-f="${n}"]`);
    const info = parseLectureUrl(l.url);

    card.querySelector('[data-act="status"]').addEventListener('click', async (e) => {
      const next = STATUS[(STATUS.indexOf(l.status) + 1) % STATUS.length];
      l.status = next;
      await store.updateLearnLecture(l.id, { status: next });
      e.currentTarget.textContent = STATUS_LABEL[next];
      e.currentTarget.className = `chip ${STATUS_CHIP[next]} learn-status`;
    });
    card.querySelector('[data-act="play"]')?.addEventListener('click', () => playAt(l.id, 0));
    card.querySelector('[data-act="open"]')?.addEventListener('click', () => window.open(info.open(0), '_blank', 'noopener'));
    card.querySelector('[data-act="rename"]').addEventListener('click', async () => {
      const n = (window.prompt('Lecture title', l.title) || '').trim();
      if (!n || n === l.title) return;
      l.title = n; await store.updateLearnLecture(l.id, { title: n });
      card.querySelector('.learn-lec-title h3').textContent = n;
    });
    card.querySelector('[data-act="del-lec"]').addEventListener('click', async () => {
      const n = moments.filter((m) => m.lecture_id === l.id).length;
      if (!window.confirm(`Delete “${l.title}”${n ? ` and its ${n} saved moment${n === 1 ? '' : 's'}` : ''}?`)) return;
      await store.deleteLearnLecture(l.id); players.delete(l.id);
      await reloadTeachers(); await paint();
    });

    card.querySelectorAll('.learn-kind').forEach((b) => b.addEventListener('click', () => {
      kindPick = b.dataset.kind; ls.set(KIND_KEY, kindPick);
      root.querySelectorAll('.learn-kind').forEach((x) => x.classList.toggle('on', x.dataset.kind === kindPick));
      root.querySelectorAll('[data-f="pastekind"]').forEach((x) => { x.textContent = KIND_LABEL[kindPick]; });
    }));
    $f('time').addEventListener('input', () => {
      const v = $f('time').value; const s = parseTimestamp(v);
      $f('hint').textContent = !v.trim() ? '' : s == null ? 'Use a time like 12:30 or 1:05:10' : `Jumps to ${formatTimestamp(s)}`;
    });
    const add = async () => {
      const s = parseTimestamp($f('time').value); const text = $f('text').value.trim();
      if (s == null) { $f('hint').textContent = 'Enter a time like 12:30 or 1:05:10'; $f('time').focus(); return; }
      if (!text) { $f('hint').textContent = 'Add what they said'; $f('text').focus(); return; }
      const id = await store.createLearnMoment({ lecture_id: l.id, seconds: s, kind: kindPick, text });
      moments.push({ id, lecture_id: l.id, seconds: s, kind: kindPick, text, done: 0 });
      lastAdded = id;
      $f('time').value = ''; $f('text').value = ''; $f('hint').textContent = '';
      $f('time').focus();
      await afterMomentChange(l.id);
    };
    card.querySelector('[data-act="add-moment"]').addEventListener('click', add);
    $f('text').addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    card.querySelector('[data-act="paste-add"]').addEventListener('click', async () => {
      const { moments: found, skipped } = parseMomentLines($f('paste').value, kindPick);
      if (!found.length) { $f('pastemsg').textContent = skipped.length ? 'Each line needs a time first, like “12:30 text”.' : 'Paste some lines first.'; return; }
      for (const m of found) {
        const id = await store.createLearnMoment({ lecture_id: l.id, seconds: m.seconds, kind: m.kind, text: m.text });
        moments.push({ id, lecture_id: l.id, seconds: m.seconds, kind: m.kind, text: m.text, done: 0 });
        lastAdded = id;
      }
      $f('paste').value = '';
      $f('pastemsg').textContent = `Added ${found.length}${skipped.length ? ` · skipped ${skipped.length} line${skipped.length === 1 ? '' : 's'} with no time` : ''}`;
      await afterMomentChange(l.id);
    });
  }

  async function afterMomentChange(lid) {
    paintMoments(lid);
    await reloadTeachers(); paintList();
    const stat = root.querySelector('.shelf-stat');
    const total = teachers.reduce((n, t) => n + t.moment_count, 0);
    if (stat) stat.innerHTML = `${teachers.length} teacher${teachers.length === 1 ? '' : 's'} &middot; ${total} saved moment${total === 1 ? '' : 's'}`;
  }

  // The moment list of ONE lecture — repainted alone so a playing video isn't disturbed.
  function paintMoments(lid, enter = false) {
    const el = root.querySelector(`[data-moments="${lid}"]`);
    if (!el) return;
    const rows = moments.filter((m) => m.lecture_id === lid).sort((a, b) => a.seconds - b.seconds);
    el.classList.toggle('enter', enter);
    el.innerHTML = rows.map((m, i) => editingMoment.has(m.id) ? momentEdit(m) : momentRow(m, i)).join('');
    el.querySelectorAll('[data-m]').forEach((row) => {
      const m = moments.find((x) => x.id === row.dataset.m);
      const on = (sel, fn) => row.querySelector(sel)?.addEventListener('click', fn);
      on('.learn-ts', () => playAt(lid, m.seconds));
      on('[data-mact="edit"]', () => { editingMoment.add(m.id); paintMoments(lid); });
      on('[data-mact="cancel"]', () => { editingMoment.delete(m.id); paintMoments(lid); });
      on('[data-mact="del"]', async () => {
        if (!window.confirm('Delete this moment?')) return;
        await store.deleteLearnMoment(m.id);
        moments.splice(moments.indexOf(m), 1);
        await afterMomentChange(lid);
      });
      on('[data-mact="save"]', async () => {
        const s = parseTimestamp(row.querySelector('[data-e="time"]').value); const text = row.querySelector('[data-e="text"]').value.trim();
        const kind = row.querySelector('[data-e="kind"]').value;
        if (s == null || !text) { row.querySelector('[data-e="err"]').textContent = s == null ? 'Enter a time like 12:30' : 'Add what they said'; return; }
        Object.assign(m, { seconds: s, text, kind });
        await store.updateLearnMoment(m.id, { seconds: s, text, kind });
        editingMoment.delete(m.id); await afterMomentChange(lid);
      });
      row.querySelector('[data-mact="done"]')?.addEventListener('change', async (e) => {
        m.done = e.target.checked ? 1 : 0;
        await store.updateLearnMoment(m.id, { done: m.done });
        row.classList.toggle('done', !!m.done);
      });
    });
  }

  function momentRow(m, i) {
    return `
      <div class="learn-moment ${m.done ? 'done' : ''} ${m.id === lastAdded ? 'fresh' : ''}" data-m="${esc(m.id)}" style="animation-delay:${(Math.min(i, 8) * 0.03).toFixed(2)}s">
        <button type="button" class="learn-ts" title="Play from ${formatTimestamp(m.seconds)}">${formatTimestamp(m.seconds)}</button>
        <div class="learn-moment-body">
          ${m.kind === 'quote' ? `<div class="inspo-quote">“${esc(m.text)}”</div>` : `<div>${esc(m.text)}</div>`}
        </div>
        ${m.kind === 'action' ? `<label class="learn-done" title="Mark as done"><input type="checkbox" data-mact="done" ${m.done ? 'checked' : ''}> Done</label>` : ''}
        <span class="chip ${KIND_CHIP[m.kind] || ''}">${esc(KIND_LABEL[m.kind] || 'Key point')}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-mact="edit" aria-label="Edit moment">Edit</button>
      </div>`;
  }
  function momentEdit(m) {
    return `
      <div class="learn-moment editing" data-m="${esc(m.id)}">
        <input class="input learn-time" data-e="time" value="${formatTimestamp(m.seconds)}" aria-label="Time">
        <input class="input learn-text" data-e="text" value="${esc(m.text)}" aria-label="Text">
        <select class="input" data-e="kind" aria-label="Kind">${MOMENT_KINDS.map((k) => `<option value="${k.key}" ${k.key === m.kind ? 'selected' : ''}>${k.label}</option>`).join('')}</select>
        <button type="button" class="btn btn-primary btn-sm" data-mact="save">Save</button>
        <button type="button" class="btn btn-ghost btn-sm" data-mact="cancel">Cancel</button>
        <button type="button" class="btn btn-ghost btn-sm inspo-del" data-mact="del">Delete</button>
        <span class="shelf-stat" data-e="err"></span>
      </div>`;
  }

  // ----------------------------------------------------------- player ----
  /** Make sure this lecture's player is open, then jump to `secs`. Non-embeddable links open in a new tab at that time. */
  function playAt(lid, secs) {
    const l = lectures.find((x) => x.id === lid);
    const info = l && parseLectureUrl(l.url);
    if (!info) return;
    if (info.platform === 'link') { window.open(info.open(secs), '_blank', 'noopener'); return; }
    const slot = root.querySelector(`[data-player="${lid}"]`);
    if (!slot) return;
    let frame = players.get(lid);
    if (frame && slot.contains(frame)) { seekEmbed(frame, info.platform, secs); return; }
    frame = document.createElement('iframe');
    frame.className = 'learn-frame';
    frame.title = l.title;
    frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
    frame.allowFullscreen = true;
    frame.src = info.embed(secs) + (info.platform === 'youtube' ? '&autoplay=1' : '');
    slot.innerHTML = '';
    slot.appendChild(frame);
    players.set(lid, frame);
    const bar = document.createElement('div');
    bar.className = 'learn-player-bar';
    bar.innerHTML = '<span class="shelf-stat">Tap any time below to jump here. If the video won’t play, the owner may have blocked embedding.</span><button type="button" class="btn btn-ghost btn-sm" data-act="close-player">Close player</button>';
    bar.querySelector('button').addEventListener('click', () => { players.delete(lid); slot.innerHTML = ''; });
    slot.appendChild(bar);
  }

  async function addLecture() {
    const urlEl = root.querySelector('#ll-url'), titleEl = root.querySelector('#ll-title'), msg = root.querySelector('#ll-msg');
    const raw = urlEl.value.trim(); let title = titleEl.value.trim();
    if (!raw && !title) { msg.textContent = 'Paste a link or type a title'; urlEl.focus(); return; }
    let url = null;
    if (raw) {
      const info = parseLectureUrl(raw);
      if (!info) { msg.textContent = 'That doesn’t look like a link'; urlEl.focus(); return; }
      url = info.url;
      if (!title && info.platform !== 'link') {
        msg.textContent = 'Getting the title…';
        title = await fetchTitle(info);
      }
      if (!title) { try { title = new URL(info.url).hostname.replace(/^www\./, ''); } catch (_) { title = 'Untitled lecture'; } }
    }
    await store.createLearnLecture({ teacher_id: teacherId, title: title || 'Untitled lecture', url });
    await reloadTeachers(); await paint();
  }
  /** YouTube and Vimeo both publish a public oEmbed title. Offline or blocked → null (she can type one). */
  async function fetchTitle(info) {
    const api = info.platform === 'youtube'
      ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(info.url)}`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(info.url)}`;
    try {
      const res = await fetch(api);
      if (!res.ok) return null;
      return ((await res.json()).title || '').trim() || null;
    } catch (_) { return null; }
  }

  // ---------------------------------------------------- teacher form -----
  function teacherForm(t) {
    const slot = root.querySelector('#learn-form-slot') || (() => {
      root.querySelector('#learn-detail').innerHTML = '<div id="learn-form-slot"></div>';
      return root.querySelector('#learn-form-slot');
    })();
    const subjects = [...new Set(teachers.map((x) => (x.subject || '').trim()).filter(Boolean))];
    const pend = { photoFile: null, photoUrl: t?.photo_url || null, keepPath: t?.photo_path || null, wikidata_id: t?.wikidata_id || null, person_id: t?.person_id || null };
    slot.innerHTML = `
      <div class="card inspo-form">
        <h3>${t ? 'Edit teacher' : 'Add teacher'}</h3>
        <label>Name<input class="input" id="lt-name" value="${esc(t?.name || '')}" autocomplete="off"></label>
        <label>Subject <span class="shelf-stat">(groups your teachers — Chinese medicine, Business…)</span><input class="input" id="lt-subject" list="lt-subjects" value="${esc(t?.subject || '')}" autocomplete="off"><datalist id="lt-subjects">${subjects.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <div class="inspo-lookup">
          <button type="button" class="btn btn-ghost btn-sm" id="lt-find">Find on Wikidata</button>
          <label class="btn btn-ghost btn-sm inspo-upload">Upload photo<input type="file" accept="image/*" id="lt-file" hidden></label>
          <span class="shelf-stat" id="lt-photo-state">${pend.keepPath || pend.photoUrl ? 'Photo set' : 'No photo'}</span>
        </div>
        <div id="lt-results" class="inspo-results"></div>
        <label>Known for <span class="shelf-stat">(optional, one line)</span><input class="input" id="lt-tag" value="${esc(t?.tagline || '')}" autocomplete="off"></label>
        <label>Same person in C7? <span class="shelf-stat">(optional — shares their photo, adds a link)</span>
          <select class="input" id="lt-link"><option value="">Not linked</option>${c7People.map((x) => `<option value="${esc(x.id)}" ${x.id === pend.person_id ? 'selected' : ''}>${esc(x.display_name)}${x.case_name ? ' — ' + esc(x.case_name) : ''}</option>`).join('')}</select>
        </label>
        <div class="inspo-form-actions">
          <button class="btn btn-primary btn-sm" id="lt-save">Save</button>
          <button class="btn btn-ghost btn-sm" id="lt-cancel">Cancel</button>
          ${t ? '<button class="btn btn-ghost btn-sm inspo-del" id="lt-del">Delete teacher</button>' : ''}
        </div>
      </div>`;
    const $ = (s) => slot.querySelector(s);
    const state = (x) => { $('#lt-photo-state').textContent = x; };
    $('#lt-name').focus();
    $('#lt-cancel').addEventListener('click', () => { if (t) slot.innerHTML = ''; else paint(); });
    $('#lt-file').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      pend.photoFile = f; pend.photoUrl = null; pend.keepPath = null; state(`Photo: ${f.name}`);
    });
    $('#lt-link').addEventListener('change', (e) => {
      pend.person_id = e.target.value || null;
      const c7 = pend.person_id ? c7ById.get(pend.person_id) : null;
      if (c7 && !$('#lt-name').value.trim()) $('#lt-name').value = c7.display_name;
    });
    $('#lt-find').addEventListener('click', async () => {
      const q = $('#lt-name').value.trim(); const out = $('#lt-results');
      if (!q) { $('#lt-name').focus(); return; }
      out.textContent = 'Searching…';
      let hits = [];
      try { hits = await searchPeople(q); } catch (_) { out.textContent = 'Couldn’t reach Wikidata — check your connection, or upload a photo instead.'; return; }
      if (!hits.length) { out.textContent = 'No match on Wikidata. You can still upload a photo.'; return; }
      out.innerHTML = hits.map((h) => `<button type="button" class="inspo-hit" data-q="${esc(h.id)}" data-l="${esc(h.label)}" data-d="${esc(h.description)}"><b>${esc(h.label)}</b> <span>${esc(h.description)}</span></button>`).join('');
      out.querySelectorAll('.inspo-hit').forEach((b) => b.addEventListener('click', async () => {
        out.textContent = 'Getting their photo…';
        pend.wikidata_id = b.dataset.q; $('#lt-name').value = b.dataset.l;
        if (!$('#lt-tag').value.trim() && b.dataset.d) $('#lt-tag').value = b.dataset.d.replace(/^./, (c) => c.toUpperCase());
        let photoUrl = null;
        try { photoUrl = (await fetchItemPhoto(b.dataset.q)).photoUrl; } catch (_) { /* name and tagline still applied */ }
        if (photoUrl) { pend.photoUrl = photoUrl; pend.photoFile = null; pend.keepPath = null; }
        state(photoUrl ? 'Photo from Wikipedia' : 'Matched — no Wikipedia photo found');
        out.innerHTML = '';
      }));
    });
    $('#lt-save').addEventListener('click', async () => {
      const name = $('#lt-name').value.trim();
      if (!name) { $('#lt-name').focus(); return; }
      let photo_path = pend.keepPath; let photo_url = pend.photoUrl;
      if (pend.photoFile) { photo_path = await savePhotoFile(pend.photoFile); photo_url = null; }
      else if (pend.photoUrl && pend.photoUrl !== t?.photo_url) { photo_path = await downloadPhoto(pend.photoUrl); }
      const data = {
        name, subject: $('#lt-subject').value.trim() || null, tagline: $('#lt-tag').value.trim() || null,
        photo_path: photo_path || null, photo_url: photo_url || null, wikidata_id: pend.wikidata_id, person_id: pend.person_id,
      };
      if (t) await store.updateLearnTeacher(t.id, data);
      else { teacherId = await store.createLearnTeacher(data); ls.set(TEACHER_KEY, teacherId); }
      await reloadTeachers(); await paint();
    });
    $('#lt-del')?.addEventListener('click', async () => {
      const msg = `Delete ${t.name}${t.lecture_count ? `, their ${t.lecture_count} lecture${t.lecture_count === 1 ? '' : 's'} and ${t.moment_count} saved moment${t.moment_count === 1 ? '' : 's'}` : ''}?`;
      if (!window.confirm(msg)) return;
      await store.deleteLearnTeacher(t.id);
      await reloadTeachers(); teacherId = teachers[0]?.id || null; mobileDetail = false; await paint();
    });
    slot.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  await paint();
}
