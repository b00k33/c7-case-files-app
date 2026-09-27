// Their Story (her ask, 2026-09-15: "i want to create boards and timelines
// of relationships like camilla and charles, when they met, etc etc
// milestones of relationship plus photos and evidence") — a dedicated page
// for one relationship (her pick, "A: a page just for them"), reached from
// the Tree's marriage-year marker and from a spouse card on either
// person's own profile. Not woven into either person's own life line: the
// couple's story lives once, in one place, not scattered across two posters.
import { verdictChips, buildRelationshipLine, renderRelationshipLine, REL_KINDS } from '../lifemap.js';
import { resolveAssetUrl, preloadImage, compressImage, queueUpload, flushUploads } from '../assets.js';
import { parseDate } from '../profile-parse.js';
import { inlineNote, clearInlineNote } from '../ui.js';
import { emptyState } from '../indicators.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const initials = (name) => String(name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const firstName = (name) => String(name || '').split(/\s+/)[0];

function relLabel(rel) {
  const sy = rel.start_date ? rel.start_date.slice(0, 4) : null;
  const ey = rel.end_date ? rel.end_date.slice(0, 4) : null;
  if (rel.kind === 'spouse') {
    if (ey) return `Married ${sy || ''}${sy ? ' · ' : ''}separated ${ey}`;
    if (sy) return `Married ${sy}`;
    return 'Spouse';
  }
  // a non-marital relationship (her ask, 2026-09-26: "who she dated, when
  // it ended") — capitalised, not the raw kind string, and no "married"
  // wording it never earned
  if (rel.kind === 'partner') {
    if (ey) return `Together ${sy || ''}${sy ? ' · ' : ''}ended ${ey}`;
    if (sy) return `Together from ${sy}`;
    return 'Partner';
  }
  return rel.kind;
}

