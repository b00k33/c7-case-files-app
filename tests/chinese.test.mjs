import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animalIndex, elementIndex, signFor } from '../js/chinese.js';

test('animalIndex: 1984 is Rat (index 0), cycles by 12', () => {
  assert.equal(animalIndex(1984), 0);
  assert.equal(animalIndex(1990), 6); // Horse
  assert.equal(animalIndex(1972), 0); // one full cycle back
});

test('elementIndex: 1984/1985 Wood, pairs of two years', () => {
  assert.equal(elementIndex(1984), 0); // Wood
  assert.equal(elementIndex(1985), 0); // Wood
  assert.equal(elementIndex(1986), 1); // Fire
  assert.equal(elementIndex(1990), 3); // Metal (Metal Horse, 1990)
});

test('signFor: refuses to guess without a full date', () => {
  assert.deepEqual(signFor('1990'), { ok: false, reason: 'needs a day and month' });
  assert.deepEqual(signFor(null), { ok: false, reason: 'needs a day and month' });
});

test('signFor: mid-year date, no boundary involved', () => {
  const r = signFor('1990-06-15');
  assert.equal(r.ok, true);
  assert.equal(r.boundary, false);
  assert.equal(r.animal, 'Horse');
  assert.equal(r.element, 'Metal');
});

test('signFor: crosses the lunar new year boundary — before CNY belongs to the previous animal year', () => {
  // CNY 2023 fell on 22 Jan. A birth on 10 Jan 2023 is still within the
  // preceding (Tiger) animal year, not the Gregorian year's own animal.
  const before = signFor('2023-01-10');
  assert.equal(before.ok, true);
  assert.equal(before.boundary, false);
  assert.equal(before.animal, 'Tiger');

  // A birth after CNY 2023 belongs to the new (Rabbit) animal year.
  const after = signFor('2023-01-25');
  assert.equal(after.ok, true);
  assert.equal(after.boundary, false);
  assert.equal(after.animal, 'Rabbit');
});

test('signFor: unknown-CNY year near the boundary returns boundary:true, never guesses', () => {
  const r = signFor('1800-02-10'); // 1800 is not in the CNY lookup table
  assert.equal(r.ok, true);
  assert.equal(r.boundary, true);
  assert.equal(r.animal, null);
  assert.equal(r.element, null);
});
