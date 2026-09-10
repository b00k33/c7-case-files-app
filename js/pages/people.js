// People — everyone across every case; tap → their profile.
// Picture rows (her Q15, 2026-09-07; built 2026-09-08): one layout for the
// phone and the desktop — face · name · the three tokens (life path, animal,
// sign), the case they live in as a dim mono note when it isn't just their
// own name. No kind or count text on a row. The Table/List toggle of v62 is
// gone with it: one list, sorted by name, the search box at the top of every
// page does the finding. Faces are decoded before the list is shown, so they
// arrive with the page instead of popping in after it.
import { emptyState } from '../indicators.js';
import { resolveAssetUrl, preloadImage } from '../assets.js';
import { tokensHtml } from '../lifemap.js';
import { twoTapConfirm } from '../ui.js';
import { markOpened } from './cases.js';

function initials(name) { return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null; }
function birthYear(p) { return p.birth_date ? p.birth_date.slice(0, 4) : (p.birth_year_min ? String(p.birth_year_min) : null); }

async function faceEl(p, size) {
  const el = document.createElement('div');
  el.className = 'face';
  el.style.width = el.style.height = `${size}px`;
  el.innerHTML = `<span class="initials">${initials(p.display_name)}</span>`;
  const src = p.photo_path ? await resolveAssetUrl(p.photo_path, 'image/jpeg') : p.photo_url;
  if (src && await preloadImage(src)) {
    const img = document.createElement('img');
    img.alt = ''; img.src = src;
    const initialsEl = el.querySelector('.initials');
    if (img.complete && img.naturalWidth) initialsEl?.remove();
    else img.addEventListener('load', () => initialsEl?.remove());
    img.addEventListener('error', () => img.remove());
    el.appendChild(img);
  }
  return el;
}

function goToPerson(ctx, p) { markOpened(p.case_id); ctx.setCaseId(p.case_id).then(() => ctx.navigate(`#/subject/${p.id}`)); }

// ---- same-case duplicates (her ask, 2026-09-11: "lisa is duplicated but i
// don't know how to resolve it") ----------------------------------------
// Two people with the same name in the same case — a double entry, not a
// judgement call. Follows the Cases page's cross-case duplicate flag
// exactly: grouped by case + normalised name + kind, the oldest is the
// keeper, every later one gets a merge chip. This deliberately stops at
// "same case" — the same real person appearing in two DIFFERENT cases (a
// subject with their own case, and again inside someone else's family) is a
// bigger design call about what a person IS in this app, and isn't folded
// in here.

/** case_id + lower-cased name + kind -> [{ keepPerson }] for every later duplicate. */
function findDuplicatePeopleByCase(people) {
  const groups = new Map();
  for (const p of people) {
    const name = (p.display_name || '').trim().toLowerCase();
    if (!name) continue;
    const key = `${p.case_id}::${name}::${p.kind || 'person'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const dupOf = new Map(); // person id -> { keepPerson }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const [keep, ...rest] = group;
    for (const dup of rest) dupOf.set(dup.id, { keepPerson: keep });
  }
  return dupOf;
}

// A same-name pair that's already recorded as related to each other (a
// father and son sharing a name, say) is almost certainly two distinct
// people, not a double entry — the same real person merged under two rows
// would never carry a relationship to themselves. Adversarial review
// caught this before ship (2026-09-11): merging such a pair silently
// deletes that relationship (mergePerson collapses a->keep, b->keep into a
// self-link and drops it) with no warning that names it. Rather than touch
// the shared merge primitive, a related pair is simply never offered the
// one-tap merge here.
async function hasDirectRelationship(store, aId, bId) {
  const rels = await store.listRelationshipsForPerson(aId);
  return rels.some((r) => r.a_id === bId || r.b_id === bId);
}

/** The merge chip — same look as the Cases page's "Possible duplicate" flag. */
function dupFlagHtml(dupInfo) {
  const when = fmtDate(dupInfo.keepPerson.created_at);
  return `<button type="button" class="chip brass dup-flag" style="border:0;cursor:pointer" title="Merges this entry into the other ${esc(dupInfo.keepPerson.display_name)}${when ? ` (added ${when})` : ''} in this case — every relation, event and evidence link moves over, and this one is removed">Possible duplicate →</button>`;
}
function wireDupFlag(row, p, dupInfo, store, onChanged) {
  const btn = row.querySelector('.dup-flag');
  if (!btn || !dupInfo) return;
  // Birth years, when known, on the confirm step itself — visible on tap,
  // unlike the chip's hover-only title — so a genuine mismatch (two
  // different Lisas) is catchable before the merge, not after.
  const dupYear = birthYear(p), keepYear = birthYear(dupInfo.keepPerson);
  const years = [dupYear ? `this: b.${dupYear}` : null, keepYear ? `keeping: b.${keepYear}` : null].filter(Boolean).join(' · ');
  twoTapConfirm(btn, {
    confirmLabel: `Merge into the other ${dupInfo.keepPerson.display_name}?${years ? ` (${years})` : ''}`,
    onConfirm: async () => { await store.mergePerson(dupInfo.keepPerson.id, p.id); onChanged(); },
  });
}

/** One picture row: face · name (· case, when it says something) · tokens · merge flag. */
async function buildPicRow(p, ctx, dupInfo, onChanged) {
  const { store } = ctx;
  const row = document.createElement('div');
  row.className = 'pic-row';
  const sameName = (p.case_name || '').trim().toLowerCase() === (p.display_name || '').trim().toLowerCase();
  row.innerHTML = `
    <div class="pic"></div>
    <div class="main">
      <div class="line"><div class="title">${esc(p.display_name)}</div>${!sameName && p.case_name ? `<span class="where" title="The case this person lives in">${esc(p.case_name)}</span>` : ''}</div>
      <div class="line"><div class="lm-tokens">${tokensHtml(p, { compact: true })}</div><div class="badges">${dupInfo ? dupFlagHtml(dupInfo) : ''}</div></div>
    </div>`;
  row.querySelector('.pic').appendChild(await faceEl(p, 48));
  row.addEventListener('click', (e) => { if (e.target.closest('button')) return; goToPerson(ctx, p); });
  wireDupFlag(row, p, dupInfo, store, onChanged);
  return row;
}

export async function render(root, ctx) {
  const { store } = ctx;
  const people = await store.listAllPeople();

  root.innerHTML = `
    <div class="stack">
      <div class="row between wrap" style="gap:12px">
        <span class="mono" style="font-size:11px;color:var(--text-3)">${people.length} ${people.length === 1 ? 'person' : 'people'} · every case</span>
        <a class="btn btn-ghost btn-sm" href="#/compare">Compare artists →</a>
      </div>
      <div id="people-body"></div>
    </div>
  `;

  const body = root.querySelector('#people-body');
  if (!people.length) {
    body.appendChild(emptyState({ missing: 'No people yet.', why: 'Create a case about a person and they appear here.' }));
    return;
  }
  const dupOf = findDuplicatePeopleByCase(people);
  await Promise.all([...dupOf.entries()].map(async ([dupId, info]) => {
    if (await hasDirectRelationship(store, dupId, info.keepPerson.id)) dupOf.delete(dupId);
  }));
  const onChanged = () => render(root, ctx);
  const shown = [...people].sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '', undefined, { sensitivity: 'base' }));
  // every row is built (faces decoded) before any of them is shown
  const list = document.createElement('div');
  list.className = 'pic-list';
  const rows = await Promise.all(shown.map((p) => buildPicRow(p, ctx, dupOf.get(p.id), onChanged)));
  for (const r of rows) list.appendChild(r);
  body.appendChild(list);
}