export async function render(root, ctx, relationshipId) {
  const { store } = ctx;
  if (!relationshipId) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'No relationship chosen.', why: 'Open Their Story from a spouse card, or from the tree.' }));
    return;
  }
  const rel = await store.getRelationship(relationshipId);
  if (!rel) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'This relationship could not be found.', why: 'It may have been removed from the tree.' }));
    return;
  }
  const [a, b, events] = await Promise.all([
    store.getPerson(rel.a_id), store.getPerson(rel.b_id), store.listEventsForRelationship(rel.id),
  ]);
  if (!a || !b) {
    root.innerHTML = '';
    root.appendChild(emptyState({ missing: 'One of the two people is missing.', why: 'They may have been deleted from this case.' }));
    return;
  }
  if (rel.case_id !== ctx.caseId) await ctx.setCaseId(rel.case_id);
  ctx.setTitle(`${firstName(a.display_name)} & ${firstName(b.display_name)}`);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <a class="btn btn-ghost btn-sm" href="#/subject/${a.id}/relations" style="text-decoration:none;align-self:flex-start">← Tree</a>
        <div class="rel-pair-head">
          <div class="rel-pair-pics">
            <div class="avatar rel-pair-avatar" id="a-avatar"><span class="initials">${initials(a.display_name)}</span></div>
            <div class="avatar rel-pair-avatar b" id="b-avatar"><span class="initials">${initials(b.display_name)}</span></div>
          </div>
          <div class="rel-pair-names">
            <div class="title">${esc(a.display_name)} &amp; ${esc(b.display_name)}</div>
            <div class="mono rel-pair-sub">${esc(relLabel(rel))}</div>
          </div>
        </div>
        <div class="lm-verdicts" id="rel-verdicts" style="justify-content:center;margin-top:var(--sp-3)"></div>
      </div>

      <div class="panel">
        <div class="row between wrap" style="gap:8px">
          <span class="section-label">Their story · tap a mark</span>
          <div class="row" style="gap:8px">
            <button type="button" class="btn btn-ghost btn-sm" id="add-milestones-batch-btn" title="Paste a whole timeline at once — one milestone per line">Paste many</button>
            <button type="button" class="btn btn-primary btn-sm" id="add-milestone-btn">+ Milestone</button>
          </div>
        </div>
        <div id="rel-line"></div>
        <div id="rel-why"></div>
      </div>
    </div>
  `;

  root.querySelector('#rel-verdicts').append(...verdictChips(a, b));
  const showPhoto = (hostSel, p) => {
    const src = p.photo_path ? resolveAssetUrl(p.photo_path, 'image/jpeg') : Promise.resolve(p.photo_url);
    src.then(async (u) => {
      if (!u || !(await preloadImage(u))) return;
      const host = root.querySelector(hostSel);
      const img = document.createElement('img');
      img.alt = ''; img.src = u;
      img.addEventListener('load', () => host.querySelector('.initials')?.remove());
      host.prepend(img);
    });
  };
  showPhoto('#a-avatar', a);
  showPhoto('#b-avatar', b);

  const lineEl = root.querySelector('#rel-line');
  const whyEl = root.querySelector('#rel-why');
  const redraw = () => render(root, ctx, relationshipId);

  const openAdd = () => ctx.openDrawer((body) => renderMilestoneForm(body, ctx, rel, null, () => { ctx.closeDrawer(); redraw(); }));
  root.querySelector('#add-milestone-btn').addEventListener('click', openAdd);
  root.querySelector('#add-milestones-batch-btn').addEventListener('click', () => ctx.openDrawer((body) => renderMilestoneBatchForm(body, ctx, rel, () => { ctx.closeDrawer(); redraw(); })));

  const showDetail = (m) => renderMilestoneDetail(whyEl, m, {
    onEdit: () => ctx.openDrawer((body) => renderMilestoneForm(body, ctx, rel, m.event, () => { ctx.closeDrawer(); redraw(); })),
    onDelete: async () => { await store.deleteEvent(m.event.id); redraw(); },
    onEditYear: () => ctx.openDrawer((body) => renderEditYear(body, ctx, rel, m.kind, () => { ctx.closeDrawer(); redraw(); })),
  });
  const data = buildRelationshipLine({ relationship: rel, events });
  await renderRelationshipLine(lineEl, data, { onPick: showDetail, onAdd: openAdd });
}

function fmtWhenLoose(m) {
  if (m.precision === 'day' && m.date) return new Date(`${String(m.date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (m.precision === 'month' && m.date) return new Date(`${String(m.date).slice(0, 7)}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return String(m.year);
}

function renderMilestoneDetail(el, m, { onEdit, onDelete, onEditYear }) {
  el.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'lm-why';
  if (!m.event) {
    // synthesized straight from the relationship's own start/end date — the
    // same field the tree's "m. 2005" marker reads; editing it here edits that
    card.innerHTML = `
      <span class="k">what</span>
      <span class="line"><b>${m.glyph} ${esc(m.title)}</b><span class="mono dim">${m.year}</span></span>
      <span class="k">note</span>
      <span class="line dim">From the couple's own record on the tree — add a milestone here for the real story, with its own date and evidence.</span>
      <span class="k"></span>
      <span class="line"><button type="button" class="btn btn-ghost btn-sm" id="ms-edit-year-btn">Edit the year →</button></span>
    `;
    el.appendChild(card);
    el.querySelector('#ms-edit-year-btn').addEventListener('click', onEditYear);
    return;
  }
  card.innerHTML = `
    <span class="k">what</span>
    <span class="line"><b>${m.glyph} ${esc(m.title)}</b><span class="mono dim">${fmtWhenLoose(m)}</span></span>
    ${m.event.place ? `<span class="k">where</span><span class="line">${esc(m.event.place)}</span>` : ''}
    ${m.event.notes ? `<span class="k">notes</span><span class="line">${esc(m.event.notes)}</span>` : ''}
    ${m._pic ? '<span class="k"></span><span class="line" id="ms-pic-slot"></span>' : ''}
    <span class="k"></span>
    <span class="line"><button type="button" class="btn btn-ghost btn-sm" id="ms-edit-btn">Edit</button><button type="button" class="btn btn-ghost btn-sm" id="ms-del-btn">Delete</button></span>
  `;
  el.appendChild(card);
  if (m._pic) {
    const slot = card.querySelector('#ms-pic-slot');
    const img = document.createElement('img');
    img.src = m._pic.src; img.alt = '';
    img.style.cssText = 'max-width:220px;border-radius:var(--r-md);display:block';
    slot.appendChild(img);
  }
  card.querySelector('#ms-edit-btn').addEventListener('click', onEdit);
  card.querySelector('#ms-del-btn').addEventListener('click', onDelete);
}

// the synthesized "Married"/"Separated" mark has no event of its own — this
// is the tree's own year editor, reached from the story page too, so
// there's only ever one place that field is edited from
function renderEditYear(body, ctx, rel, kind, onDone) {
  const field = kind === 'separated' ? 'end_date' : 'start_date';
  const current = rel[field] ? rel[field].slice(0, 4) : '';
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:16px">${kind === 'separated' ? 'Year separated' : 'Year married'}</h3>
    <div class="field"><input type="number" id="ey-year" value="${current}" placeholder="2005" style="max-width:120px"></div>
    <div class="row" style="gap:8px">
      <button class="btn btn-primary" id="ey-save">Save</button>
      ${current ? '<button class="btn btn-ghost" id="ey-clear">Clear</button>' : ''}
    </div>
  `;
  body.querySelector('#ey-save').addEventListener('click', async () => {
    const btn = body.querySelector('#ey-save');
    const raw = body.querySelector('#ey-year').value.trim();
    const y = parseInt(raw, 10);
    if (!raw || !Number.isInteger(y) || y < 1000 || y > 3000) { inlineNote(btn, 'Enter a year, like 2005.'); return; }
    await ctx.store.upsertRelationship({ id: rel.id, [field]: `${y}-01-01` });
    onDone();
  });
  body.querySelector('#ey-clear')?.addEventListener('click', async () => {
    await ctx.store.upsertRelationship({ id: rel.id, [field]: null });
    onDone();
  });
}

function renderMilestoneForm(body, ctx, rel, existingEvent, onDone) {
  const isEdit = !!existingEvent;
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:12px">${isEdit ? 'Edit milestone' : 'Add a milestone'}</h3>
    <div class="field"><label>What happened</label><input type="text" id="ms-title" value="${esc(existingEvent?.title || '')}" placeholder="Met at a mutual friend's dinner party"></div>
    <div class="row wrap" style="gap:8px">
      <div class="field" style="flex:1 1 140px"><label>Kind</label><select id="ms-kind">${REL_KINDS.map(([k, l]) => `<option value="${k}" ${existingEvent?.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field" style="flex:1 1 160px"><label>When</label><input type="text" id="ms-date" value="${esc(existingEvent?.date || (existingEvent?.date_year_min ?? ''))}" placeholder="14 Nov 1996 · Nov 1996 · 1996"></div>
    </div>
    <div class="field"><label>Where</label><input type="text" id="ms-place" value="${esc(existingEvent?.place || '')}" placeholder="optional"></div>
    <div class="field"><label>Notes / evidence — a note, or where this comes from</label><textarea id="ms-notes" placeholder="optional" style="min-height:64px">${esc(existingEvent?.notes || '')}</textarea></div>
    <div class="field">
      <label>Photo</label>
      <div class="row" style="gap:8px;align-items:center">
        <div class="avatar" id="ms-photo-preview" style="width:56px;height:56px;border-radius:var(--r-md)"><span class="initials" style="font-size:18px">+</span></div>
        <input type="file" id="ms-photo-input" accept="image/*" hidden>
        <button type="button" class="btn btn-ghost btn-sm" id="ms-photo-btn">${existingEvent?.photo_path || existingEvent?.photo_url ? 'Change photo' : 'Add a photo'}</button>
      </div>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn btn-primary" id="ms-save">${isEdit ? 'Save' : 'Add'}</button>
      ${isEdit ? '<button class="btn btn-ghost" id="ms-delete">Delete</button>' : ''}
    </div>
  `;

  let pendingPhotoFile = null;
  const preview = body.querySelector('#ms-photo-preview');
  (async () => {
    if (!existingEvent) return;
    const src = existingEvent.photo_path ? await resolveAssetUrl(existingEvent.photo_path, 'image/jpeg') : existingEvent.photo_url;
    if (!src) return;
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    img.addEventListener('load', () => preview.querySelector('.initials')?.remove());
    preview.appendChild(img);
  })();
  body.querySelector('#ms-photo-btn').addEventListener('click', () => body.querySelector('#ms-photo-input').click());
  body.querySelector('#ms-photo-input').addEventListener('change', () => {
    const f = body.querySelector('#ms-photo-input').files[0];
    if (!f) return;
    pendingPhotoFile = f;
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.alt = ''; img.src = URL.createObjectURL(f);
    preview.appendChild(img);
  });

  body.querySelector('#ms-title').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); body.querySelector('#ms-date').focus(); } });
  body.querySelector('#ms-date').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); body.querySelector('#ms-save').click(); } });

  body.querySelector('#ms-save').addEventListener('click', async () => {
    const btn = body.querySelector('#ms-save');
    clearInlineNote(btn);
    const title = body.querySelector('#ms-title').value.trim();
    const kind = body.querySelector('#ms-kind').value;
    const dateText = body.querySelector('#ms-date').value.trim();
    const place = body.querySelector('#ms-place').value.trim();
    const notes = body.querySelector('#ms-notes').value.trim();
    if (!title) { inlineNote(btn, 'Say what happened first.'); return; }
    const d = dateText ? parseDate(dateText) : null;
    if (dateText && !d) { inlineNote(btn, 'That date didn’t read — try "14 Nov 1996", "Nov 1996" or "1996".'); return; }
    const patch = {
      title, kind, place: place || null, notes: notes || null,
      date: d ? d.date : null, date_precision: d ? d.precision : 'unknown',
      date_year_min: d ? d.year : null, date_year_max: d ? d.year : null,
    };
    let eventId;
    if (isEdit) { await ctx.store.updateEvent(existingEvent.id, patch); eventId = existingEvent.id; }
    else { eventId = await ctx.store.createEvent({ case_id: rel.case_id, relationship_id: rel.id, ...patch }); }
    if (pendingPhotoFile) {
      const meta = await ctx.store.storeEvidenceFile(await compressImage(pendingPhotoFile));
      await ctx.store.updateEvent(eventId, { photo_path: meta.file_path, photo_url: null });
      queueUpload(meta.file_path, meta.mime);
      flushUploads();
    }
    onDone();
  });
  body.querySelector('#ms-delete')?.addEventListener('click', async () => {
    await ctx.store.deleteEvent(existingEvent.id);
    onDone();
  });
}

