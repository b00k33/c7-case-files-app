import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, lifePath, personalYear, universalYear, birthdayNumber, expression, soulUrge, personality } from '../js/numerology.js';

test('reduce: plain digit sum, no master', () => {
  assert.deepEqual(reduce(37, true), { value: 1, master: false });
  assert.deepEqual(reduce(9, true), { value: 9, master: false });
});

test('reduce: master numbers survive when keepMaster', () => {
  assert.deepEqual(reduce(11, true), { value: 11, master: true });
  assert.deepEqual(reduce(22, true), { value: 22, master: true });
  assert.deepEqual(reduce(29, true), { value: 11, master: true }); // 29 -> 11, stops (master)
});

test('reduce: master numbers reduced away when keepMaster is false', () => {
  assert.deepEqual(reduce(11, false), { value: 2, master: false });
  assert.deepEqual(reduce(29, false), { value: 2, master: false }); // 29 -> 11 -> 2
});

test('lifePath: without a master number, shows its working', () => {
  const r = lifePath('1981-11-13');
  assert.equal(r.ok, true);
  assert.equal(r.master, false);
  assert.equal(r.value, 7);
  assert.deepEqual(r.parts, {
    day: 13, dayReduced: 4,
    month: 11, monthReduced: 2,
    year: 1981, yearReduced: 1,
    total: 7,
  });
});

test('lifePath: with a master number in the final total', () => {
  const r = lifePath('1900-01-09');
  assert.equal(r.ok, true);
  assert.equal(r.master, true);
  assert.equal(r.value, 11);
  assert.deepEqual(r.parts, {
    day: 9, dayReduced: 9,
    month: 1, monthReduced: 1,
    year: 1900, yearReduced: 1,
    total: 11,
  });
});

test('lifePath: refuses to guess without a full date', () => {
  assert.deepEqual(lifePath(null), { ok: false, reason: 'needs a day and month' });
  assert.deepEqual(lifePath('1981'), { ok: false, reason: 'needs a day and month' });
  assert.deepEqual(lifePath('1981-11'), { ok: false, reason: 'needs a day and month' });
  assert.deepEqual(lifePath('not-a-date'), { ok: false, reason: 'needs a day and month' });
});

test('lifePath: rejects an invalid calendar date', () => {
  assert.equal(lifePath('1981-02-30').ok, false); // Feb 30 doesn't exist
});

test('personalYear: reduce(birthDay + birthMonth + reduce(year))', () => {
  const r = personalYear('1981-11-13', 2026);
  assert.equal(r.ok, true);
  assert.equal(r.value, 7); // 13 + 11 + reduce(2026)=1 -> 25 -> 7
});

test('personalYear: refuses to guess without a full birth date', () => {
  assert.deepEqual(personalYear('1981', 2026), { ok: false, reason: 'needs a day and month' });
});

test('universalYear: the year itself, reduced', () => {
  assert.deepEqual(universalYear(2026), { ok: true, value: 1, master: false, year: 2026 });
  assert.equal(universalYear(2029).value, 4); // 2+0+2+9=13 -> 1+3=4
});

test('birthdayNumber: reduced day of birth', () => {
  assert.equal(birthdayNumber('1981-11-13').value, 4); // 13 -> 4
  assert.equal(birthdayNumber('1981-11-29').master, true); // 29 -> 11, master kept
  assert.deepEqual(birthdayNumber('1981'), { ok: false, reason: 'needs a day and month' });
});

test('expression/soulUrge/personality: Pythagorean values, name required', () => {
  assert.equal(expression('ABC').ok, true); // A=1 B=2 C=3 -> 6
  assert.equal(expression('ABC').value, 6);
  assert.deepEqual(expression(''), { ok: false, reason: 'needs a name' });
  // soulUrge('ABC') = vowel A only = 1
  assert.equal(soulUrge('ABC').value, 1);
  // personality('ABC') = consonants B+C = 2+3 = 5
  assert.equal(personality('ABC').value, 5);
});
