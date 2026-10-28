// Pure observed-vs-expected helpers. No DOM, no database, no globals.
// With twelve Chinese-zodiac signs and a handful of people, coincidence is
// cheap — every panel that shows an observed count must show what chance
// alone would predict, right beside it.

/**
 * Expected counts of each relation type across nPairs distinct pairs,
 * assuming animal signs are uniformly and independently distributed.
 * Of the 12x12 = 144 ordered outcomes for two signs: 12 are clash,
 * 24 are trine, 12 are harmony, 12 are same — out of 144 total.
 */
export function expectedCounts(nPairs) {
  return {
    clash: nPairs / 12,
    trine: (nPairs * 2) / 12,
    harmony: nPairs / 12,
    same: nPairs / 12,
  };
}
