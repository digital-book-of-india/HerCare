import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateCycle, predictedRanges, buildCalendar, actualRange, validIntervals,
} from '../src/services/cycleEstimator.service.js';

const settings = { cycleLength: 28, periodDuration: 5 };
const rec = (startDate, endDate = null) => ({ startDate, endDate });

test('no records: no estimate, flagged as too little history', () => {
  const e = estimateCycle({ records: [], settings, today: '2024-05-01' });
  assert.equal(e.status, 'no_data');
  assert.equal(e.nextEstimatedStart, null);
  assert.equal(e.tooLittleHistory, true);
  assert.equal(e.estimated, true);
  assert.deepEqual(predictedRanges(e), []);
});

test('one record: uses the chosen cycle length and says so', () => {
  const e = estimateCycle({ records: [rec('2024-05-01', '2024-05-05')], settings, today: '2024-05-10' });
  assert.equal(e.basis, 'chosen_length');
  assert.equal(e.tooLittleHistory, true);
  assert.equal(e.cycleLength, 28);
  assert.equal(e.nextEstimatedStart, '2024-05-29');
  assert.equal(e.nextEstimatedEnd, '2024-06-02');
  assert.equal(e.daysUntilNextPeriod, 19);
  assert.equal(e.cycleDay, 10);
  assert.equal(e.estimated, true);
});

test('two records give one interval: still the chosen length', () => {
  const e = estimateCycle({
    records: [rec('2024-01-01'), rec('2024-01-31')], settings, today: '2024-02-05',
  });
  assert.equal(e.intervalsUsed, 1);
  assert.equal(e.basis, 'chosen_length');
});

test('2+ valid intervals: rounded average of recorded cycles', () => {
  // intervals 30, 30 -> 30
  const e = estimateCycle({
    records: [rec('2024-01-01'), rec('2024-01-31'), rec('2024-03-01')], settings, today: '2024-03-05',
  });
  assert.equal(e.basis, 'recorded_cycles');
  assert.equal(e.tooLittleHistory, false);
  assert.equal(e.intervalsUsed, 2);
  assert.equal(e.cycleLength, 30);
  assert.equal(e.nextEstimatedStart, '2024-03-31');
});

test('average rounds to the nearest day', () => {
  // intervals 28, 29 -> 28.5 -> 29
  const e = estimateCycle({
    records: [rec('2024-01-01'), rec('2024-01-29'), rec('2024-02-27')], settings, today: '2024-03-01',
  });
  assert.equal(e.cycleLength, 29);
});

test('invalid intervals (missed logging, too close) are ignored', () => {
  assert.deepEqual(validIntervals(['2024-01-01', '2024-01-08', '2024-05-01', '2024-05-29', '2024-06-26']), [28, 28]);
  const e = estimateCycle({
    records: [rec('2024-01-01'), rec('2024-01-08'), rec('2024-05-01'), rec('2024-05-29'), rec('2024-06-26')],
    settings, today: '2024-06-30',
  });
  assert.equal(e.intervalsUsed, 2);
  assert.equal(e.cycleLength, 28);
});

test('only the most recent 6 intervals count', () => {
  const starts = ['2024-01-01'];
  const gaps = [40, 40, 28, 28, 28, 28, 28, 28]; // the two 40s are older than the last 6
  for (const g of gaps) starts.push(addDaysLocal(starts.at(-1), g));
  const e = estimateCycle({ records: starts.map((s) => rec(s)), settings, today: starts.at(-1) });
  assert.equal(e.intervalsUsed, 6);
  assert.equal(e.cycleLength, 28);
});

test('records may arrive unsorted and are not mutated', () => {
  const records = [rec('2024-03-01'), rec('2024-01-01'), rec('2024-01-31')];
  const copy = JSON.parse(JSON.stringify(records));
  const e = estimateCycle({ records, settings, today: '2024-03-05' });
  assert.equal(e.lastPeriodStart, '2024-03-01');
  assert.equal(e.cycleLength, 30);
  assert.deepEqual(records, copy);
});

test('period duration: average of recorded durations when 2+, else chosen', () => {
  const two = estimateCycle({
    records: [rec('2024-01-01', '2024-01-04'), rec('2024-01-29', '2024-02-03')], settings, today: '2024-02-10',
  });
  assert.equal(two.periodDuration, 5); // (4 + 6) / 2
  const one = estimateCycle({ records: [rec('2024-01-01', '2024-01-07')], settings, today: '2024-02-10' });
  assert.equal(one.periodDuration, 5); // chosen
});

test('overdue: the estimate stays, flagged with the number of days', () => {
  const e = estimateCycle({ records: [rec('2024-05-01', '2024-05-05')], settings, today: '2024-06-02' });
  assert.equal(e.nextEstimatedStart, '2024-05-29');
  assert.equal(e.status, 'overdue');
  assert.equal(e.overdueDays, 4);
  assert.equal(e.daysUntilNextPeriod, -4);
});

