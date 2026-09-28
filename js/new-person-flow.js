// The guided 3-step drawer that opens right after a brand-new person is
// created from a cold start — People's "+ Person", Cases' "+ New", or
// either's Wikipedia lookup. Her ask, 2026-09-28: "when i add a person,
// make an animated workflow - i usually add their relationships, family
// tree and life events" — picked "A, guided stepper" from three animated
// mocks. Never fires from a person created mid-task elsewhere (Relations'
// own quick-add already IS step 1/2; family.js is read-only) — a
// sessionStorage flag armed only by the two cold-start creation points,
// read once and cleared here, so it can only ever fire once per person.
import { renderQuickRelationship } from './pages/relations.js';
import { inlineNote, clearInlineNote, renderWikiFeed } from './ui.js';
import { parseDate } from './profile-parse.js';
import { searchPeople, insertFamily } from './lookup.js';

const FLAG_KEY = 'c7-new-person-flow';

// mirrors subject.js's own EVENT_KINDS (not exported — this list is small
// and stable enough to keep a second copy rather than risk a subject.js ↔
// new-person-flow.js import cycle for one array)
const EVENT_KINDS = [
  ['other', 'event'], ['marriage', 'married'], ['divorce', 'ended'], ['award', 'award'], ['trial', 'trial'],
  ['crisis', 'crisis'], ['move', 'moved'], ['business', 'business'], ['release', 'release'], ['death', 'died'],
];

const STEP_META = [
  { icon: '🔗', title: 'Relationships' },
  { icon: '🌳', title: 'Family tree' },
  { icon: '📍', title: 'Life events' },
];

export function armNewPersonFlow(personId) {
  sessionStorage.setItem(FLAG_KEY, personId);
}

/** Called once from subject.js's own render(), same spot as its other
 * "arrived here for a reason" session flags. No-ops silently unless this
 * exact person is the one a cold-start creation just armed. */
