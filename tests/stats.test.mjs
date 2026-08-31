import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedCounts } from '../js/stats.js';

test('expectedCounts: uniform distribution over the 144 ordered outcomes', () => {
  assert.deepEqual(expectedCounts(12), { clash: 1, trine: 2, harmony: 1, same: 1 });
  assert.deepEqual(expectedCounts(6), { clash: 0.5, trine: 1, harmony: 0.5, same: 0.5 });
});
