// The test cases handed to the mobile developer. Their expected values are checked here against
// numbers worked out BY HAND, independently of the code that generated them, so a bug in the
// estimator cannot hide by also being baked into the vectors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimateVectors } from '../src/docs/estimateVectors.doc.js';

const { vectors, rule } = buildEstimateVectors();
const named = Object.fromEntries(vectors.map((v) => [v.name, v]));
const estimateOf = (name) => named[name].estimate;
const daysOf = (name, month) => named[name].calendar.find((c) => c.month === month).days;

test('the vectors are well formed', () => {
  assert.ok(vectors.length >= 25);
  assert.equal(new Set(vectors.map((v) => v.name)).size, vectors.length, 'duplicate vector name');
  for (const v of vectors) {
    assert.match(v.input.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(v.estimate.estimated, true, `${v.name}: every result is an estimate`);
    assert.deepEqual(JSON.parse(JSON.stringify(v)), v, `${v.name}: must survive JSON (no undefined)`);
    for (const month of v.calendar) {
      const dates = month.days.map((d) => d.date);
      assert.deepEqual(dates, [...dates].sort(), `${v.name}: calendar days are sorted`);
      assert.ok(dates.every((d) => d.startsWith(month.month)), `${v.name}: only days inside the month`);
      assert.ok(month.days.every((d) => d.type === 'actual' || d.type === 'predicted'));
    }
  }
});

test('the constants of the rule', () => {
  assert.deepEqual(rule, { validCycleMinDays: 15, validCycleMaxDays: 60, recentGapsUsed: 6, gapsNeededToAverage: 2, predictedPeriodsOnCalendar: 3, maxPeriodDays: 15 });
});

test('no records: no date, and it says there is too little history', () => {
  const e = estimateOf('no_records');
  assert.equal(e.status, 'no_data');
  assert.equal(e.nextEstimatedStart, null);
  assert.equal(e.tooLittleHistory, true);
  assert.equal(e.basis, 'none');
  assert.equal(e.inPeriod, false);
});

test('one period: the chosen length is used (1 May + 28 = 29 May)', () => {
  const e = estimateOf('one_period_uses_the_chosen_cycle_length');
  assert.equal(e.basis, 'chosen_length');
  assert.equal(e.nextEstimatedStart, '2026-05-29');
  assert.equal(e.nextEstimatedEnd, '2026-06-02'); // 5 days: 29, 30, 31 May, 1, 2 June
  assert.equal(e.daysUntilNextPeriod, 19); // from 10 May
  assert.equal(e.cycleDay, 10);
});

test('averaging', () => {
  assert.equal(estimateOf('one_gap_is_not_enough_to_average').basis, 'chosen_length');
  assert.equal(estimateOf('one_gap_is_not_enough_to_average').intervalsUsed, 1);
  assert.equal(estimateOf('two_gaps_are_averaged').cycleLength, 30);
  assert.equal(estimateOf('an_average_of_28_5_rounds_up').cycleLength, 29);
  assert.equal(estimateOf('an_average_of_28_5_rounds_up').nextEstimatedStart, '2026-03-28'); // 27 Feb + 29
  assert.equal(estimateOf('irregular_gaps_26_31_29_average_28_67_rounds_to_29').cycleLength, 29);
});

test('which gaps count', () => {
  const longGap = estimateOf('a_gap_over_60_days_is_ignored');
  assert.deepEqual([longGap.intervalsUsed, longGap.cycleLength], [2, 28]); // 28, 120 (ignored), 28
  const shortGap = estimateOf('a_gap_under_15_days_is_ignored');
  assert.deepEqual([shortGap.intervalsUsed, shortGap.cycleLength], [2, 28]); // 10 (ignored), 28, 28
  const edges = estimateOf('gaps_of_exactly_15_and_60_days_are_valid');
  assert.deepEqual([edges.intervalsUsed, edges.cycleLength], [2, 38]); // (15 + 60) / 2 = 37.5 -> 38
  const justOutside = estimateOf('gaps_of_14_and_61_days_are_not_valid');
  assert.deepEqual([justOutside.intervalsUsed, justOutside.cycleLength], [2, 28]); // only the two 28s
  const six = estimateOf('only_the_most_recent_six_gaps_count');
  assert.deepEqual([six.intervalsUsed, six.cycleLength], [6, 28]); // the two 40s fall outside the last six
});

test('overdue keeps the estimate and counts the days', () => {
  const e = estimateOf('overdue_by_four_days');
  assert.equal(e.nextEstimatedStart, '2026-05-29');
  assert.deepEqual([e.status, e.overdueDays, e.daysUntilNextPeriod], ['overdue', 4, -4]);
});

test('where the user is now', () => {
  const during = estimateOf('today_is_inside_the_period');
  assert.deepEqual([during.inPeriod, during.cycleDay], [true, 3]);
  assert.equal(estimateOf('the_day_after_the_period_ends').inPeriod, false);
  assert.equal(estimateOf('an_ongoing_period_counts_as_the_usual_length').inPeriod, true); // day 4 of 5
  assert.equal(estimateOf('an_ongoing_period_past_the_usual_length').inPeriod, false); // day 9
  const today = estimateOf('the_period_starts_today');
  assert.deepEqual([today.cycleDay, today.inPeriod], [1, true]);
  const tomorrow = estimateOf('the_last_period_starts_tomorrow');
  assert.deepEqual([tomorrow.cycleDay, tomorrow.inPeriod], [null, false]);
});

test('calendar arithmetic across month ends, leap years and year ends', () => {
  assert.equal(estimateOf('leap_year_february').nextEstimatedStart, '2024-03-09'); // 10 Feb + 28, February has 29 days
  assert.equal(estimateOf('not_a_leap_year_february').nextEstimatedStart, '2026-03-10'); // 10 Feb + 28, February has 28 days
  assert.equal(estimateOf('prediction_crosses_the_year_end').nextEstimatedStart, '2026-01-17'); // 20 Dec + 28
  assert.equal(estimateOf('prediction_from_the_31st').nextEstimatedStart, '2026-02-28'); // 31 Jan + 28
});

test('period length', () => {
  assert.equal(estimateOf('period_length_is_averaged_from_recorded_lengths').periodDuration, 5); // 4 and 6 days
  assert.equal(estimateOf('period_length_is_capped_at_15_days').periodDuration, 15); // two 20-day periods
  const own = estimateOf('the_users_own_cycle_and_period_length');
  assert.deepEqual([own.cycleLength, own.periodDuration, own.nextEstimatedStart, own.nextEstimatedEnd], [35, 7, '2026-06-05', '2026-06-11']);
});

test('records may arrive in any order', () => {
  const e = estimateOf('records_may_arrive_in_any_order');
  assert.equal(e.lastPeriodStart, '2026-03-01');
  assert.equal(e.cycleLength, 30); // gaps 30 and 29 -> 29.5 -> 30
});

test('calendars: actual days, predicted days, a period across a month end', () => {
  const may = daysOf('one_period_uses_the_chosen_cycle_length', '2026-05');
  assert.deepEqual(may.filter((d) => d.type === 'actual').map((d) => d.date), ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05']);
  assert.deepEqual(may.filter((d) => d.type === 'predicted').map((d) => d.date), ['2026-05-29', '2026-05-30', '2026-05-31']);
  const june = daysOf('one_period_uses_the_chosen_cycle_length', '2026-06');
  assert.deepEqual(june.map((d) => d.date), ['2026-06-01', '2026-06-02', '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30']);
  assert.ok(june.every((d) => d.type === 'predicted'));
  const feb = daysOf('leap_year_february', '2024-02');
  assert.equal(feb.at(-1).date, '2024-02-12', 'an ongoing period stops at today');
  assert.deepEqual(daysOf('prediction_crosses_the_year_end', '2026-01').slice(0, 2).map((d) => d.date), ['2026-01-17', '2026-01-18']);
});