// a pre-fill for the row's own Kind dropdown below — never saved without
// her seeing and being able to change it, same safety net as the
// Wikipedia batch-add's per-row review (js/pages/relations.js). Checked in
// order, most specific/least ambiguous first: "dating" is checked before
// "separated" specifically because a real sentence like "the couple begins
// dating after Depp separates from Vanessa Paradis" mentions someone
// ELSE'S separation — matching "separat" first would mislabel the very
// milestone that starts the relationship as its ending.
const KIND_GUESS = [
  [/reunite/i, 'reunited'],
  [/marr(?:y|ies|ied|iage)/i, 'married'],
  [/engag/i, 'engaged'],
  [/\b(?:begins?|starts?|started)?\s*dating\b/i, 'dating'],
  [/divorce|separat|restraining|split up|broke up/i, 'separated'],
  [/\bmeets?\b|\bmet\b/i, 'met'],
];
function guessMilestoneKind(text) {
  for (const [re, kind] of KIND_GUESS) if (re.test(text)) return kind;
  return 'other';
}

const REL_LABEL = Object.fromEntries(REL_KINDS.map(([k, l]) => [k, l]));
const PRECISION_RANK = { unknown: 0, year: 1, month: 2, day: 3 };
// met/dating/engaged/married ordinarily happen once in a couple's story, so
// a second paste describing one is almost always a date correction on the
// SAME event, not a genuine second occurrence — matched on kind alone.
// separated/reunited/other can legitimately repeat (a couple can break up
// and get back together more than once), so those only match a specific
// year, never a bare kind.
const SINGLE_KINDS = new Set(['met', 'dating', 'engaged', 'married']);

