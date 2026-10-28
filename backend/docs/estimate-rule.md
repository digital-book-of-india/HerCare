# The next-period estimate rule (version 1)

HerCare predicts the next period from the periods a user has recorded. **The phone must compute this
itself** (it works offline), and the server computes it too (`GET /api/user/cycle/estimate`, the
calendar, and reminder scheduling). Both have to give **identical** answers, or users would see
different dates on different screens.

This page is the rule in words. `estimate-test-vectors.json` has 27 inputs with the exact expected
outputs, generated from the server's code (`src/services/cycleEstimator.service.js`): **run your
implementation over every one and compare** before shipping. If the server's rule ever changes, that
file changes and a test fails until it is regenerated, which is your signal to update the phone.

> Nothing here is a medical claim. Every result is an **estimate** and must be shown as one. The app
> never shows ovulation, fertile days or pregnancy information, and never calls a cycle "irregular".

## Dates

- A date is a **calendar date** `YYYY-MM-DD`, never a timestamp. Count days by converting each date to a
  day number in UTC (for example `DateTime.utc(y, m, d)` divided by one day). **Never use local time**:
  a daylight-saving change would make a day 23 or 25 hours long and shift the result by one.
- `today` is the **user's local date** on the phone. (The server uses its UTC date unless the request
  carries `?date=`.)
- Adding days crosses month and year ends normally, including 29 February (see the vectors for leap
  years, 31 January + 28 days, and a year end).

## Inputs

| Input | Meaning |
|---|---|
| `records` | The user's **actual** periods: `startDate` and `endDate` (or no end date yet). Deleted ones are not included. In any order. |
| `settings.cycleLength` | The user's chosen cycle length in days (15 to 60, default 28). |
| `settings.periodDuration` | The user's chosen period length in days (1 to 15, default 5). |
| `today` | The user's local date. |

## Constants

| Name | Value |
|---|---|
| A cycle gap is valid when it is at least | 15 days |
| ...and at most | 60 days |
| Most recent valid gaps that are averaged | 6 |
| Valid gaps needed before the average is used | 2 |
| Longest period length ever used | 15 days |
| Future periods shown on the calendar | 3 |

## The rule

1. **Sort** the records by start date, oldest first.
2. **No records?** The status is `no_data`: there is no next date, `cycleLength` and `periodDuration`
   are the user's chosen values, `tooLittleHistory` is true, and `inPeriod` is false. Stop.
3. **Gaps.** For each pair of neighbouring records, the gap is `nextStart - previousStart` in days.
   **Keep only gaps from 15 to 60 days inclusive** (a longer gap is usually a forgotten period; a
   shorter one is probably a double entry). Then keep only the **last 6** of those.
4. **Cycle length.**
   - With **2 or more** kept gaps: the **average of the kept gaps, rounded to the nearest whole day, with
     .5 rounding up** (28 and 29 give 28.5, which becomes 29).
   - Otherwise: the user's chosen `cycleLength`, and `tooLittleHistory` is true.
   - `basis` is `recorded_cycles` or `chosen_length` accordingly; `intervalsUsed` is the number of kept
     gaps (even when that is 1 and the average is not used).
5. **Period length.** Take the records **that have an end date**, in order, and keep the **last 6**.
   Each length is `endDate - startDate + 1`. With **2 or more**: the average, rounded as above, and
   never more than **15**. Otherwise the user's chosen `periodDuration`.
6. **The estimate.** Let `last` be the record with the latest start date.
   - `nextEstimatedStart = last.startDate + cycleLength`
   - `nextEstimatedEnd = nextEstimatedStart + periodDuration - 1`
   - `daysUntilNextPeriod = nextEstimatedStart - today` (negative when it has passed)
   - `status` is `overdue` when that is negative, otherwise `upcoming`; `overdueDays` is how many days
     past it is (0 otherwise). **The estimate does not move** when the date passes: it stays, flagged
     overdue.
7. **Where the user is now.**
   - `cycleDay = (today - last.startDate) + 1`, or `null` when that is less than 1 (the last period
     starts in the future).
   - `inPeriod` is true when `last.startDate <= today <= lastEnd`, where `lastEnd` is `last.endDate`, or,
     for a period with no end date yet, `last.startDate + periodDuration - 1` (it is treated as lasting
     the usual length).

## The calendar

For a month, mark each day as `actual` or `predicted`:

- **Predicted:** for `i = 0, 1, 2`: a period starting at `nextEstimatedStart + i * cycleLength` and lasting
  `periodDuration` days. Nothing is predicted when there are no records.
- **Actual:** every record, from its start to its end date. A record with **no end date** runs from its
  start to today, but never longer than `periodDuration` days (and is just its start day if today is not
  after it).
- **Actual wins** over predicted on the same day.
- Only days inside the month are returned, sorted by date. A period that crosses a month end appears
  in both months.

## Things people get wrong

- **Rounding.** Round half **up** for positive numbers. Dart's `round()`, Kotlin's `roundToInt()` and
  Swift's `rounded()` all do. **Python's `round()` does not** (it rounds half to even): do not use it
  to check your work.
- **Filtering before averaging.** Drop invalid gaps first, then take the last 6 of what remains.
- **A gap of exactly 15 or 60 is valid; 14 and 61 are not.** There are vectors for both.
- **Sorting.** Never assume the records arrive in order.
- **Do not store predictions** as history. Only a period the user confirmed is a record.
- **Time zones.** Use the user's local date for `today`, and UTC day numbers for the arithmetic.

## Using the test vectors

`estimate-test-vectors.json` looks like this (shortened):

```json
{
  "rule": { "validCycleMinDays": 15, "validCycleMaxDays": 60, "recentGapsUsed": 6, "gapsNeededToAverage": 2, "predictedPeriodsOnCalendar": 3, "maxPeriodDays": 15 },
  "vectors": [
    {
      "name": "an_average_of_28_5_rounds_up",
      "input": { "today": "2026-03-01", "settings": { "cycleLength": 28, "periodDuration": 5 }, "records": [ { "startDate": "2026-01-01", "endDate": null }, "..." ] },
      "estimate": { "status": "upcoming", "cycleLength": 29, "nextEstimatedStart": "2026-03-28", "...": "..." },
      "calendar": [ { "month": "2026-03", "days": [ { "date": "2026-03-28", "type": "predicted" } ] } ]
    }
  ]
}
```

For every vector: run your estimate on `input` and require **every field** of `estimate` to be equal;
for each entry in `calendar`, compute that month and require the same list of days. Put this in your
unit tests so it runs on every build.

## Changing the rule

Don't, without a reason: the clinical reviewer has seen these numbers (see `clinical-review-process.md`).
If you must: change `src/services/cycleEstimator.service.js`, run `npm run docs:build` to regenerate
the vectors, raise the version at the top of this page, send the new vectors to the mobile developer,
and re-send the review sheet (`npm run review-sheet`) because the numbers on it changed.