test('inPeriod and cycleDay', () => {
  const during = estimateCycle({ records: [rec('2024-05-01', '2024-05-05')], settings, today: '2024-05-03' });
  assert.equal(during.inPeriod, true);
  assert.equal(during.cycleDay, 3);
  const after = estimateCycle({ records: [rec('2024-05-01', '2024-05-05')], settings, today: '2024-05-06' });
  assert.equal(after.inPeriod, false);
  // a period with no end date yet counts as ongoing for the usual duration
  const ongoing = estimateCycle({ records: [rec('2024-05-01')], settings, today: '2024-05-04' });
  assert.equal(ongoing.inPeriod, true);
  const ongoingTooLong = estimateCycle({ records: [rec('2024-05-01')], settings, today: '2024-05-09' });
  assert.equal(ongoingTooLong.inPeriod, false);
});

test('estimates cross leap day and year end correctly', () => {
  const leap = estimateCycle({ records: [rec('2024-02-10')], settings, today: '2024-02-12' });
  assert.equal(leap.nextEstimatedStart, '2024-03-09'); // 28 days, Feb has 29
  const yearEnd = estimateCycle({ records: [rec('2023-12-20')], settings, today: '2023-12-22' });
  assert.equal(yearEnd.nextEstimatedStart, '2024-01-17');
});

test('predictedRanges projects three cycles ahead', () => {
  const e = estimateCycle({ records: [rec('2024-05-01', '2024-05-05')], settings, today: '2024-05-10' });
  assert.deepEqual(predictedRanges(e), [
    { startDate: '2024-05-29', endDate: '2024-06-02' },
    { startDate: '2024-06-26', endDate: '2024-06-30' },
    { startDate: '2024-07-24', endDate: '2024-07-28' },
  ]);
});

test('actualRange: open period runs to today, capped at the usual duration', () => {
  const ctx = { periodDuration: 5, today: '2024-05-03' };
  assert.deepEqual(actualRange(rec('2024-05-01'), ctx), { startDate: '2024-05-01', endDate: '2024-05-03' });
  assert.deepEqual(actualRange(rec('2024-05-01'), { ...ctx, today: '2024-05-20' }), { startDate: '2024-05-01', endDate: '2024-05-05' });
  assert.deepEqual(actualRange(rec('2024-05-01', '2024-05-04'), ctx), { startDate: '2024-05-01', endDate: '2024-05-04' });
});

test('calendar: actual days are separate from predicted days', () => {
  const records = [rec('2024-05-01', '2024-05-05')];
  const may = buildCalendar({ records, settings, today: '2024-05-10', month: '2024-05' });
  const types = Object.fromEntries(may.days.map((d) => [d.date, d.type]));
  assert.equal(types['2024-05-01'], 'actual');
  assert.equal(types['2024-05-05'], 'actual');
  assert.equal(types['2024-05-06'], undefined);
  assert.equal(types['2024-05-29'], 'predicted');
  assert.equal(types['2024-05-31'], 'predicted'); // predicted period is 05-29..06-02
});

test('calendar: a prediction spanning month end appears in both months', () => {
  const records = [rec('2024-05-01', '2024-05-05')];
  const may = buildCalendar({ records, settings, today: '2024-05-10', month: '2024-05' });
  const june = buildCalendar({ records, settings, today: '2024-05-10', month: '2024-06' });
  assert.deepEqual(may.days.filter((d) => d.type === 'predicted').map((d) => d.date), ['2024-05-29', '2024-05-30', '2024-05-31']);
  assert.deepEqual(june.days.filter((d) => d.date <= '2024-06-02').map((d) => d.date), ['2024-06-01', '2024-06-02']);
});

test('calendar: actual overrides predicted on the same day', () => {
  // history says next ~05-29, but the user logged an actual period 05-27..05-31
  const records = [rec('2024-05-01', '2024-05-05'), rec('2024-05-27', '2024-05-31')];
  const may = buildCalendar({ records, settings, today: '2024-06-02', month: '2024-05' });
  const types = Object.fromEntries(may.days.map((d) => [d.date, d.type]));
  assert.equal(types['2024-05-29'], 'actual');
  assert.equal(types['2024-05-31'], 'actual');
});

test('calendar: no history means no days', () => {
  const c = buildCalendar({ records: [], settings, today: '2024-05-10', month: '2024-05' });
  assert.deepEqual(c.days, []);
  assert.equal(c.estimate.status, 'no_data');
});

test('calendar: February of a leap year', () => {
  const c = buildCalendar({ records: [rec('2024-02-27', '2024-03-02')], settings, today: '2024-03-03', month: '2024-02' });
  assert.deepEqual(c.days.map((d) => d.date), ['2024-02-27', '2024-02-28', '2024-02-29']);
});

function addDaysLocal(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
