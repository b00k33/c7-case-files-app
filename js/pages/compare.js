// Compare artists (her ask, 2026-09-05): several people's release +
// commercial-milestone timelines stacked on one shared axis — "not
// comparing them to each other [as people], but I'd like the option to
// compare several artists together" on timing. Nothing else in C7 shows
// more than one case at once; this reads across every case's people.
import { emptyState } from '../indicators.js';
import { MILESTONE_KINDS, MILESTONE_KIND_LABEL } from '../milestone-kinds.js';

const SEL_KEY = 'c7-compare-people';
const AXIS_KEY = 'c7-compare-axis'; // 'calendar' | 'debut'

function getSelected() {
  try { return JSON.parse(localStorage.getItem(SEL_KEY)) || []; } catch (_) { return []; }
}
function setSelected(ids) { localStorage.setItem(SEL_KEY, JSON.stringify(ids)); }
function getAxis() { return localStorage.getItem(AXIS_KEY) === 'debut' ? 'debut' : 'calendar'; }
function setAxis(a) { localStorage.setItem(AXIS_KEY, a); }

function eventYear(e) {
  if (e.date) return parseInt(e.date.slice(0, 4), 10);
  if (e.date_year_min) return e.date_year_min;
  return null;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();
  let selected = getSelected().filter((id) => people.some((p) => p.id === id));
  let axis = getAxis();

  root.innerHTML = `
    <div class="stack">
      <div class="panel">
        <div class="row between wrap" style="gap:12px">
          <div class="panel-title" style="margin:0">Pick who to compare</div>
          <div class="view-toggle" id="axis-toggle">
            <button type="button" data-axis="calendar" class="${axis === 'calendar' ? 'on' : ''}">Calendar year</button>
            <button type="button" data-axis="debut" class="${axis === 'debut' ? 'on' : ''}">Years since debut</button>
          </div>
        </div>
        <div class="chip-row" id="pick-row" style="margin-top:10px"></div>
      </div>
      <div class="panel">
        <div class="panel-title">Timeline</div>
        <div id="compare-body" style="margin-top:8px"></div>
      </div>
    </div>
  `;

  const pickRow = root.querySelector('#pick-row');
  if (!people.length) {
    pickRow.appendChild(emptyState({ missing: 'No one to compare yet.', why: 'People appear here once they exist in a case.' }));
  } else {
    for (const p of people) {
      const on = selected.includes(p.id);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `chip ${on ? 'brass' : ''}`;
      chip.style.cursor = 'pointer';
      chip.style.border = '0';
      chip.textContent = `${p.display_name} · ${p.case_name}`;
      chip.addEventListener('click', () => {
        selected = selected.includes(p.id) ? selected.filter((id) => id !== p.id) : [...selected, p.id];
        setSelected(selected);
        render(root, ctx);
      });
      pickRow.appendChild(chip);
    }
  }

  for (const btn of root.querySelectorAll('#axis-toggle button')) {
    btn.addEventListener('click', () => { setAxis(btn.dataset.axis); render(root, ctx); });
  }

  const body = root.querySelector('#compare-body');
  if (!selected.length) {
    body.appendChild(emptyState({ missing: 'Nothing picked yet.', why: 'Tap one or more people above to lay their timelines side by side.' }));
    return;
  }

  const lanes = [];
  for (const id of selected) {
    const person = people.find((p) => p.id === id);
    const events = await store.listEventsForPerson(id);
    const releases = events.filter((e) => e.kind === 'release' && eventYear(e) != null);
    const milestones = events.filter((e) => MILESTONE_KINDS.includes(e.kind) && eventYear(e) != null);
    const allDated = [...releases, ...milestones].map(eventYear);
    const debutYear = allDated.length ? Math.min(...allDated) : null;
    lanes.push({ person, releases, milestones, debutYear });
  }

  const usable = lanes.filter((l) => l.debutYear != null);
  if (!usable.length) {
    body.appendChild(emptyState({ missing: 'None of the people picked have any dated releases or milestones yet.', why: 'Add works or milestones on their Commercial tab first.' }));
    return;
  }

  // shared axis: calendar year range across everyone, or years-since-debut span
  let axisMin, axisMax;
  if (axis === 'calendar') {
    const years = usable.flatMap((l) => [...l.releases, ...l.milestones].map(eventYear));
    axisMin = Math.min(...years);
    axisMax = Math.max(...years, new Date().getFullYear());
  } else {
    axisMin = 0;
    axisMax = Math.max(...usable.map((l) => Math.max(0, ...[...l.releases, ...l.milestones].map((e) => eventYear(e) - l.debutYear))));
  }
  const span = Math.max(1, axisMax - axisMin);
  const pos = (year, debutYear) => {
    const v = axis === 'calendar' ? year : year - debutYear;
    return `${Math.max(0, Math.min(100, ((v - axisMin) / span) * 100))}%`;
  };

  const strip = document.createElement('div');
  strip.className = 'compare-strip';
  const axisRow = document.createElement('div');
  axisRow.className = 'compare-axis mono';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = Math.round(axisMin + (span * i) / ticks);
    const tick = document.createElement('span');
    tick.style.left = `${(i / ticks) * 100}%`;
    tick.textContent = axis === 'calendar' ? v : `+${v}y`;
    axisRow.appendChild(tick);
  }
  strip.appendChild(axisRow);

  for (const l of lanes) {
    const lane = document.createElement('div');
    lane.className = 'compare-lane';
    const who = document.createElement('div');
    who.className = 'compare-who';
    who.innerHTML = `<a href="#/subject/${l.person.id}">${l.person.display_name}</a>`;
    lane.appendChild(who);
    const track = document.createElement('div');
    track.className = 'compare-track';
    if (l.debutYear == null) {
      track.innerHTML = '<span class="mono" style="font-size:10px;color:var(--text-3)">no dated events yet</span>';
    } else {
      for (const e of l.releases) {
        const d = document.createElement('span');
        d.className = 'compare-dot release';
        d.style.left = pos(eventYear(e), l.debutYear);
        d.title = `${e.title} · ${eventYear(e)}`;
        track.appendChild(d);
      }
      for (const e of l.milestones) {
        const d = document.createElement('span');
        d.className = 'compare-dot milestone';
        d.style.left = pos(eventYear(e), l.debutYear);
        d.title = `${MILESTONE_KIND_LABEL[e.kind]}: ${e.title} · ${eventYear(e)}`;
        track.appendChild(d);
      }
    }
    lane.appendChild(track);
    strip.appendChild(lane);
  }
  body.appendChild(strip);

  const legend = document.createElement('div');
  legend.className = 'mono';
  legend.style.cssText = 'font-size:10px;color:var(--text-3);margin-top:10px';
  legend.textContent = 'grey = release · teal = commercial milestone';
  body.appendChild(legend);
}
