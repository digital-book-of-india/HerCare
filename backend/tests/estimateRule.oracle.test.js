// The mobile developer will implement the estimate from docs/estimate-rule.md, not from our code.
// This test does the same thing: it implements the rule a SECOND time, directly from the wording of
// that page and sharing nothing with the server's code (its own date arithmetic, its own loops), then
// compares the two on thousands of random histories. If the page and the code ever disagree, this fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCycle, buildCalendar } from '../src/services/cycleEstimator.service.js';

// ---------------------------------------------------------------- the rule, as written in the document
const DAY = 86_400_000;
const num = (date) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
const text = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const roundHalfUp = (x) => Math.floor(x + 0.5);
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

const oracleEstimate = ({ records, settings, today }) => {
  const sorted = [...records].sort((a, b) => num(a.startDate) - num(b.startDate));
  if (sorted.length === 0) {
    return {
      status: 'no_data', basis: 'none', tooLittleHistory: true, intervalsUsed: 0, cycleLength: settings.cycleLength,
      periodDuration: settings.periodDuration, lastPeriodStart: null, nextEstimatedStart: null, nextEstimatedEnd: null,
      daysUntilNextPeriod: null, overdueDays: 0, cycleDay: null, inPeriod: false,
    };
  }

  // 3. gaps: neighbouring start dates, keep 15..60 days inclusive, then the last 6 of those
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) gaps.push(num(sorted[i].startDate) - num(sorted[i - 1].startDate));
  const kept = gaps.filter((g) => g >= 15 && g <= 60).slice(-6);

  // 4. cycle length
  const averaged = kept.length >= 2;
  const cycleLength = averaged ? roundHalfUp(average(kept)) : settings.cycleLength;

  // 5. period length: records that have an end date, last 6, each end - start + 1
  const lengths = sorted.filter((r) => r.endDate).map((r) => num(r.endDate) - num(r.startDate) + 1).slice(-6);
  const periodDuration = lengths.length >= 2 ? Math.min(15, roundHalfUp(average(lengths))) : settings.periodDuration;

  // 6. the estimate
  const last = sorted[sorted.length - 1];
  const nextStart = num(last.startDate) + cycleLength;
  const daysUntil = nextStart - num(today);

  // 7. where the user is now
  const cycleDay = num(today) - num(last.startDate) + 1;
  const lastEnd = last.endDate ? num(last.endDate) : num(last.startDate) + periodDuration - 1;

  return {
    status: daysUntil < 0 ? 'overdue' : 'upcoming',
    basis: averaged ? 'recorded_cycles' : 'chosen_length',
    tooLittleHistory: !averaged,
    intervalsUsed: kept.length,
    cycleLength,
    periodDuration,
    lastPeriodStart: last.startDate,
    nextEstimatedStart: text(nextStart),
    nextEstimatedEnd: text(nextStart + periodDuration - 1),
    daysUntilNextPeriod: daysUntil,
    overdueDays: daysUntil < 0 ? -daysUntil : 0,
    cycleDay: cycleDay >= 1 ? cycleDay : null,
    inPeriod: num(today) >= num(last.startDate) && num(today) <= lastEnd,
  };
};

// The calendar section of the document
const oracleCalendar = ({ records, settings, today, month }) => {
  const estimate = oracleEstimate({ records, settings, today });
  const [year, mon] = month.split('-').map(Number);
  const first = Date.UTC(year, mon - 1, 1) / DAY;
  const last = Date.UTC(year, mon, 0) / DAY;
  const marks = new Map();
  const mark = (from, to, type) => { for (let n = Math.max(from, first); n <= Math.min(to, last); n += 1) marks.set(n, type); };

  if (estimate.nextEstimatedStart) {
    for (let i = 0; i < 3; i += 1) {
      const start = num(estimate.nextEstimatedStart) + i * estimate.cycleLength;
      mark(start, start + estimate.periodDuration - 1, 'predicted');
    }
  }
  for (const r of records) {
    const start = num(r.startDate);
    let end;
    if (r.endDate) end = num(r.endDate);
    else if (num(today) > start) end = Math.min(num(today), start + estimate.periodDuration - 1);
    else end = start;
    mark(start, end, 'actual'); // marked after the predictions, so actual wins
  }
  return [...marks.entries()].sort(([a], [b]) => a - b).map(([n, type]) => ({ date: text(n), type }));
};

// ---------------------------------------------------------------- random histories
let seed = 20261028;
const random = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = (list) => list[random(list.length)];

const randomCase = () => {
  const count = random(13);
  let cursor = num('2023-01-01') + random(400);
  const records = [];
  for (let i = 0; i < count; i += 1) {
    const startDate = text(cursor);
    const endDate = random(3) === 0 ? null : text(cursor + random(20)); // up to 20 days, like the server allows
    records.push({ startDate, endDate });
    cursor += pick([random(14) + 1, random(30) + 15, 28, 28, 29, 30, 15, 60, 61, 14, random(120) + 1]); // good and bad gaps
  }
  for (let i = records.length - 1; i > 0; i -= 1) { const j = random(i + 1); [records[i], records[j]] = [records[j], records[i]]; }
  const lastStart = records.length ? Math.max(...records.map((r) => num(r.startDate))) : num('2024-01-01');
  return {
    records,
    settings: { cycleLength: 15 + random(46), periodDuration: 1 + random(15) },
    today: text(lastStart - 5 + random(100)),
    month: `${2023 + random(4)}-${String(1 + random(12)).padStart(2, '0')}`,
  };
};

test('the document and the code agree on 4000 random histories', () => {
  let ran = 0;
  const kinds = { no_data: 0, overdue: 0, upcoming: 0, averaged: 0, inPeriod: 0 };
  for (let i = 0; i < 4000; i += 1) {
    const input = randomCase();
    const expected = oracleEstimate(input);
    const actual = estimateCycle(input);
    const { estimated, ...comparable } = actual;
    assert.equal(estimated, true);
    assert.deepEqual(comparable, expected, `case ${i}: ${JSON.stringify(input)}`);
    ran += 1;
    kinds[expected.status] += 1;
    if (expected.basis === 'recorded_cycles') kinds.averaged += 1;
    if (expected.inPeriod) kinds.inPeriod += 1;
  }
  assert.equal(ran, 4000);
  // the random cases must really exercise every branch, or this test proves little
  assert.ok(kinds.no_data > 50 && kinds.overdue > 200 && kinds.upcoming > 200 && kinds.averaged > 500 && kinds.inPeriod > 100, JSON.stringify(kinds));
});

test('the document and the code agree on the calendar for 2000 random histories', () => {
  let withDays = 0;
  for (let i = 0; i < 2000; i += 1) {
    const input = randomCase();
    const expected = oracleCalendar(input);
    const actual = buildCalendar(input).days;
    assert.deepEqual(actual, expected, `case ${i}: ${JSON.stringify(input)}`);
    if (expected.length > 0) withDays += 1;
  }
  assert.ok(withDays > 300, `only ${withDays} of the cases had any marked days`);
});
