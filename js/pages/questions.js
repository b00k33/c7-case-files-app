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

export async function render(root, ctx, personId = null) {
  const { store } = ctx;
  if (!ctx.caseId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No case open.', why: 'Pick a case from the Cases page first.', action: 'Go to Cases', onAction: () => ctx.navigate('#/cases') }));
    return;
  }
  const [kase, people] = await Promise.all([store.getCase(ctx.caseId), store.listPeople(ctx.caseId)]);
  const worldLabel = kase?.world ? 'the world' : 'the case';
  const byId = new Map(people.map((p) => [p.id, p]));
  const phone = window.matchMedia('(max-width: 640px)').matches;
  let filter = localStorage.getItem(FILTER_KEY) || 'all';

  // fresh rows every time something changes — cheap, and every card repaints from truth
  const load = async () => {
    const rows = await store.listQuestions(ctx.caseId);
    const questions = rows.filter((r) => !r.parent_id);
    const theoriesOf = (qid) => rows.filter((r) => r.parent_id === qid);
    const statusOf = (q) => (q.resolved ? 'answered' : theoriesOf(q.id).some((t) => t.pick) ? 'leaning' : 'open');
    return { rows, questions, theoriesOf, statusOf };
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
    const tList = card.querySelector('.theories');
    if (!theories.length) {
      tList.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:2px 2px 6px">No theories yet — add the first, or leave it as a question you are still sitting with.</div>';
    }
    for (const t of theories) tList.appendChild(await paintTheory(q, t));

    const repaint = async () => { data = await load(); const fresh = data.questions.find((x) => x.id === q.id); if (!fresh) { card.remove(); paintCounts(); return; } const next = await paintCard(fresh, card); card.replaceWith(next); paintCounts(); };
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
      return row;
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
