# Mobile integration guide

For the developer building HerCare inside the DBI mobile app. Read this first, then
`sync-guide.md` and `estimate-rule.md`. The exact request and response shapes are in
`api/openapi.json` (open it in Swagger UI, or import `api/hercare.postman_collection.json` into
Postman).

## The shape of the system

```
 DBI app  ──(user signs in, DBI issues a token)──►  your HerCare screens
                                                         │  Authorization: Bearer <DBI token>
   local database (works offline) ◄──► sync ◄──────────► HerCare server ──► MongoDB
```

- **HerCare has no login of its own.** You send the **DBI user's token** on every request. The server
  trusts its signature and uses the `id` inside it as the owner of all data. Users cannot see each
  other's data.
- **Local-first.** Keep a local database and make every screen work offline. The server is a backup
  and the way data reaches a new phone (`sync-guide.md`). The only things you must fetch from the
  server are the **admin's content**: disclaimer, privacy text, tips, and the on/off switch.
- **You do not need to call most endpoints directly.** Everything the user records goes through
  `POST /api/user/sync`. The per-screen endpoints below exist for reading, for simple online use, and
  for the admin-controlled content.

## Run it locally

1. In `backend/`: copy `.env.example` to `.env`, fill it in, `npm install`, `npm run seed`, `npm run dev`
   (see `setup-guide.md`). The API is at `http://localhost:5000/api`.
   - Android emulator: use `http://10.0.2.2:5000/api`. iOS simulator: `http://localhost:5000/api`.
     A real phone: your computer's address on the same network.
2. Get a test token without DBI: `npm run -s dev-token` prints one (valid 24 hours). Use
   `-- --user <24 hex characters>` to be a particular user; two different ids are two different people.
   It refuses to run in production.
3. `GET /api/user/me` with `Authorization: Bearer <token>` should answer with your user id.
4. Try everything in Postman: import the collection, set `baseUrl` and `userToken`.

## Every response looks the same

