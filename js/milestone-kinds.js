// The four commercial-success categories (her ask, 2026-09-05: "map out the
// timing of financial and commercial success" for musicians like Zara
// Larsson and Lily Allen). Each is stored as a plain `event.kind` — no
// schema change — so it already shows on the Board's year-strip for free.
export const MILESTONE_KINDS = ['chart', 'certification', 'award', 'deal'];

export const MILESTONE_KIND_LABEL = {
  chart: 'Chart position',
  certification: 'Certification',
  award: 'Award',
  deal: 'Deal / tour / endorsement',
};

export function isMilestoneKind(kind) {
  return MILESTONE_KINDS.includes(kind);
}

// Commercial-relevance gate (her ask, 2026-09-15): the tab only matters for
// people with a real commercial footprint — a private family member or a
// historical royal shouldn't carry an always-empty tab. Two signals, both
// already true before the tab is ever opened (never circular, since her
// workflow is Wikipedia-first — occupation is set the moment a profile is
// pulled, well before any milestone would exist): occupation wording, or an
// existing release/business/chart/certification/deal event. 'award' is
// deliberately excluded — it's shared with non-commercial honours (a
// knighthood, a Nobel Prize) written by the general "+ Life events" tool,
// and would false-positive on exactly the people this gate should hide.
// person.commercial_override (1/0), when she's set it by hand, always wins.
const COMMERCIAL_OCCUPATION_WORDS = [
  'singer', 'musician', 'rapper', 'songwriter', 'composer', 'dj',
  'actor', 'actress', 'model', 'athlete', 'footballer', 'sportsperson',
  'businessman', 'businesswoman', 'entrepreneur', 'founder', 'ceo',
  'executive', 'chairman', 'investor', 'magnate', 'mogul',
];
const COMMERCIAL_EVENT_KINDS = new Set(['release', 'business', 'chart', 'certification', 'deal']);

export function isCommercialRelevant(person, events) {
  if (person && (person.commercial_override === 1 || person.commercial_override === 0)) {
    return person.commercial_override === 1;
  }
  const occ = String((person && person.occupation) || '').toLowerCase();
  if (COMMERCIAL_OCCUPATION_WORDS.some((w) => occ.includes(w))) return true;
  return (events || []).some((e) => COMMERCIAL_EVENT_KINDS.has(e.kind));
}
