import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clash, trine, harmony, same, relation } from '../js/relations.js';

test('clash: opposite pairs, 6 apart', () => {
  assert.equal(clash(0, 6), true);  // Rat / Horse
  assert.equal(clash(1, 7), true);  // Ox / Goat
  assert.equal(clash(0, 4), false);
});

test('trine: same-remainder-mod-4 groups, excluding self', () => {
  assert.equal(trine(0, 4), true);   // Rat / Dragon
  assert.equal(trine(4, 8), true);   // Dragon / Monkey
  assert.equal(trine(0, 0), false);  // excludes identical index
  assert.equal(trine(0, 1), false);
});

test('harmony: the six fixed pairs summing to 1 or 13', () => {
  assert.equal(harmony(0, 1), true);   // Rat / Ox, sum 1
  assert.equal(harmony(4, 9), true);   // Dragon / Rooster, sum 13
  assert.equal(harmony(0, 2), false);
});

test('same: identical index only', () => {
  assert.equal(same(5, 5), true);
  assert.equal(same(5, 6), false);
});

test('relation: picks exactly one label per pair', () => {
  assert.equal(relation(0, 6), 'clash');
  assert.equal(relation(0, 4), 'trine');
  assert.equal(relation(0, 1), 'harmony');
  assert.equal(relation(5, 5), 'same');
  assert.equal(relation(0, 2), 'neutral');
});
