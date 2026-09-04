// Questions & theories (her ask, 2026-09-03: "in fiction, sometimes I have
// questions about the fictional world and I research theories that I like.
// how do I include that in the cases" — eight popup answers).
//
// A question is about the world / the case, or about a person. Under it
// sit the theories that answer it — each with its own evidence (a quote,
// a page, a video moment) and a line on why it convinces her — and ★ marks
// the ones she leans towards, as many as she likes. "Mark answered…" asks
// which theory settled it and which evidence proves it; the chip turns
// green. Nothing here ever reaches a profile or Review: a theory is never
// a fact. Questions raised from Review land on this same page.
//
// Storage: one table. A row with parent_id is a theory of that question;
// evidence attaches through evidence_link with target_type 'question'
// (target = the theory, or the question itself for "what settled it").

import { emptyState } from '../indicators.js';
import { inlineNameForm, inlineNote, clearInlineNote, twoTapConfirm } from '../ui.js';

const FILTER_KEY = 'c7-q-filter'; // all | open | leaning | answered

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function initials(name) { return String(name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
const EV_GLYPH = { video: '▶', audio: '▶', note: '“', clipping: '“', document: '🔗', screenshot: '▣', photo: '▣' };
function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return null; } }
function titleFromUrl(url) {
  try {
    const u = new URL(url);
    const tail = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/[_-]+/g, ' ').replace(/\.[a-z0-9]{2,5}$/i, '').trim();
    return tail ? `${tail} — ${hostOf(url)}` : hostOf(url);
  } catch (_) { return url; }
}

