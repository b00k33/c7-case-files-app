// The Commercial tab (her ask, 2026-09-05): map the timing of a musician's
// commercial/financial success — chart positions, certifications, awards,
// deals/tours/endorsements — against their release history. Dated facts
// only, no numeric value field (her call: most of this isn't reliably
// numeric anyway). Milestones are plain `event` rows (kind = one of
// MILESTONE_KINDS) so they already show on the Board and the profile
// timeline for free; sourcing reuses the app's existing evidence/
// verification system rather than inventing a new confidence model.
import { emptyState, verificationConfidence, confidenceBand, verificationLabel } from '../indicators.js';
import { parseMilestoneText } from '../milestone-parse.js';
import { MILESTONE_KINDS, MILESTONE_KIND_LABEL } from '../milestone-kinds.js';
import { twoTapConfirm, clearInlineNote, inlineNote } from '../ui.js';

const VERIFICATIONS = ['single', 'two_plus', 'disputed', 'dead_link', 'drafted'];

let lastResult = null; // shown once, on the next render of this tab

function fmtDate(e) {
  if (e.date_precision === 'day' && e.date) return new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (e.date_precision === 'month' && e.date) return new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  if (e.date_year_min) return e.date_year_max && e.date_year_max !== e.date_year_min ? `${e.date_year_min}-${e.date_year_max}` : String(e.date_year_min);
  return e.date || '—';
}

function dot(confidence) {
  const band = confidenceBand(confidence);
  return `<span class="conf-dot ${band}" title="Confidence: ${confidence}"></span>`;
}

