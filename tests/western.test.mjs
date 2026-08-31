import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunSign } from '../js/western.js';

test('sunSign: refuses to guess without a full date', () => {
  assert.deepEqual(sunSign('1990'), { ok: false, reason: 'needs a day and month' });
  assert.deepEqual(sunSign(null), { ok: false, reason: 'needs a day and month' });
});

test('sunSign: mid-sign date is not a cusp', () => {
  const r = sunSign('1990-07-01'); // deep in Cancer
  assert.equal(r.ok, true);
  assert.equal(r.sign, 'Cancer');
  assert.equal(r.cusp, false);
});

test('sunSign: boundary date is flagged as a cusp', () => {
  const r = sunSign('1990-03-21'); // Aries start
  assert.equal(r.ok, true);
  assert.equal(r.sign, 'Aries');
  assert.equal(r.cusp, true);
});

test('sunSign: Capricorn wraps the year end', () => {
  assert.equal(sunSign('1990-01-05').sign, 'Capricorn');
  assert.equal(sunSign('1990-12-25').sign, 'Capricorn');
});