/** Her ask, 2026-09-27: "when i paste info that is duplicate, update the
 * missing info. dont add it as new" — found live from running "Paste many"
 * twice on two versions of the same timeline, which created near-duplicate
 * cards (same real event, different wording/date precision). Never merges
 * silently: this only proposes a target, which she sees and can uncheck
 * per row before anything saves (paintRows below). */
function findMergeTarget(existing, row) {
  const sameKind = existing.filter((e) => e.kind === row.kind);
  if (!sameKind.length) return null;
  if (SINGLE_KINDS.has(row.kind)) return sameKind[0];
  const d = row.when.trim() ? parseDate(row.when.trim()) : null;
  const year = d ? d.year : null;
  if (!year) return null;
  return sameKind.find((e) => e.date_year_min === year || e.date_year_max === year) || null;
}

function mergeTargetLabel(e) {
  return `${e.title || REL_LABEL[e.kind]}${e.date_year_min ? ` (${e.date_year_min})` : ''}`;
}

/** Only ever fills a gap or upgrades a vague date to a precise one — never
 * overwrites a title she's already written herself, never downgrades a
 * date that's already precise. An empty patch means the paste added
 * nothing this milestone didn't already have.
 *
 * One exception: when the existing title is still the bare, never-edited
 * kind label ("Met", "Married"…), its year is just as much a placeholder
 * as its title — found live, 2026-09-27, on her own "Met, 2011" vs. a
 * pasted "They meet on the set of…, 2009" for the same real event. There
 * a same-precision year is allowed to replace the guess, but a date she
 * (or an earlier paste) actually wrote a real title for is never touched
 * at equal precision — only a genuine upgrade in precision moves it. */
