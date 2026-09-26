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
          <button type="button" class="btn btn-primary btn-sm" id="add-milestone-btn">+ Milestone</button>
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