// --- theory timeline lines --------------------------------------------------
/** "2016-06-01 | what happened | with: Name | ♪ song, ♪ song | "quote" · 14:02" → an entry, or null without a date first. */
export function parseTimelineLine(line) {
  const segs = String(line || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return null;
  const d = segs[0].replace(/\s+/g, '');
  let m, date = null, date_precision = 'unknown', date_year_min = null, date_year_max = null;
  if ((m = d.match(/^(\d{4})[–-](\d{4})$/))) { date_year_min = +m[1]; date_year_max = +m[2]; date_precision = 'range'; }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { date = d; date_precision = 'day'; }
  else if ((m = d.match(/^(\d{4})-(\d{2})$/))) { date = `${d}-01`; date_precision = 'month'; }
  else if ((m = d.match(/^(\d{4})$/))) { date_year_min = date_year_max = +m[1]; date_precision = 'year'; }
  else return null;
  const out = { date, date_precision, date_year_min, date_year_max, title: segs[1], songs: [], partners: [], quote: null, t_ms: null, notes: [] };
  for (const s of segs.slice(2)) {
    if (/^with:/i.test(s)) out.partners.push(...s.replace(/^with:/i, '').split(/,|&|\band\b/i).map((x) => x.trim()).filter(Boolean));
    else if (/^♪/.test(s)) out.songs.push(...s.split('♪').map((x) => x.replace(/^[\s,]+|[\s,]+$/g, '')).filter(Boolean));
    else if (/^["“]/.test(s)) {
      const tm = s.match(/[·\-–]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
      if (tm) { const h = tm[3] ? +tm[1] : 0, mi = tm[3] ? +tm[2] : +tm[1], se = tm[3] ? +tm[3] : +tm[2]; out.t_ms = ((h * 60 + mi) * 60 + se) * 1000; }
      out.quote = s.replace(/[·\-–]\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/, '').trim().replace(/^["“]|["”]$/g, '');
    } else out.notes.push(s);
  }
  return out;
}
function fmtMs(ms) { const s = Math.round(ms / 1000), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60; return (h ? `${h}:${String(mi).padStart(2, '0')}` : String(mi)) + ':' + String(se).padStart(2, '0'); }
function fmtEntryDate(e) {
  if (e.date_precision === 'range' && e.date_year_min) return e.date_year_max && e.date_year_max !== e.date_year_min ? `${e.date_year_min}–${e.date_year_max}` : String(e.date_year_min);
  if (e.date_precision === 'year') return String(e.date_year_min || (e.date || '').slice(0, 4) || '—');
  if (!e.date) return e.date_year_min ? String(e.date_year_min) : '—';
  const dt = new Date(`${e.date}T00:00:00`);
  return e.date_precision === 'month' ? dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function sortKey(e) { return e.date || `${e.date_year_min || 9999}-00-00`; }

export async function render(root, ctx, personId = null) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  const kase = await store.getCase(ctx.caseId);
  const worldLabel = kase?.world ? 'the world' : 'the case';
  let people = [], byId = new Map(); // refreshed by load(): a timeline can add people
  const today = new Date().toISOString().slice(0, 10);
  const phone = window.matchMedia('(max-width: 640px)').matches;
  let filter = localStorage.getItem(FILTER_KEY) || 'all';

  // fresh rows every time something changes — cheap, and every card repaints from truth
  const load = async () => {
    const [rows, events, ppl] = await Promise.all([store.listQuestions(ctx.caseId), store.listEventsForCase(ctx.caseId), store.listPeople(ctx.caseId)]);
    people = ppl;
    byId = new Map(people.map((p) => [p.id, p]));
    const questions = rows.filter((r) => !r.parent_id);
    const theoriesOf = (qid) => rows.filter((r) => r.parent_id === qid);
    const statusOf = (q) => (q.resolved ? 'answered' : theoriesOf(q.id).some((t) => t.pick) ? 'leaning' : 'open');
    return { rows, questions, theoriesOf, statusOf, events };
  };
  let data = await load();

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:8px">
        <div class="row wrap" style="gap:10px;align-items:center">
          <span class="section-label" id="q-counts"></span>
          <div class="seg" id="q-filter">
            ${['all', 'open', 'leaning', 'answered'].map((f) => `<button data-f="${f}" class="${filter === f ? 'active' : ''}">${f === 'all' ? 'All' : f === 'open' ? 'Open' : f === 'leaning' ? '★ Leaning' : 'Answered'}</button>`).join('')}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="q-add">+ Question</button>
      </div>
      <div id="q-add-slot"></div>
      <div id="q-list" class="stack" style="gap:var(--sp-3)"></div>
    </div>
  `;
  const listEl = root.querySelector('#q-list');
  const countsEl = root.querySelector('#q-counts');

  const paintCounts = () => {
    const n = { open: 0, leaning: 0, answered: 0 };
    for (const q of data.questions) n[data.statusOf(q)]++;
    countsEl.textContent = data.questions.length
      ? [`${n.open} open`, n.leaning ? `${n.leaning} leaning` : null, n.answered ? `${n.answered} answered` : null].filter(Boolean).join(' · ')
      : 'No questions yet';
  };

  const aboutHtml = (q) => {
    const p = q.person_id ? byId.get(q.person_id) : null;
    return p
      ? `<a class="about" href="#/subject/${p.id}" title="Open ${esc(p.display_name)}"><span class="mini">${initials(p.display_name)}</span>${esc(p.display_name)}</a>`
      : `<span class="about"><span class="mini">${kase?.world ? '🌍' : '▤'}</span>${worldLabel}</span>`;
  };
  const statusChip = (s, picks) => (s === 'answered' ? '<span class="chip green">answered</span>' : s === 'leaning' ? `<span class="chip brass">★ leaning${picks > 1 ? ` · ${picks}` : ''}</span>` : '<span class="chip">open</span>');

  // --- one question card; every action repaints only this card ---
  async function paintCard(q, existing = null) {
    const theories = data.theoriesOf(q.id);
    const status = data.statusOf(q);
    const picks = theories.filter((t) => t.pick).length;
    const card = document.createElement('div');
    card.className = `q-card ${status}${existing ? (existing.classList.contains('collapsed') ? ' collapsed' : '') : (phone ? ' collapsed' : '')}`;
    card.dataset.id = q.id;
    card.innerHTML = `
      <div class="q-head">
        <div class="q-main">
          <div class="q-title">${esc(q.text)}</div>
          <div class="q-meta">${aboutHtml(q)}${statusChip(status, picks)}<span class="chip">${theories.length} theor${theories.length === 1 ? 'y' : 'ies'}</span></div>
        </div>
        <span class="q-caret">${card.className.includes('collapsed') ? '▸' : '▾'}</span>
      </div>
      <div class="q-body">
        <div class="theories"></div>
        <div id="theory-form-${q.id}"></div>
        <div class="q-foot">
          <button class="btn btn-ghost btn-sm t-add">+ Theory</button>
          ${status === 'answered' ? '<button class="btn btn-ghost btn-sm q-reopen">Reopen</button>' : (theories.length ? '<button class="btn btn-ghost btn-sm q-answer">Mark answered…</button>' : '')}
          <button class="btn btn-ghost btn-sm q-menu" title="Rename · delete">⋯</button>
          <span class="hint">${status === 'answered' ? 'settled by the evidence you chose — the ★ shows which theory won' : '★ is your leaning, never a fact — nothing here reaches a profile or Review'}</span>
        </div>
        <div class="q-menu-slot"></div>
      </div>
    `;
    // declared before the theory rows are painted — they hand it to their timelines
    const repaint = async () => { data = await load(); const fresh = data.questions.find((x) => x.id === q.id); if (!fresh) { card.remove(); paintCounts(); return; } const next = await paintCard(fresh, card); card.replaceWith(next); paintCounts(); };
    const tList = card.querySelector('.theories');
    if (!theories.length) {
      tList.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:2px 2px 6px">No theories yet — add the first, or leave it as a question you are still sitting with.</div>';
    }
    for (const t of theories) tList.appendChild(await paintTheory(q, t));
    card.querySelector('.q-head').addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      card.classList.toggle('collapsed');
      card.querySelector('.q-caret').textContent = card.classList.contains('collapsed') ? '▸' : '▾';
    });
    card.querySelector('.t-add').addEventListener('click', () => {
      const slot = card.querySelector(`#theory-form-${CSS.escape(q.id)}`) || card.querySelector('[id^="theory-form-"]');
      if (slot.querySelector('.inline-form')) return;
      const form = inlineNameForm({
        placeholder: 'The theory, in a sentence',
        submitLabel: 'Add theory',
        onSubmit: async (text) => { await store.createQuestion({ case_id: ctx.caseId, parent_id: q.id, text }); repaint(); },
      });
      slot.appendChild(form);
    });
    card.querySelector('.q-answer')?.addEventListener('click', () => answerFlow(card, q, theories, repaint));
    card.querySelector('.q-reopen')?.addEventListener('click', async () => { await store.updateQuestion(q.id, { resolved: 0, answer_id: null }); repaint(); });
    card.querySelector('.q-menu').addEventListener('click', () => {
      const slot = card.querySelector('.q-menu-slot');
      if (slot.children.length) { slot.innerHTML = ''; return; }
      slot.innerHTML = '<div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn btn-ghost btn-sm m-rename">Rename</button><button class="btn btn-ghost btn-sm m-about">About someone else…</button><button class="btn btn-ghost btn-sm m-delete" style="color:var(--text-3)">Delete question</button></div>';
      slot.querySelector('.m-rename').addEventListener('click', () => {
        slot.innerHTML = '';
        slot.appendChild(inlineNameForm({ value: q.text, submitLabel: 'Save', onSubmit: async (text) => { await store.updateQuestion(q.id, { text }); repaint(); } }));
      });
      slot.querySelector('.m-about').addEventListener('click', () => {
        slot.innerHTML = '';
        slot.appendChild(inlineNameForm({
          value: q.text, submitLabel: 'Save', label: 'About',
          choices: [{ value: '', label: worldLabel }, ...people.map((p) => ({ value: p.id, label: p.display_name }))],
          onSubmit: async (text, pid) => { await store.updateQuestion(q.id, { text, person_id: pid || null }); repaint(); },
        }));
        const sel = slot.querySelector('.if-choice'); if (sel) sel.value = q.person_id || '';
      });
      twoTapConfirm(slot.querySelector('.m-delete'), { confirmLabel: 'Really delete it and its theories?', onConfirm: async () => { await store.deleteQuestion(q.id); repaint(); } });
    });
    return card;

    // --- a theory row ---
    async function paintTheory(q, t) {
      const links = await store.listLinksForTarget('question', t.id);
      const won = q.resolved && q.answer_id === t.id;
      const row = document.createElement('div');
      row.className = `theory${t.pick ? ' pick' : ''}${won ? ' won' : ''}`;
      row.innerHTML = `
        <button class="star" title="${t.pick ? 'My pick — tap to un-pick' : 'Make this one I lean towards'}">${t.pick || won ? '★' : '☆'}</button>
        <div style="min-width:0">
          <div class="t-text">${esc(t.text)}</div>
          ${t.notes ? `<div class="t-why">${esc(t.notes)}</div>` : ''}
          <div class="ev">
            ${links.map((l) => `<span class="chip" data-ev="${l.evidence_id}" title="${esc(l.evidence_title)} · ${l.evidence_type}"><span class="k">${EV_GLYPH[l.evidence_type] || '◆'}</span>${esc(l.evidence_title)}<span class="x" data-unlink="${l.id}" title="Unlink">✕</span></span>`).join('')}
            <button class="linkish t-ev">+ evidence</button>
          </div>
          <div class="t-slot"></div>
          <div class="tl-slot"></div>
        </div>
        <button class="linkish t-menu" title="Why · edit · delete">⋯</button>
      `;
      row.querySelector('.star').addEventListener('click', async () => { await store.updateQuestion(t.id, { pick: t.pick ? 0 : 1 }); repaint(); });
      row.querySelectorAll('[data-ev]').forEach((chip) => chip.addEventListener('click', async (e) => {
        if (e.target.closest('[data-unlink]')) { await store.unlinkEvidence(e.target.closest('[data-unlink]').dataset.unlink); repaint(); return; }
        const ev = await store.getEvidence(chip.dataset.ev);
        ctx.navigate(ev && ev.type === 'video' ? `#/video/${ev.id}` : '#/evidence');
      }));
      row.querySelector('.t-ev').addEventListener('click', () => evidencePicker(row.querySelector('.t-slot'), t, links, repaint));
      row.querySelector('.t-menu').addEventListener('click', () => {
        const slot = row.querySelector('.t-slot');
        if (slot.querySelector('.t-menu-row')) { slot.innerHTML = ''; return; }
        slot.innerHTML = '<div class="row wrap t-menu-row" style="gap:6px;margin-top:6px"><button class="btn btn-ghost btn-sm tm-why">Why it convinces me…</button><button class="btn btn-ghost btn-sm tm-edit">Edit</button><button class="btn btn-ghost btn-sm tm-delete" style="color:var(--text-3)">Delete</button></div>';
        slot.querySelector('.tm-why').addEventListener('click', () => {
          slot.innerHTML = '';
          slot.appendChild(inlineNameForm({ value: t.notes || '', placeholder: 'Why this convinces you — or doesn’t', submitLabel: 'Save', onSubmit: async (notes) => { await store.updateQuestion(t.id, { notes }); repaint(); } }));
        });
        slot.querySelector('.tm-edit').addEventListener('click', () => {
          slot.innerHTML = '';
          slot.appendChild(inlineNameForm({ value: t.text, submitLabel: 'Save', onSubmit: async (text) => { await store.updateQuestion(t.id, { text }); repaint(); } }));
        });
        twoTapConfirm(slot.querySelector('.tm-delete'), { confirmLabel: 'Really delete this theory?', onConfirm: async () => { await store.deleteQuestion(t.id); repaint(); } });
      });
      await paintTimeline(row.querySelector('.tl-slot'), q, t, repaint);
      return row;
    }
  }

  // --- theory timelines (her ask, 2026-09-04: a fan analysis of Taylor Swift's
  // love life, as dated entries with song references). Entries are events with
  // theory_id set — never the record. One line each:
  //   date | what happened | with: Name | ♪ song, ♪ song | "quote" · mm:ss
  // The date keeps its honesty: 2016-06-01 is a day, 2016-06 a month, 2016 a
  // year, 2016–2017 a range. She pastes the transcript to Claude and pastes the
  // lines back here; the transcript itself is saved as evidence on the theory,
  // and a timestamped quote becomes a moment on the theory's video.
  async function paintTimeline(slot, q, t, repaint) {
    const entries = data.events.filter((e) => e.theory_id === t.id).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
    slot.innerHTML = `
      <div class="tl">
        ${entries.length ? '<div class="tl-head"><span class="section-label">Theory timeline · ' + entries.length + '</span><span class="chip violet">theory, not the record</span></div>' : ''}
        <div class="tl-rows"></div>
        <div class="tl-form"></div>
        <div class="tl-foot"><button class="linkish tl-add">+ Entry</button><button class="linkish tl-paste">Paste a timeline…</button>${entries.length ? '<span class="hint">a year is a year, a month a month — no invented days</span>' : ''}</div>
      </div>`;
    const rows = slot.querySelector('.tl-rows');
    for (const e of entries) {
      const withPeople = String(e.with_ids || '').split(',').filter(Boolean).map((id) => byId.get(id)).filter(Boolean);
      const songs = String(e.songs || '').split(' · ').filter(Boolean);
      const links = await store.listLinksForTarget('event', e.id);
      const moment = links.find((l) => l.moment_id);
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.innerHTML = `
        <span class="tl-date">${fmtEntryDate(e)}</span>
        <div style="min-width:0">
          <div class="tl-title">${esc(e.title)}</div>
          ${withPeople.length || songs.length || e.notes ? `<div class="tl-sub">${withPeople.map((p) => `<a class="about" href="#/subject/${p.id}"><span class="mini">${initials(p.display_name)}</span>${esc(p.display_name)}</a>`).join('')}${songs.map((s) => `<span class="song">${esc(s)}</span>`).join('')}${e.notes ? `<span class="quote">${esc(e.notes)}${moment ? ` <a class="linkish" href="#/video/${moment.evidence_id}" title="Open the video at this moment">▶</a>` : ''}</span>` : ''}</div>` : ''}
        </div>
        <button class="linkish tl-del" title="Delete this entry">✕</button>`;
      twoTapConfirm(row.querySelector('.tl-del'), { confirmLabel: 'Really?', onConfirm: async () => { await store.deleteEvent(e.id); repaint(); } });
      rows.appendChild(row);
    }
    slot.querySelector('.tl-add').addEventListener('click', () => {
      const form = slot.querySelector('.tl-form');
      if (form.querySelector('.inline-form, .tl-pastebox')) { form.innerHTML = ''; return; }
      form.appendChild(inlineNameForm({
        placeholder: '2016-06-01 | what happened | with: Name | ♪ song | "a quote" · 14:02',
        submitLabel: 'Add entry',
        onSubmit: async (line) => {
          const p = parseTimelineLine(line);
          if (!p) { inlineNote(form.querySelector('input'), 'Start with a date — 2016-06-01, 2016-06, 2016, or 2016–2017 — then | what happened.'); return; }
          await addEntries(q, t, [p], null);
          repaint();
        },
      }));
    });
    slot.querySelector('.tl-paste').addEventListener('click', () => {
      const form = slot.querySelector('.tl-form');
      if (form.querySelector('.tl-pastebox')) { form.innerHTML = ''; return; }
      form.innerHTML = `
        <div class="tl-pastebox">
          <div class="section-label" style="margin-bottom:4px">Paste a timeline · one entry per line</div>
          <div class="tl-fmt">date | what happened | with: Name | ♪ song, ♪ song | "quote from the analysis" · mm:ss</div>
          <textarea class="tl-lines" placeholder="2016-06-01 | Split from Calvin Harris announced | with: Calvin Harris | ♪ Getaway Car | &quot;I wanted to leave him&quot; · 14:02"></textarea>
          <input type="text" class="tl-source" placeholder="Where it comes from — the video link, or paste the transcript text (optional)" style="width:100%;margin-top:6px;min-height:34px">
          <div class="tl-preview"></div>
          <div class="row wrap" style="gap:8px;margin-top:8px"><button class="btn btn-primary btn-sm tl-go" disabled>Add entries</button><button class="btn btn-ghost btn-sm tl-cancel">Cancel</button></div>
        </div>`;
      const ta = form.querySelector('.tl-lines'), prev = form.querySelector('.tl-preview'), go = form.querySelector('.tl-go');
      const preview = () => {
        const lines = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
        const parsed = lines.map(parseTimelineLine);
        const ok = parsed.filter(Boolean), bad = lines.filter((_, i) => !parsed[i]);
        const songs = ok.reduce((n, p) => n + p.songs.length, 0), quotes = ok.filter((p) => p.t_ms != null).length, names = new Set(ok.flatMap((p) => p.partners)).size;
        prev.innerHTML = lines.length ? `<span style="color:${ok.length ? 'var(--green)' : 'var(--text-3)'}">${ok.length} entr${ok.length === 1 ? 'y' : 'ies'} read</span>${bad.length ? ` · <span style="color:var(--red)">${bad.length} line${bad.length === 1 ? '' : 's'} skipped (no date first)</span>` : ''}${songs ? ` · ${songs} song reference${songs === 1 ? '' : 's'}` : ''}${names ? ` · ${names} ${names === 1 ? 'person' : 'people'} named` : ''}${quotes ? ` · ${quotes} timestamped quote${quotes === 1 ? '' : 's'} → moments on the video` : ''}` : '';
        go.disabled = !ok.length;
        go.textContent = ok.length ? `Add ${ok.length} entr${ok.length === 1 ? 'y' : 'ies'}` : 'Add entries';
        return ok;
      };
      ta.addEventListener('input', preview);
      form.querySelector('.tl-cancel').addEventListener('click', () => { form.innerHTML = ''; });
      go.addEventListener('click', async () => {
        const ok = preview();
        if (!ok.length) return;
        go.disabled = true; go.textContent = 'Adding…';
        await addEntries(q, t, ok, form.querySelector('.tl-source').value.trim() || null);
        repaint();
      });
      queueMicrotask(() => ta.focus());
    });
  }

  // entries → events on the theory; "with:" names → people (found or created) and a
  // theory-only partner link to the question's person; a link or a transcript →
  // evidence on the theory; a timestamped quote → a moment on the theory's video
  async function addEntries(q, t, parsed, source) {
    const links = await store.listLinksForTarget('question', t.id);
    const linked = (await Promise.all(links.map((l) => store.getEvidence(l.evidence_id)))).filter(Boolean);
    let videoEv = linked.find((e) => e.type === 'video') || null;
    if (source) {
      if (/^https?:\/\//i.test(source)) {
        const host = hostOf(source) || 'web';
        let src = (await store.listSources()).find((s) => s.name.toLowerCase() === host.toLowerCase());
        if (!src) src = await store.createSource({ name: host, kind: 'secondary' });
        const isVideo = /youtube\.com|youtu\.be|vimeo\.com|tiktok\.com/i.test(host);
        let ev = (await store.listEvidence(ctx.caseId)).find((e) => e.original_url === source);
        if (!ev) ev = await store.createEvidence({ case_id: ctx.caseId, type: isVideo ? 'video' : 'document', title: titleFromUrl(source), source_id: src.id, original_url: source, verification: 'single', dated: today });
        if (!links.some((l) => l.evidence_id === ev.id)) await store.linkEvidence({ evidence_id: ev.id, target_type: 'question', target_id: t.id, note: 'the analysis this timeline comes from' });
        if (isVideo) videoEv = ev;
      } else {
        const ev = await store.createEvidence({ case_id: ctx.caseId, type: 'note', title: `Transcript — ${t.text.length > 48 ? t.text.slice(0, 45) + '…' : t.text}`, extracted_text: source, verification: 'single', dated: today, notes: 'pasted transcript' });
        await store.linkEvidence({ evidence_id: ev.id, target_type: 'question', target_id: t.id, note: 'the analysis this timeline comes from' });
      }
    }
    const byName = (n) => people.find((p) => p.display_name.trim().toLowerCase() === n.trim().toLowerCase());
    for (const p of parsed) {
      const withIds = [];
      for (const name of p.partners) {
        let person = byName(name);
        if (!person) { person = await store.createPerson({ case_id: ctx.caseId, kind: 'person', display_name: name }); people.push(person); }
        withIds.push(person.id);
        if (q.person_id && person.id !== q.person_id && !store.relationshipExists(ctx.caseId, q.person_id, person.id, 'partner')) {
          await store.upsertRelationship({ case_id: ctx.caseId, a_id: q.person_id, b_id: person.id, kind: 'partner', confidence: 30, confirmed: 0, theory_id: t.id, notes: `theory: ${t.text}` });
        }
      }
      const notes = [p.quote ? `“${p.quote}”${p.t_ms != null ? ` · ${fmtMs(p.t_ms)}` : ''}` : null, ...p.notes].filter(Boolean).join(' · ');
      const eventId = await store.createEvent({
        case_id: ctx.caseId, person_id: q.person_id || null, title: p.title, kind: 'theory',
        date: p.date, date_precision: p.date_precision, date_year_min: p.date_year_min, date_year_max: p.date_year_max,
        notes: notes || null, theory_id: t.id, songs: p.songs.join(' · ') || null, with_ids: withIds.join(',') || null,
      });
      if (p.quote && p.t_ms != null && videoEv) {
        const momentId = await store.createVideoMoment({ evidence_id: videoEv.id, t_ms: p.t_ms, quote: p.quote, label: p.title });
        await store.linkEvidence({ evidence_id: videoEv.id, moment_id: momentId, target_type: 'event', target_id: eventId, note: 'the moment in the analysis' });
      }
    }
  }

  // --- "+ evidence": pick from the case, or paste a link that becomes evidence ---
  async function evidencePicker(slot, theory, links, repaint) {
    if (slot.querySelector('.ev-picker')) { slot.innerHTML = ''; return; }
    const all = (await store.listEvidence(ctx.caseId)).filter((e) => !links.some((l) => l.evidence_id === e.id));
    slot.innerHTML = `
      <div class="ev-picker">
        <div class="row wrap" style="gap:6px">
          <input type="text" class="ev-find" placeholder="Find evidence in this case…" style="flex:1 1 160px;min-width:0;min-height:32px">
          <button class="btn btn-ghost btn-sm ev-close">✕</button>
        </div>
        <div class="ev-list stack" style="gap:2px;margin-top:6px;max-height:200px;overflow:auto"></div>
        <div class="row wrap" style="gap:6px;margin-top:8px">
          <input type="url" class="ev-url" placeholder="…or paste a link — it becomes an evidence item and is attached" style="flex:1 1 200px;min-width:0;min-height:32px">
          <button class="btn btn-ghost btn-sm ev-paste">Attach link</button>
        </div>
      </div>`;
    const listEl = slot.querySelector('.ev-list');
    const paintList = (q = '') => {
      const hits = all.filter((e) => !q || `${e.title} ${e.source_name || ''} ${e.type}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
      listEl.innerHTML = hits.length ? '' : `<div style="font-size:12px;color:var(--text-3);padding:4px">${all.length ? 'No match.' : 'Nothing in this case yet — paste a link below.'}</div>`;
      for (const e of hits) {
        const r = document.createElement('div');
        r.className = 'list-row';
        r.innerHTML = `<div class="main"><div class="title" style="font-size:12px">${esc(e.title)}</div><div class="sub">${e.type}${e.source_name ? ' · ' + esc(e.source_name) : ''}</div></div><span class="chip brass">attach</span>`;
        r.addEventListener('click', async () => { await store.linkEvidence({ evidence_id: e.id, target_type: 'question', target_id: theory.id, note: 'supports this theory' }); repaint(); });
        listEl.appendChild(r);
      }
    };
    paintList();
    slot.querySelector('.ev-find').addEventListener('input', (e) => paintList(e.target.value.trim()));
    slot.querySelector('.ev-close').addEventListener('click', () => { slot.innerHTML = ''; });
    const attachUrl = async () => {
      const input = slot.querySelector('.ev-url');
      const url = input.value.trim();
      clearInlineNote(input);
      if (!/^https?:\/\//i.test(url)) { inlineNote(input, 'Paste a full link, starting with http.'); return; }
      const host = hostOf(url);
      let src = (await store.listSources()).find((s) => s.name.toLowerCase() === host.toLowerCase());
      if (!src) src = await store.createSource({ name: host, kind: 'secondary' });
      const existing = (await store.listEvidence(ctx.caseId)).find((e) => e.original_url === url);
      const ev = existing || await store.createEvidence({ case_id: ctx.caseId, type: 'document', title: titleFromUrl(url), source_id: src.id, original_url: url, verification: 'single', dated: new Date().toISOString().slice(0, 10) });
      await store.linkEvidence({ evidence_id: ev.id, target_type: 'question', target_id: theory.id, note: 'supports this theory' });
      repaint();
    };
    slot.querySelector('.ev-paste').addEventListener('click', attachUrl);
    slot.querySelector('.ev-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); attachUrl(); } });
    queueMicrotask(() => slot.querySelector('.ev-find').focus());
  }

  // --- "Mark answered…": which theory settled it, then which evidence proves it ---
  async function answerFlow(card, q, theories, repaint) {
    const slot = card.querySelector('.q-menu-slot');
    if (slot.querySelector('.answer-flow')) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="answer-flow" style="margin-top:8px"><div class="section-label" style="margin-bottom:6px">Which theory settled it?</div><div class="row wrap" style="gap:6px">${theories.map((t) => `<button class="btn btn-ghost btn-sm" data-t="${t.id}">${esc(t.text.length > 60 ? t.text.slice(0, 57) + '…' : t.text)}</button>`).join('')}<button class="btn btn-ghost btn-sm af-cancel">✕</button></div><div class="af-step2" style="margin-top:8px"></div></div>`;
    slot.querySelector('.af-cancel').addEventListener('click', () => { slot.innerHTML = ''; });
    slot.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', async () => {
      const tid = b.dataset.t;
      const links = await store.listLinksForTarget('question', tid);
      const step2 = slot.querySelector('.af-step2');
      const finish = async (evidenceId) => {
        await store.updateQuestion(q.id, { resolved: 1, answer_id: tid });
        if (evidenceId) await store.linkEvidence({ evidence_id: evidenceId, target_type: 'question', target_id: q.id, note: 'settled it' });
        repaint();
      };
      if (!links.length) { await finish(null); return; }
      step2.innerHTML = `<div class="section-label" style="margin-bottom:6px">And which evidence proves it?</div><div class="row wrap" style="gap:6px">${links.map((l) => `<button class="btn btn-ghost btn-sm" data-e="${l.evidence_id}"><span class="k" style="color:var(--text-3);margin-right:4px">${EV_GLYPH[l.evidence_type] || '◆'}</span>${esc(l.evidence_title)}</button>`).join('')}<button class="btn btn-ghost btn-sm af-none">No single piece — just mark it</button></div>`;
      step2.querySelectorAll('[data-e]').forEach((eb) => eb.addEventListener('click', () => finish(eb.dataset.e)));
      step2.querySelector('.af-none').addEventListener('click', () => finish(null));
    }));
  }

  // --- the list, the filter, "+ Question" ---
  const paintList = async () => {
    listEl.innerHTML = '';
    const shown = data.questions.filter((q) => filter === 'all' || data.statusOf(q) === filter);
    if (!data.questions.length) {
      listEl.appendChild(emptyState({ missing: 'No questions yet.', why: `A question is anything you want to work out — about ${worldLabel}, or about a person. Its theories and their evidence live under it.`, action: '+ Question', onAction: () => root.querySelector('#q-add').click() }));
    } else if (!shown.length) {
      listEl.appendChild(emptyState({ missing: `Nothing ${filter} right now.`, why: 'Switch the filter to see the rest.' }));
    }
    for (const q of shown) listEl.appendChild(await paintCard(q));
    paintCounts();
  };
  root.querySelectorAll('#q-filter button').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    localStorage.setItem(FILTER_KEY, filter);
    root.querySelectorAll('#q-filter button').forEach((x) => x.classList.toggle('active', x === b));
    paintList();
  }));
  root.querySelector('#q-add').addEventListener('click', () => {
    const slot = root.querySelector('#q-add-slot');
    if (slot.querySelector('.inline-form')) return;
    const form = inlineNameForm({
      placeholder: 'What do you want to work out?',
      submitLabel: 'Ask',
      label: 'About',
      choices: [{ value: '', label: worldLabel }, ...people.map((p) => ({ value: p.id, label: p.display_name }))],
      onSubmit: async (text, pid) => {
        await store.createQuestion({ case_id: ctx.caseId, text, person_id: pid || null });
        slot.innerHTML = '';
        data = await load();
        await paintList();
      },
    });
    slot.appendChild(form);
    if (personId) { const sel = form.querySelector('.if-choice'); if (sel) sel.value = personId; }
  });
  await paintList();
}
