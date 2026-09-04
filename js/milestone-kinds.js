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
