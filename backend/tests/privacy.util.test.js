import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suppressSmallCount, MIN_GROUP_SIZE, SMALL_COUNT_LABEL } from '../src/utils/privacy.util.js';

test('zero is shown as zero', () => {
  assert.equal(suppressSmallCount(0), 0);
});

test('counts of 1 to 4 are hidden behind a label', () => {
  for (const n of [1, 2, 3, 4]) assert.equal(suppressSmallCount(n), SMALL_COUNT_LABEL);
  assert.equal(SMALL_COUNT_LABEL, '<5');
});

test('counts of 5 or more are shown exactly', () => {
  assert.equal(MIN_GROUP_SIZE, 5);
  for (const n of [5, 6, 100, 12345]) assert.equal(suppressSmallCount(n), n);
});