export function maybeStartNewPersonFlow(ctx, person, redraw) {
  if (sessionStorage.getItem(FLAG_KEY) !== person.id) return;
  sessionStorage.removeItem(FLAG_KEY);
  ctx.openDrawer((body) => renderStepper(body, ctx, person, redraw));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderStepper(body, ctx, person, redraw) {
  const { store } = ctx;
  const first = person.display_name.split(/\s+/)[0] || person.display_name;
  let step = 0;
  let changed = false; // whether anything was actually saved — decides whether the profile behind the drawer needs a redraw on close
  // shared across steps 0/1: her ask, 2026-09-28 ("give option to search wiki
  // mass add instead of manually adding one by one" + "prioritise mass
  // adding, hide manual adds — expandable") — one Wikidata pull covers both
  // steps at once (insertFamily brings spouse, parents, siblings AND
  // children back together), so once it's run on whichever step she reaches
  // first, the other just shows it's done instead of offering it again
  const massState = { pulled: false };

  body.innerHTML = `
    <div class="npf">
      <div class="npf-head">
        <div>
          <h3 class="title" style="margin:0;font-size:15px">Let's fill ${esc(first)} in</h3>
          <p class="npf-sub">Relationships, family, then a first life event</p>
        </div>
        <button type="button" class="npf-skip-all" id="npf-skip-all">Skip all</button>
      </div>
      <div class="npf-dots">${STEP_META.map(() => '<span></span>').join('')}<span></span></div>
      <div class="npf-step-tag" id="npf-step-tag"></div>
      <div class="npf-body" id="npf-body"></div>
      <div class="npf-foot" id="npf-foot">
        <button type="button" class="btn btn-ghost" id="npf-back">Back</button>
        <button type="button" class="btn btn-ghost" id="npf-skip">Skip</button>
        <button type="button" class="btn btn-primary" id="npf-next" style="display:none">Finish →</button>
      </div>
    </div>
  `;

  const dots = [...body.querySelectorAll('.npf-dots span')];
  const stepTag = body.querySelector('#npf-step-tag');
  const stepBody = body.querySelector('#npf-body');
  const backBtn = body.querySelector('#npf-back');
  const skipBtn = body.querySelector('#npf-skip');
  const nextBtn = body.querySelector('#npf-next');

  const paintDots = () => dots.forEach((d, i) => { d.classList.toggle('done', i < step); d.classList.toggle('active', i === step); });
  const showNextBtn = (show) => {
    // steps 0/1 embed renderQuickRelationship, which renders its own Add
    // button — a second visible .btn-primary here would be redundant, and
    // an invisible one would still be a candidate for the drawer's own
    // "Enter fires .btn-primary" convention (main.js), so it comes fully
    // out of the primary-button role rather than just being hidden
    nextBtn.style.display = show ? '' : 'none';
    nextBtn.classList.toggle('btn-primary', show);
    nextBtn.classList.toggle('btn-ghost', !show);
  };

  /** Swaps the step body's content with a fresh panel that slides/fades in. */
  function setPanel(builder) {
    const panel = document.createElement('div');
    panel.className = 'npf-panel';
    stepBody.innerHTML = '';
    stepBody.appendChild(panel);
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('in')));
    builder(panel);
    return panel;
  }

  const finish = () => {
    stepTag.innerHTML = '';
    setPanel((panel) => {
      panel.innerHTML = `
        <div class="npf-done" id="npf-done">
          <div class="npf-done-circle">✓</div>
          <h4>All set</h4>
          <p>You can always add more from ${esc(first)}'s profile whenever there's more to know.</p>
        </div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => panel.querySelector('#npf-done')?.classList.add('pop')));
    });
    dots.forEach((d) => d.classList.add('done'));
    body.querySelector('#npf-foot').innerHTML = `<button type="button" class="btn btn-primary" id="npf-done-btn" style="flex:1">Done</button>`;
    body.querySelector('#npf-done-btn').addEventListener('click', () => {
      ctx.closeDrawer();
      if (changed) redraw();
    });
  };

  const goToStep = (n) => {
    step = n;
    paintDots();
    if (n >= STEP_META.length) { finish(); return; }
    stepTag.innerHTML = `<span class="npf-step-icon">${STEP_META[n].icon}</span> ${esc(STEP_META[n].title)}`;
    backBtn.style.visibility = n === 0 ? 'hidden' : 'visible';
    if (n === 2) { showNextBtn(true); renderEventStep(); }
    else { showNextBtn(false); renderRelStep(n); }
  };

  /** The primary action: pull everyone Wikidata knows about this person in
   * one go (spouse, parents, siblings, children — insertFamily doesn't
   * separate them). Falls back to a quick search when the person isn't
   * linked to a Wikidata record yet; the manual one-by-one form always
   * stays reachable underneath, collapsed, for anyone Wikidata doesn't have. */
  function renderMassAdd(container) {
    if (massState.pulled) {
      container.innerHTML = `<div class="inline-note" style="border-left-color:var(--green)">✓ Already pulled from Wikidata — anyone it didn't have can go in below.</div>`;
      return;
    }
    if (person.wikidata_id) {
      container.innerHTML = `<button type="button" class="btn btn-primary" id="npf-pull" style="width:100%">🔗 Pull everyone Wikidata knows — spouse, parents, siblings, children</button>`;
      container.querySelector('#npf-pull').addEventListener('click', async () => {
        const btn = container.querySelector('#npf-pull');
        btn.disabled = true;
        btn.textContent = '🔗 Pulling…';
        const feedWrap = document.createElement('div');
        feedWrap.className = 'inline-note';
        feedWrap.style.cssText = 'border-left-color:var(--brass);margin-top:8px';
        container.appendChild(feedWrap);
        const feed = renderWikiFeed(feedWrap);
        try {
          const r = await insertFamily(store, ctx.caseId, person.id, person.wikidata_id, (msg) => feed.addLine(msg));
          massState.pulled = true;
          changed = true;
          feed.finish(r.total ? `${r.created.length + r.linked.length} pulled, ${r.relationships} link${r.relationships === 1 ? '' : 's'} drawn.` : 'Wikidata had no relatives on file for them.');
          btn.remove();
        } catch (e) {
          feedWrap.remove();
          btn.disabled = false;
          btn.textContent = `Failed — ${e.message}. Tap to retry.`;
        }
      });
      return;
    }
    // not linked to a Wikidata record yet — find it first, same match-and-pick
    // pattern as every other lookup in the app, then the pull runs straight away
    container.innerHTML = `
      <div class="row wrap" style="gap:8px">
        <input type="text" id="npf-wk-name" value="${esc(person.display_name)}" style="flex:1 1 160px">
        <button type="button" class="btn btn-primary btn-sm" id="npf-wk-search">Look up on Wikipedia</button>
      </div>
      <div id="npf-wk-results" style="margin-top:8px"></div>
    `;
    const nameInput = container.querySelector('#npf-wk-name');
    const resultsSlot = container.querySelector('#npf-wk-results');
    container.querySelector('#npf-wk-search').addEventListener('click', async () => {
      const btn = container.querySelector('#npf-wk-search');
      const q = nameInput.value.trim();
      if (!q) return;
      btn.disabled = true; btn.textContent = 'Searching…';
      let matches = [];
      try { matches = await searchPeople(q); }
      catch (e) { resultsSlot.innerHTML = `<div class="inline-note">Couldn't reach Wikidata — ${esc(e.message)}.</div>`; btn.disabled = false; btn.textContent = 'Look up on Wikipedia'; return; }
      btn.disabled = false; btn.textContent = 'Look up on Wikipedia';
      if (!matches.length) { resultsSlot.innerHTML = `<div class="inline-note">No match on Wikidata — add family by hand below.</div>`; return; }
      resultsSlot.innerHTML = matches.map((m, i) => `
        <div class="list-row" data-pick="${i}">
          <div class="main"><div class="title" style="font-size:13px">${esc(m.label)}</div><div class="sub">${esc(m.description) || 'no description'} · ${m.id}</div></div>
          <span class="chip">use this</span>
        </div>`).join('');
      resultsSlot.querySelectorAll('[data-pick]').forEach((row) => row.addEventListener('click', async () => {
        const m = matches[+row.dataset.pick];
        const feedWrap = document.createElement('div');
        feedWrap.className = 'inline-note';
        feedWrap.style.borderLeftColor = 'var(--brass)';
        resultsSlot.innerHTML = '';
        resultsSlot.appendChild(feedWrap);
        const feed = renderWikiFeed(feedWrap);
        feed.addLine(`Linked to ${m.label} on Wikidata`);
        await store.updatePerson(person.id, { wikidata_id: m.id });
        person.wikidata_id = m.id;
        try {
          const r = await insertFamily(store, ctx.caseId, person.id, m.id, (msg) => feed.addLine(msg));
          massState.pulled = true;
          changed = true;
          feed.finish(r.total ? `${r.created.length + r.linked.length} pulled, ${r.relationships} link${r.relationships === 1 ? '' : 's'} drawn.` : 'Wikidata had no relatives on file for them.');
        } catch (e) {
          container.innerHTML = `<div class="inline-note">Linked to Wikidata; the family pull failed (${esc(e.message)}) — try again from the next step, or add by hand below.</div>`;
        }
      }));
    });
  }

  function renderRelStep(n) {
    const isFamily = n === 1;
    const kinds = isFamily
      ? [
          { value: 'parent', label: 'Their child', lockedIsB: false },
          { value: 'parent', label: 'Their parent', lockedIsB: true },
          { value: 'sibling', label: 'Sibling' },
        ]
      : ['spouse', 'partner', 'godparent', 'business', 'associate', 'household'];
    setPanel((panel) => {
      panel.innerHTML = `
        <p class="npf-step-desc">${isFamily ? `Parents, children and siblings for ${esc(first)}.` : `Who's already connected to ${esc(first)}?`}</p>
        <div class="npf-mass" id="npf-mass"></div>
        <details class="npf-manual" id="npf-manual">
          <summary style="cursor:pointer;font-size:12px;color:var(--text-3);list-style:none;margin-top:14px">▸ Add one at a time, by hand</summary>
          <div id="npf-manual-body" style="margin-top:10px"></div>
        </details>
      `;
      renderMassAdd(panel.querySelector('#npf-mass'));
      renderQuickRelationship(panel.querySelector('#npf-manual-body'), ctx, [], {
        lockedPersonId: person.id,
        kinds,
        heading: isFamily ? 'A specific parent, child or sibling' : 'A specific person',
        subheading: 'Type a name — new or already in this case.',
        onSaved: () => { changed = true; goToStep(step + 1); },
      });
    });
  }

  function renderEventStep() {
    setPanel((panel) => {
      panel.innerHTML = `
        <p class="npf-step-desc">Log the first thing worth marking on ${esc(first)}'s life line.</p>
        <div class="field"><label>What happened</label><input type="text" id="npf-ev-title" placeholder="Married Debbie Rowe · won a Grammy · moved to Paris"></div>
        <div class="row wrap" style="gap:8px">
          <div class="field" style="flex:1 1 140px"><label>Kind</label><select id="npf-ev-kind">${EVENT_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
          <div class="field" style="flex:1 1 150px"><label>When</label><input type="text" id="npf-ev-date" placeholder="14 Nov 1996 · Nov 1996 · 1996"></div>
        </div>
      `;
      queueMicrotask(() => panel.querySelector('#npf-ev-title')?.focus());
    });
    nextBtn.onclick = async () => {
      const titleInput = stepBody.querySelector('#npf-ev-title');
      const title = titleInput.value.trim();
      if (!title) { goToStep(step + 1); return; } // nothing typed — Finish just skips
      const dateText = stepBody.querySelector('#npf-ev-date').value.trim();
      const d = dateText ? parseDate(dateText) : null;
      if (dateText && !d) { inlineNote(nextBtn, 'That date didn’t read — try "14 Nov 1996", "Nov 1996" or "1996".'); return; }
      clearInlineNote(nextBtn);
      const kind = stepBody.querySelector('#npf-ev-kind').value;
      await store.createEvent({ case_id: ctx.caseId, person_id: person.id, title, kind, date: d ? d.date : null, date_precision: d ? d.precision : 'unknown', date_year_min: d ? d.year : null, date_year_max: d ? d.year : null });
      changed = true;
      goToStep(step + 1);
    };
  }

  backBtn.addEventListener('click', () => { if (step > 0) goToStep(step - 1); });
  skipBtn.addEventListener('click', () => goToStep(step + 1));
  nextBtn.addEventListener('click', () => nextBtn.onclick?.());
  body.querySelector('#npf-skip-all').addEventListener('click', () => { ctx.closeDrawer(); if (changed) redraw(); });

  goToStep(0);
}
