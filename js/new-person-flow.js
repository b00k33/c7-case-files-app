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
import { inlineNote, clearInlineNote } from './ui.js';
import { parseDate } from './profile-parse.js';

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
      renderQuickRelationship(panel, ctx, [], {
        lockedPersonId: person.id,
        kinds,
        heading: isFamily ? 'Add to the family tree' : 'Add a relationship',
        subheading: isFamily
          ? `A parent, child or sibling for ${esc(first)} — new or already in this case.`
          : `Who's already connected to ${esc(first)}? Type a name — new or already in this case.`,
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
