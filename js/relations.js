// Pure Chinese-zodiac relation functions. No DOM, no database, no globals.
// i, j are animalIndex values, 0 (Rat) .. 11 (Pig).

export function clash(i, j) {
  return (i - j + 12) % 12 === 6;
}

export function trine(i, j) {
  return i !== j && i % 4 === j % 4;
}

export function harmony(i, j) {
  return i + j === 1 || i + j === 13;
}

export function same(i, j) {
  return i === j;
}

/** @returns {'clash'|'trine'|'harmony'|'same'|'neutral'} */
export function relation(i, j) {
  if (same(i, j)) return 'same';
  if (clash(i, j)) return 'clash';
  if (trine(i, j)) return 'trine';
  if (harmony(i, j)) return 'harmony';
  return 'neutral';
}