function buildMergePatch(existing, row) {
  const patch = {};
  const newTitle = row.title.trim();
  const bareTitle = REL_LABEL[existing.kind];
  const existingTitle = (existing.title || '').trim();
  const isPlaceholder = !existingTitle || existingTitle === bareTitle;
  if (newTitle && newTitle !== existingTitle && isPlaceholder) patch.title = newTitle;
  const d = row.when.trim() ? parseDate(row.when.trim()) : null;
  const existingRank = PRECISION_RANK[existing.date_precision] || 0;
  const newRank = d ? PRECISION_RANK[d.precision] : 0;
  const samePrecisionCorrection = isPlaceholder && newRank === existingRank && newRank > 0 && d.year !== existing.date_year_min;
  if (d && (newRank > existingRank || samePrecisionCorrection)) {
    patch.date = d.date;
    patch.date_precision = d.precision;
    patch.date_year_min = d.year;
    patch.date_year_max = d.year;
  }
  return patch;
}

/**
 * "Paste many" (her ask, 2026-09-27: a 7-line dated timeline copied from a
 * Wikipedia-style summary of the whole relationship). One milestone at a
 * time through the form above is a full drawer round trip per line for
 * exactly the sort of clean, dated, one-per-line list she already has in
 * hand. Parses each line into an editable row — title, kind, when — and
 * nothing saves until "Add N milestones": the same parse-then-review shape
 * as the Wikipedia lookup batch, because a keyword guess at "kind" is
 * exactly the kind of guess this app never commits without her seeing it
 * first.
 */
