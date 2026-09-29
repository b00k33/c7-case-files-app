import { autoCaseName, looksHurried } from '../names.js';
import { armNewPersonFlow } from '../new-person-flow.js';

// what a case is about (her call, 2026-09-02; event added 2026-09-04; series
// added 2026-09-21, "i need a category for novel/film series" — neither a
// person, a household, nor a major event, but a franchise with its own cast
// and a dated run of installments; company added 2026-09-29, "add an option
// for me to add corporations/businesses" — a business has its own founding,
// founders and a run of locations opening over time): a person, a family, a
// major event, a novel/film series, or a business/corporation.
export const CASE_KINDS = [
  { value: 'person', label: 'A person' },
  { value: 'family', label: 'A family / household' },
  { value: 'event', label: 'A major event' },
  { value: 'series', label: 'A novel / film series' },
  { value: 'company', label: 'A business / corporation' },
];

// "person-shaped," for anything that isn't deliberately about more-than-one
// (found live, 2026-09-28 — her real "Dolly Parton" case had no "Move to
// People" option): schema.sql's case_file.kind still DEFAULTS to 'research'
// (store.js's createCase falls back to it too), a leftover from before this
// four-kind system existed (2026-09-13) — nothing ever migrated old rows, so
// a case created before then can still carry 'research' today. Family,
// event, series and company are the only kinds deliberately NOT about a
// single person; everything else (the literal 'person', or any legacy/
// unrecognized value) counts as person-shaped.
export const isPersonKind = (kind) => !['family', 'event', 'series', 'company'].includes(kind);

// creating a person-case also creates the person, so their file (and Look
// up) exists immediately — no empty case, no extra step. An event-case and a
// series-case each start on their own overview instead — no auto-created
// "subject" person (a series isn't a person any more than a war is).
export async function createCaseOfKind(store, ctx, typedName, kind, world) {
  // names (2026-09-13): the same typed string becomes both the case name
  // and (for a person-kind case) the subject's name — cased once here so
  // the two can never drift apart
  const hurried = looksHurried(typedName);
  const name = hurried ? autoCaseName(typedName) : typedName;
  const kase = await store.createCase({ name, kind: kind || 'person', world: world || null });
  await ctx.setCaseId(kase.id);
  if ((kind || 'person') === 'person') {
    const p = await store.createPerson({ case_id: kase.id, display_name: name, kind: 'person', name_needs_formatting: hurried ? 1 : 0 });
    armNewPersonFlow(p.id);
    ctx.navigate(`#/subject/${p.id}`);
  } else if (kind === 'event') {
    ctx.navigate('#/event');
  } else if (kind === 'series') {
    ctx.navigate('#/series');
  } else if (kind === 'company') {
    ctx.navigate('#/company');
  } else {
    ctx.navigate('#/family');
  }
  return kase;
}
