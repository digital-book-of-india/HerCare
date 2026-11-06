import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, isValidMonth, addDays, diffDays, monthRange, eachDate, todayUTC } from '../src/utils/dates.util.js';

test('isValidDate accepts real dates and rejects impossible ones', () => {
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2000-02-29'), true); // divisible by 400
  assert.equal(isValidDate('2023-02-29'), false);
  assert.equal(isValidDate('2100-02-29'), false); // divisible by 100, not 400
  assert.equal(isValidDate('2024-13-01'), false);
  assert.equal(isValidDate('2024-04-31'), false);
  assert.equal(isValidDate('2024-4-1'), false);
  assert.equal(isValidDate('2024-04-01T00:00:00Z'), false);
  assert.equal(isValidDate('0024-04-01'), false);
  assert.equal(isValidDate(20240401), false);
  assert.equal(isValidDate(undefined), false);
});

test('isValidMonth', () => {
  assert.equal(isValidMonth('2024-02'), true);
  assert.equal(isValidMonth('2024-13'), false);
  assert.equal(isValidMonth('2024-2'), false);
});

test('addDays crosses month ends', () => {
  assert.equal(addDays('2024-01-31', 1), '2024-02-01');
  assert.equal(addDays('2024-01-31', 30), '2024-03-01'); // leap year February
  assert.equal(addDays('2023-01-31', 30), '2023-03-02'); // non-leap February
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2023-03-01', -1), '2023-02-28');
});

test('addDays crosses year ends', () => {
  assert.equal(addDays('2023-12-31', 1), '2024-01-01');
  assert.equal(addDays('2024-01-01', -1), '2023-12-31');
  assert.equal(addDays('2023-12-20', 28), '2024-01-17');
});

test('leap day handling', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-02-29', 1), '2024-03-01');
  assert.equal(addDays('2024-02-29', 365), '2025-02-28');
  assert.equal(diffDays('2024-02-10', '2024-03-09'), 28);
  assert.equal(diffDays('2023-02-10', '2023-03-09'), 27);
  assert.equal(diffDays('2024-01-01', '2025-01-01'), 366);
  assert.equal(diffDays('2023-01-01', '2024-01-01'), 365);
});

test('daylight-saving transitions never change the day count', () => {
  assert.equal(diffDays('2024-03-09', '2024-03-11'), 2); // US spring forward on 03-10
  assert.equal(diffDays('2024-11-02', '2024-11-04'), 2); // US fall back on 11-03
  assert.equal(diffDays('2024-03-30', '2024-04-01'), 2); // EU spring forward on 03-31
  assert.equal(diffDays('2024-10-26', '2024-10-28'), 2); // EU fall back on 10-27
  assert.equal(addDays('2024-03-10', 1), '2024-03-11');
  assert.equal(addDays('2024-10-27', 1), '2024-10-28');
});

test('diffDays sign', () => {
  assert.equal(diffDays('2024-05-10', '2024-05-01'), -9);
  assert.equal(diffDays('2024-05-01', '2024-05-01'), 0);
});

test('monthRange handles every month length', () => {
  assert.deepEqual(monthRange('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(monthRange('2023-02'), { start: '2023-02-01', end: '2023-02-28' });
  assert.deepEqual(monthRange('2024-04'), { start: '2024-04-01', end: '2024-04-30' });
  assert.deepEqual(monthRange('2024-12'), { start: '2024-12-01', end: '2024-12-31' });
});

test('eachDate is inclusive', () => {
  assert.deepEqual(eachDate('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.deepEqual(eachDate('2024-05-05', '2024-05-05'), ['2024-05-05']);
  assert.deepEqual(eachDate('2024-05-06', '2024-05-05'), []);
});

test('todayUTC uses the UTC date', () => {
  assert.equal(todayUTC(new Date('2024-12-31T23:59:59Z')), '2024-12-31');
  assert.equal(todayUTC(new Date('2025-01-01T00:00:00Z')), '2025-01-01');
});