function renderMilestoneBatchForm(body, ctx, rel, onDone) {
  body.innerHTML = `
    <h3 class="title" style="margin-bottom:4px">Paste a timeline</h3>
    <p style="font-size:12px;color:var(--text-3);margin:0 0 12px">One milestone per line — a leading bullet is fine either way. "2009: they meet on set", "* 2015: they marry in a private ceremony".</p>
    <div class="field"><textarea id="mb-text" style="min-height:140px" placeholder="2009: They meet on the set of a film.
2015: They marry in a private ceremony.
2016: She files for divorce."></textarea></div>
    <div class="row wrap" style="gap:12px"><button class="btn btn-primary" id="mb-parse">Parse</button><span style="font-size:11px;color:var(--text-3)">Nothing is saved yet — you check each row first.</span></div>
    <div id="mb-rows" style="margin-top:16px"></div>
  `;
  const textarea = body.querySelector('#mb-text');
  queueMicrotask(() => textarea.focus());

  // "* 2016: Heard files for divorce…" / "2009: They meet…" — the FIRST
  // colon or dash splits "when" from "what happened"; text with no
  // separator at all (rare) is treated as pure title, no date
  const LINE_RE = /^[\s*•-]*(.+?)\s*[:—–-]\s*(.+)$/;
  const parseLine = (raw) => {
    const line = raw.trim();
    if (!line) return null;
    const m = line.match(LINE_RE);
    const whenText = (m ? m[1] : '').trim();
    const title = (m ? m[2] : line).trim();
    const d = whenText ? parseDate(whenText) : null;
    return { title, kind: guessMilestoneKind(title), when: whenText, unparsedWhen: !!whenText && !d };
  };

  // pasting a bulleted list copied from somewhere rendered (a chat bubble,
  // a doc, a note app) can drop the real newlines between items entirely
  // while every "*"/"•" marker survives (found live, 2026-09-27: her own
  // 7-line paste arrived as one meshed-together block) — split on real
  // newlines first, then split any surviving line that still has more than
  // one bullet marker in it on those markers too, so both a clean paste
  // and a meshed one produce the same rows
  const splitLines = (raw) => raw
    .split(/\n+/)
    .flatMap((l) => (/[*•]/.test(l) ? l.split(/[*•]+/) : [l]))
    .map((l) => l.trim())
    .filter(Boolean);

  let existingEvents = [];
  body.querySelector('#mb-parse').addEventListener('click', async () => {
    const parseBtn = body.querySelector('#mb-parse');
    clearInlineNote(parseBtn);
    const lines = splitLines(textarea.value);
    if (!lines.length) { inlineNote(parseBtn, 'Paste at least one line first.'); return; }
    existingEvents = await ctx.store.listEventsForRelationship(rel.id);
    const rows = lines.map(parseLine).filter(Boolean);
    rows.forEach((r) => { r.mergeTarget = findMergeTarget(existingEvents, r); r.mergeMode = r.mergeTarget ? 'update' : 'new'; });
    paintRows(rows);
  });

  const paintRows = (rows) => {
    const rowsSlot = body.querySelector('#mb-rows');
    const addedCount = rows.filter((r) => r.mergeMode !== 'update' || !r.mergeTarget).length;
    const updatedCount = rows.length - addedCount;
    rowsSlot.innerHTML = `
      <div class="field"><label>${rows.length} milestone${rows.length === 1 ? '' : 's'} found — check each one</label></div>
      ${rows.map((r, i) => `
        <div class="wk-match" style="margin-bottom:10px">
          <input type="text" data-title="${i}" value="${esc(r.title)}" style="width:100%;margin-bottom:6px" placeholder="What happened">
          <div class="row wrap" style="gap:8px">
            <select data-kind="${i}" style="flex:1 1 130px">${REL_KINDS.map(([k, l]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input type="text" data-when="${i}" value="${esc(r.when)}" style="flex:1 1 140px" placeholder="1996 · Nov 1996 · 14 Nov 1996">
          </div>
          ${r.unparsedWhen ? `<div style="font-size:11px;color:var(--text-3);margin-top:4px">"${esc(r.when)}" didn't read as a date — fix it or it saves with no date.</div>` : ''}
          ${r.mergeTarget ? `<label style="display:flex;gap:6px;align-items:flex-start;font-size:11px;color:var(--text-3);margin-top:6px"><input type="checkbox" data-merge="${i}" ${r.mergeMode === 'update' ? 'checked' : ''} style="margin-top:2px">Same as "<strong>${esc(mergeTargetLabel(r.mergeTarget))}</strong>", already on the timeline — update it instead of adding new</label>` : ''}
        </div>`).join('')}
      <div class="row wrap" style="gap:12px;margin-top:8px"><button class="btn btn-primary" id="mb-add">${updatedCount ? `Add ${addedCount}, update ${updatedCount}` : `Add ${addedCount} milestone${addedCount === 1 ? '' : 's'}`}</button></div>
      <div id="mb-progress"></div>
    `;
    rowsSlot.querySelectorAll('[data-title]').forEach((el) => el.addEventListener('input', () => { rows[+el.dataset.title].title = el.value; }));
    rowsSlot.querySelectorAll('[data-kind]').forEach((el) => el.addEventListener('change', () => {
      const r = rows[+el.dataset.kind];
      r.kind = el.value;
      r.mergeTarget = findMergeTarget(existingEvents, r);
      r.mergeMode = r.mergeTarget ? 'update' : 'new';
      paintRows(rows);
    }));
    rowsSlot.querySelectorAll('[data-when]').forEach((el) => el.addEventListener('input', () => { rows[+el.dataset.when].when = el.value; }));
    rowsSlot.querySelectorAll('[data-merge]').forEach((el) => el.addEventListener('change', () => { rows[+el.dataset.merge].mergeMode = el.checked ? 'update' : 'new'; }));
    rowsSlot.querySelector('#mb-add').addEventListener('click', async () => {
      const addBtn = rowsSlot.querySelector('#mb-add');
      addBtn.disabled = true; addBtn.textContent = 'Saving…';
      let added = 0, updated = 0;
      for (const r of rows) {
        if (!r.title.trim()) continue;
        if (r.mergeMode === 'update' && r.mergeTarget) {
          const patch = buildMergePatch(r.mergeTarget, r);
          if (Object.keys(patch).length) await ctx.store.updateEvent(r.mergeTarget.id, patch);
          updated += 1;
          continue;
        }
        const d = r.when.trim() ? parseDate(r.when.trim()) : null;
        await ctx.store.createEvent({
          case_id: rel.case_id, relationship_id: rel.id, title: r.title.trim(), kind: r.kind,
          date: d ? d.date : null, date_precision: d ? d.precision : 'unknown',
          date_year_min: d ? d.year : null, date_year_max: d ? d.year : null,
        });
        added += 1;
      }
      const msg = updated ? `${added} added, ${updated} updated.` : `${added} milestone${added === 1 ? '' : 's'} added.`;
      rowsSlot.querySelector('#mb-progress').innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">${msg}</div>`;
      onDone();
    });
  };
}