export async function render(root, ctx, personId) {
  const { store } = ctx;
  const person = await store.getPerson(personId);
  if (!person) { root.innerHTML = ''; root.appendChild(emptyState({ missing: 'This person could not be found.' })); return; }

  const events = await store.listEventsForPerson(personId);
  const releases = events.filter((e) => e.kind === 'release').sort((a, b) => (a.date || `${a.date_year_min}`) < (b.date || `${b.date_year_min}`) ? -1 : 1);
  const milestones = events.filter((e) => MILESTONE_KINDS.includes(e.kind));
  const withConf = await Promise.all(milestones.map(async (e) => {
    const links = await store.listLinksForTarget('event', e.id);
    const confidence = links.length ? Math.max(...links.map((l) => verificationConfidence(l.evidence_verification))) : 0;
    return { ...e, confidence };
  }));
  withConf.sort((a, b) => (a.date || `${a.date_year_min}` || '9999') < (b.date || `${b.date_year_min}` || '9999') ? -1 : 1);

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="row between">
          <div class="panel-title" style="margin:0">Releases</div>
        </div>
        <div class="chip-row" id="release-row" style="margin-top:8px"></div>
      </div>

      <div class="panel">
        <div class="row between">
          <div class="panel-title" style="margin:0">Commercial milestones</div>
          <div class="row" style="gap:8px">
            <a class="btn btn-ghost btn-sm" href="#/compare">Compare artists →</a>
            <button class="btn btn-primary btn-sm" id="cm-add-btn">+ Add milestones</button>
          </div>
        </div>
        <div id="cm-add-slot"></div>
        <div id="cm-result"></div>
        <div id="cm-groups" class="stack" style="margin-top:12px;gap:16px"></div>
      </div>
    </div>
  `;

  if (lastResult) {
    const note = document.createElement('div');
    note.className = 'inline-note';
    note.style.borderLeftColor = 'var(--green)';
    note.textContent = lastResult;
    root.querySelector('#cm-result').appendChild(note);
    lastResult = null;
  }

  // ---- releases, read-only context row ----
  const releaseRow = root.querySelector('#release-row');
  if (!releases.length) {
    releaseRow.appendChild(emptyState({ missing: 'No releases on file yet.', why: 'Pull them from Wikidata with + Works on the Profile tab.', action: 'Go to Profile', onAction: () => ctx.navigate(`#/subject/${person.id}`) }));
  } else {
    for (const r of releases) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.title = r.title;
      chip.textContent = `${fmtDate(r)} · ${r.title}`;
      releaseRow.appendChild(chip);
    }
  }

  // ---- milestone groups, one per kind, in fixed order ----
  const groupsEl = root.querySelector('#cm-groups');
  if (!withConf.length) {
    groupsEl.appendChild(emptyState({ missing: 'No commercial milestones logged yet.', why: 'Paste in a chart position, certification, award or deal below — the date is all it needs.' }));
  } else {
    for (const kind of MILESTONE_KINDS) {
      const items = withConf.filter((e) => e.kind === kind);
      if (!items.length) continue;
      const section = document.createElement('div');
      section.innerHTML = `<div class="section-label">${MILESTONE_KIND_LABEL[kind]}</div>`;
      const row = document.createElement('div');
      row.className = 'chip-row';
      row.style.marginTop = '6px';
      for (const e of items) {
        const chip = document.createElement('span');
        chip.className = 'chip milestone-chip';
        chip.innerHTML = `${dot(e.confidence)}<span class="mono" style="color:var(--text-3);font-size:10px">${fmtDate(e)}</span> ${e.title} <button type="button" class="linklike cm-del" title="Delete">✕</button>`;
        chip.querySelector('.cm-del').addEventListener('click', (ev) => {
          ev.stopPropagation();
          const btn = ev.currentTarget;
          twoTapConfirm(btn, { confirmLabel: '✕ sure?', onConfirm: async () => { await store.deleteEvent(e.id); render(root, ctx, personId); } });
        });
        row.appendChild(chip);
      }
      section.appendChild(row);
      groupsEl.appendChild(section);
    }
  }

  // ---- + Add milestones: paste box, parse, confirm, save ----
  const addSlot = root.querySelector('#cm-add-slot');
  root.querySelector('#cm-add-btn').addEventListener('click', () => {
    if (addSlot.children.length) { addSlot.innerHTML = ''; return; }
    addSlot.innerHTML = `
      <div class="field" style="margin-top:12px">
        <label>Paste facts — one per line, each needs a date</label>
        <textarea id="cm-text" placeholder="2011 - signed to a major label&#10;Feb 2013 - reaches number one in Sweden&#10;2014 - certified gold in the UK&#10;2016 - wins a Best Female award" style="min-height:88px;font-family:var(--font-mono);font-size:12px"></textarea>
      </div>
      <div class="row wrap" style="gap:8px;align-items:flex-end">
        <div class="field" style="flex:1 1 220px;min-width:0"><label>Source (optional)</label><input type="text" id="cm-source" placeholder="Article name or URL"></div>
        <div class="field" style="flex:none"><label>Confidence</label>
          <select id="cm-verify">${VERIFICATIONS.map((v) => `<option value="${v}">${verificationLabel(v)}</option>`).join('')}</select>
        </div>
        <button class="btn btn-ghost btn-sm" id="cm-parse">Parse</button>
      </div>
      <div id="cm-preview"></div>
    `;
    root.querySelector('#cm-text').focus();
    root.querySelector('#cm-parse').addEventListener('click', () => {
      const btn = root.querySelector('#cm-parse');
      clearInlineNote(btn);
      const text = root.querySelector('#cm-text').value;
      const { candidates, unrecognised } = parseMilestoneText(text);
      const preview = root.querySelector('#cm-preview');
      if (!candidates.length) {
        preview.innerHTML = '';
        inlineNote(btn, text.trim() ? 'No dated facts found. Each line needs a date somewhere in it — "2014", "March 2014", "3 March 2014".' : 'Paste something first.');
        return;
      }
      preview.innerHTML = `
        <div class="stack" style="gap:4px;margin-top:10px" id="cm-rows"></div>
        ${unrecognised.length ? `<p class="mono" style="font-size:11px;color:var(--text-3);margin-top:8px">No date found, left out: ${unrecognised.map((u) => `"${u}"`).join(', ')}</p>` : ''}
        <button class="btn btn-primary btn-sm" id="cm-save" style="margin-top:10px">Save ${candidates.length} milestone${candidates.length === 1 ? '' : 's'}</button>
      `;
      const rowsEl = preview.querySelector('#cm-rows');
      for (const c of candidates) {
        const row = document.createElement('div');
        row.className = 'row';
        row.style.cssText = 'gap:8px;align-items:center';
        row.innerHTML = `
          <select class="cm-row-kind" style="flex:none">${MILESTONE_KINDS.map((k) => `<option value="${k}" ${k === c.kind ? 'selected' : ''}>${MILESTONE_KIND_LABEL[k]}</option>`).join('')}</select>
          <span class="mono" style="font-size:11px;color:var(--text-3);flex:none">${c.date || c.date_year_min}</span>
          <input type="text" class="cm-row-title" value="${c.title.replace(/"/g, '&quot;')}" style="flex:1;min-width:0">
          <button type="button" class="linklike cm-row-del" title="Remove">✕</button>
        `;
        row.querySelector('.cm-row-del').addEventListener('click', () => row.remove());
        rowsEl.appendChild(row);
      }
      preview.querySelector('#cm-save').addEventListener('click', async () => {
        const saveBtn = preview.querySelector('#cm-save');
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        const sourceText = root.querySelector('#cm-source').value.trim();
        const verification = root.querySelector('#cm-verify').value;
        let evidenceId = null;
        if (sourceText) {
          const isUrl = /^https?:\/\//i.test(sourceText);
          const ev = await store.createEvidence({
            case_id: ctx.caseId, type: 'note',
            title: isUrl ? `Source for ${person.display_name}'s commercial milestones` : sourceText,
            original_url: isUrl ? sourceText : null,
            verification, dated: new Date().toISOString().slice(0, 10),
          });
          evidenceId = ev.id;
        }
        const rows = [...rowsEl.querySelectorAll('.row')];
        let saved = 0;
        for (let i = 0; i < candidates.length; i++) {
          if (!rows[i]) continue; // removed from the preview
          const c = candidates[i];
          const kind = rows[i].querySelector('.cm-row-kind').value;
          const title = rows[i].querySelector('.cm-row-title').value.trim() || c.title;
          const eventId = await store.createEvent({
            case_id: ctx.caseId, person_id: person.id, kind, title,
            date: c.date, date_precision: c.date_precision, date_year_min: c.date_year_min, date_year_max: c.date_year_max,
          });
          if (evidenceId) await store.linkEvidence({ evidence_id: evidenceId, target_type: 'event', target_id: eventId });
          saved++;
        }
        lastResult = `${saved} milestone${saved === 1 ? '' : 's'} added${evidenceId ? ', citing the source given' : ' — drafted, no source given yet'}.`;
        render(root, ctx, personId);
      });
    });
  });
}