Success: `{ "success": true, "message": "...", "data": { ... } }`
Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`

| HTTP | `error.code` | What it means, what to do |
|---|---|---|
| 400 | `BAD_REQUEST` | Something in the request is wrong; `details` lists `{ field, message }`. A bug on your side unless the user typed it. |
| 401 | `UNAUTHORIZED` | The DBI token is missing, expired, invalid, or has no expiry date. Refresh the DBI session (DBI's job), then retry **once**. Do not loop. |
| 403 | `FORBIDDEN` | This kind of DBI account may not use HerCare (the operators can restrict it). Hide the HerCare entry point for this account. |
| 404 | `NOT_FOUND` | No such record (or it is not this user's). |
| 409 | `DUPLICATE_PERIOD` | A period already starts on that date. Offer to edit the existing one. |
| 409 | `OVERLAPPING_PERIOD` | The period overlaps another. Ask the user; if they confirm, resend with `confirmOverlap: true`. |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 10 KB (2 MB for sync). Send less. |
| 429 | `RATE_LIMITED` | Too many requests. Wait for `RateLimit-Reset` seconds (response header), then retry with backoff. |
| 503 | `FEATURE_DISABLED` | The admin switched HerCare off. Hide or disable the HerCare entry point, keep local data, and still offer export and erase (those keep working). |
| 500 | `INTERNAL_ERROR` | Server fault. Retry later with backoff. |

Network errors and 5xx/429 are normal on a phone: queue the change locally and retry on the next sync.

## Dates and "today"

- Dates are **`YYYY-MM-DD` calendar dates**, never timestamps. Times of day are `HH:MM`, in the user's
  local time.
- **Send `?date=YYYY-MM-DD` (the phone's local date)** on every endpoint that accepts it (estimate,
  reminders, hydration, checklist, tips, self-care). Otherwise the server uses its own UTC date, which
  is yesterday or tomorrow for part of the day in many countries.
- Dates may be at most one day ahead of the server's UTC date, which covers every time zone.

## Screen by screen

| Screen (from the product plan) | What to use |
|---|---|
| **Welcome and consent** | `GET /api/content` (**no token needed**): `disclaimerText`, `privacyText`, `featureEnabled`. Show the text exactly as returned. Ask for the notification permission later, when the user first turns a reminder on. |
| **Home** | Next period, cycle status: compute the estimate **locally** (`estimate-rule.md`); online you may compare with `GET /cycle/estimate`. Quick actions: log period, log symptoms, self-care. |
| **Calendar** | Compute locally, or `GET /cycle/calendar?month=YYYY-MM`. `actual` days must look different from `predicted` ones (predicted = estimate). |
| **History** | Local list. Online equivalent: `GET /periods`. Add / edit / delete: see "Rules to enforce locally" below. |
| **Daily log** | `PUT /symptoms/{date}` replaces that day's entry. Allowed values are in the schema (symptoms, flow, mood, energy); nothing else is accepted. |
| **Daily self-care** | One call online: `GET /selfcare/today?date=` (checklist, hydration, tips). Offline: use local data plus the **cached tips** (below). |
| **Settings** | `GET/PATCH /settings` (cycle and period length), `GET/PATCH /reminders…`, `GET /export` (let the user save or share the file), `DELETE /data` (erase everything). |

## Rules to enforce locally

Because the phone works offline, check these before saving (the server enforces them too and will
reject a bad record at sync time):

- `startDate` must be a real date, not after tomorrow (UTC allowance). `endDate` not before `startDate`,
  not in the future, and the period at most **20 days**. Notes at most 500 characters.
- **Same start date as an existing period → don't create a second one**; open the existing one.
- **Overlapping another period → ask the user to confirm** before saving.
- Symptom log: at least one field filled; values only from the allowed lists.
- Checklist label 1 to 80 characters, at most 30 items. Reminder times `HH:MM`, at most 12 hydration times.

## Content that does NOT come through sync

Sync carries the user's own records. These come from the admin, so fetch and **cache** them:

- **Tips:** `GET /tips?date=` returns only tips that a clinician has approved. Refresh on app start and
  after each sync, cache the result, and filter by `inPeriod` yourself offline (the response tells you
  which are shown when). **The list is empty until the admin activates tips.** Activity tips have
  `optional: true, canSkip: true`: always offer "rest today / skip".
- **Disclaimer and privacy text:** `GET /api/content`. Cache it.
- **Default checklist:** on first run, call `GET /checklist/items` **once, before creating any item
  yourself**. The server copies the admin's defaults into the user's own list and returns them, with
  ids; store them locally like any other synced item. If you invent default items locally *and* call
  this later, the user will see duplicates.

## Reminders (notifications)

The server **stores preferences and computes the schedule; the phone schedules the notifications.**

1. The user changes a reminder: `PATCH /reminders/{type}`. All reminders start **off**.
2. Then (and after any period change, and on app start) call `GET /reminders/schedule?days=30&date=`.
   It returns `[ { type, date, time, text } ]`: exactly what should fire.
3. **Cancel every notification HerCare scheduled before, then schedule that list.** This is what stops
   a reminder for a period date the user later edited or deleted.
4. Show `text` as given. `time` is the user's local time; do no time-zone maths.
5. Show each reminder's `status` in settings (`disabled`, `paused`, `snoozed`, `active`). Also tell the
   user when the phone's notification permission is off or battery saving may delay reminders; the
   server cannot know.
6. Hydration reminders carry **no amount of water**. Never add one.

**Working offline.** The online schedule is the reference. To keep reminders right while offline, build the same list yourself:

| Reminder | Fires | Text |
|---|---|---|
| `period` | at `timeOfDay`, `leadDays` before each of the next 3 estimated period starts (only dates from today on) | `leadDays` 0: "Your period is estimated to start today." 1: "...to start tomorrow." otherwise "...to start in N days." |
| `daily_log` | every day at `timeOfDay` | "Time to log how you feel today." |
| `hydration` | every day at each time in `times` | "Time for a water break." |

Fire nothing for a reminder that is off or paused, and nothing on days up to and including `snoozedUntil`.

## What the screens must say

The clinical reviewer approves the **wording** (`clinical-review-process.md`). The backend supplies the
disclaimer, tips and notification texts, but **you write the rest of the words on screen**, so:

- Every predicted date is **"estimated"**. Never show it as fact.
- Never say a cycle is "irregular", "normal" or "abnormal", and never suggest a reason for a late period.
  When the estimate has passed, say how many days **late** it is and nothing more.
- Never show ovulation, fertile days or pregnancy information.
- Show the disclaimer on the welcome screen and in settings.
- If `tooLittleHistory` is true, say the estimate is based on the user's chosen cycle length and gets
  better as they log more.
- Any other health-related text that you hard-code is **not** covered by the review. List it and send it
  to the reviewer too.

## Data rights

- **Export:** `GET /export` gives a JSON file with everything. Offer "Save/Share my data".
- **Erase:** `DELETE /data` with body `{ "confirm": "DELETE ALL MY DATA" }`. It is permanent: ask twice.
  Then wipe the local database and set the cursor to null. Other phones wipe themselves on their next
  sync (`sync-guide.md`). The DBI account is not affected.
- Both keep working even when the admin has switched HerCare off.

## Definition of done

- [ ] Works fully offline for: logging periods, symptoms, checklist, hydration, reminders, estimates, calendar.
- [ ] The estimate matches **every** case in `estimate-test-vectors.json` (run it in unit tests).
- [ ] Sync follows `sync-guide.md`: cursor, paging, stale/conflict/erased handling, duplicate-period prompt, epoch and resync.
- [ ] Ids for periods and checklist items are generated on the phone (24 hex characters).
- [ ] Notifications are rebuilt from `GET /reminders/schedule` after every relevant change.
- [ ] Tips, disclaimer and privacy text are cached; the empty-tips case is handled.
- [ ] `FEATURE_DISABLED` and `RATE_LIMITED` are handled; export and erase still work when switched off.
- [ ] Every predicted date is labelled as an estimate; no forbidden wording (see above).
- [ ] The list of other hard-coded health texts has been sent to the clinical reviewer.

## Questions that need a human

- **Is the app really local-first with sync** (as built), or should it call the server for everything?
  Everything here assumes local-first, as the product plan says.
- **Who refreshes an expired DBI token** when HerCare gets a 401? (DBI's session code, not HerCare.)
