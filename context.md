# HerCare Backend: Project Context

Single source of truth for the backend work. Update the status checkboxes as phases progress.

## Project
- **Product:** DBI HerCare, a free Women's Wellness & Period Tracker (HerCare Women feature).
- **Our role:** backend only (Sidd). Frontend/mobile is Kundan's and will be built later. The admin panel UI is built later too.
- **Deliverable now:** a standalone, API-only backend with user APIs and admin APIs.
- **No existing login or database.** We build auth and storage from scratch.

## Product scope (from the PDF), exactly 5 features
1. Period calendar and predictions (estimates, manual corrections)
2. Complete period history (actual vs predicted kept separate)
3. Reminders (lead time, time of day, pause/snooze/disable)
4. Symptom and flow log (cramps, headache, mood, energy, flow light/medium/heavy, notes)
5. Daily self-care (hydration reminders, editable daily checklist, fixed reviewed food/activity tips, "skip / rest today")

**Out of scope for v1:** AI/chatbot, paid APIs, fertility/pregnancy claims, PCOS diagnosis, social features, clinic integration, advanced analytics, employer dashboards, subscriptions.

## Admin panel: 5 essential features
1. Admin login (role-based)
2. Dashboard with aggregate stats only
3. Tips management (CRUD, activate/deactivate, reviewed date)
4. Default content (checklist items, disclaimer/privacy text)
5. Feature on/off switch and default cycle settings

**Privacy rule:** the admin never reads individual users' period or symptom data.

## Key decisions
- **Local-first with backend sync** (follows the PDF). The mobile app keeps a local DB and schedules notifications. The backend is the sync, backup and recovery layer plus the admin and content source. Pending confirmation with Kundan; if backend-first is chosen instead, drop the sync parts of Phase 5.
- **Stack:** Node.js 20+, Express 5, MongoDB (Mongoose), JWT, bcryptjs. Modern ES modules (import/export, async/await, ES2022+), no CommonJS. MongoDB only, no SQL.
- **No AI, no external APIs.** All logic is plain code.
- **Dates** are stored as plain calendar dates (`YYYY-MM-DD`) to avoid time-zone/DST bugs.
- **Predictions** are computed on request, never stored as actual history, and always labelled "estimated".
- **Reminders:** the phone schedules notifications. The backend stores preferences and recalculates times.
- **Encryption:** sensitive health fields are encrypted at field level (AES-256-GCM), set up in Phase 1.
- **No diagnosis** and no pregnancy/PCOS/fertility inference. No fixed water quantity for hydration.

## Architecture
```
Client (future mobile app / admin UI)
  -> Express app (helmet, CORS, rate limit, body parser)
  -> Routes (/api/auth, /api/user/*, /api/admin/*)
  -> Middlewares (authenticate -> adminOnly -> validate)
  -> Controllers (thin)
  -> Services (business logic: cycle estimator, reminders, checklist, tips, export/delete)
  -> Models (Mongoose / MongoDB)
  -> Central error handler (one response format)
```
- Controllers hold no logic; services do, so they are unit-testable.
- Every user route is scoped by the authenticated user's id.
- Admin routes live under `/api/admin` with a role check and aggregate-only queries.

## File naming convention
Every backend file is `<name>.<type>.js` in every folder: `.config`, `.controller`, `.middleware`, `.model`, `.routes`, `.service`, `.util`, `.validator`, `.script`, and tests as `<name>.<type>.test.js` (camelCase names, e.g. `cycleEstimator.service.js`, `adminAuth.controller.js`). Only the entry points `app.js` and `server.js` are exempt. Run `npm test` after renames.

## Folder layout
```
admin/                       Admin panel UI (future). README only for now.
mobile/                      Mobile app (future, Kundan).
backend/
  src/
    app.js, server.js
    config/                  env, db
    controllers/ (+ admin/)
    middlewares/
    models/
    routes/ (+ admin/)
    services/ (+ admin/)
    utils/
    scripts/                 seed
  tests/
  .env.example
```

## Response format
- Success: `{ "success": true, "message": "...", "data": {...} }`
- Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }`

## Working method
- One phase at a time, each ending in a testable result.
- Small commits on a feature branch, not on `main`.
- Packages are added only when a phase needs them, and we ask before installing.

---

# Phase plan

Status legend: `[ ]` not started, `[~]` in progress, `[x]` done.

## Phase 0: Alignment (about 1 day) `[ ]`
- Confirm local-first with backend sync (the recommendation) with Kundan and whoever assigned the task.
- Agree the API contract, the response format and the sync rules.
- Agree that the estimate rule is documented once and implemented identically in the app and the backend.
- Confirm the stack: Express, MongoDB and JWT.
- Agree that reminders are scheduled on the phone, and the backend only stores the preferences.
- **Output:** an API outline and a written estimate rule.

## Phase 1: Foundation and security `[x]`
1. `app.js`, `server.js`, the env config (`.env` and `.env.example`) and the MongoDB connection.
2. Security middleware: helmet, CORS, rate limiting and request size limits.
3. Validation middleware, a central error handler and one response format.
4. Field-level encryption for sensitive health data, set up now because the server holds it.
5. A logging rule that keeps health data out of logs.
6. A seed script for the first admin, default tips, default checklist items and default settings.
- **Done when:** the server runs, connects to the DB and returns consistent errors.

## Phase 2: Authentication and accounts `[x]` (revised: DBI owns user accounts)
Final scope, after the DBI team's decision:
1. User identity comes from the main DBI app. HerCare verifies DBI's JWT (`authenticateUser`) and keys every record by the DBI user id. No HerCare register/login/refresh/reset.
2. Admin login with a predefined email and password from `.env` (`authenticateAdmin`).
3. Ownership: every user route is scoped by `req.user.id`.
4. "Delete all my data" removes the user's HerCare data (via `userData.service.js`); the DBI account itself is untouched.
- **Done:** DBI users are recognised, the admin can log in, and anonymous calls to protected routes are rejected.

## Phase 3: Period tracking core `[x]`
1. Models: UserSettings, PeriodRecord. Each carries `updatedAt` and a soft-delete flag for sync.
2. Settings API.
3. Period CRUD with validation: end date after start, no duplicates, overlap detection with user confirmation, and old records never overwritten.
4. Cycle estimator service:
   - use the chosen cycle length at first
   - use the average of valid intervals once there is enough history
   - flag every result as "estimated"
   - return a "too little history" status
   - never store predictions as actual history
5. Estimate endpoint and a monthly calendar endpoint (actual vs predicted).
6. Unit tests for leap years, month-end, year-end and DST. Dates are stored as plain `YYYY-MM-DD`.
- **Done when:** a user can log periods and get a correctly labelled estimate.

## Phase 4: Daily tracking and content `[x]`
1. Models: SymptomLog, ChecklistLog, Reminder, TipContent.
2. Symptom and flow log API: cramps, headache, mood, energy, flow (light, medium, heavy), notes, fetched by date or range.
3. Daily checklist API: editable items, per-date completion, a fresh list each day, and past history kept.
4. Reminder preferences API: lead time, time of day, pause, snooze, disable, hydration times. It recalculates the schedule when a period record changes, and the phone schedules the notifications.
5. Tips API: read-only, with a category filter and the period-aware rule. Activity tips include "skip / rest today".
6. Disclaimer and privacy text endpoint.
- **Done when:** every feature in the PDF exists as an API.

## Phase 5: Sync and data control `[x]`
1. Sync endpoints: push local changes, pull changes since a timestamp.
2. Conflict rule, for example last-write-wins by `updatedAt`.
3. Soft deletes so a deletion on one device reaches the others.
4. Idempotent writes, so a retried sync doesn't create duplicates.
5. Full data export for a user.
6. Delete all data, which removes the server copy and revokes tokens.
- **Done when:** a user can restore their data on a new phone and nothing is lost on a retry.

## Phase 6: Admin backend (5 features) `[x]`
1. Admin login (reuses Phase 2).
2. Dashboard with aggregate stats only: users, logs, active reminders.
3. Tips management: create, edit, delete, activate and deactivate, set the reviewed date.
4. Default content: checklist items and disclaimer or privacy text.
5. Feature on/off switch and default cycle settings.
- **Privacy rule:** the admin never reads individual period or symptom data. Add a test that proves it.
- **Done when:** an admin can manage content and settings without access to individual health data.

## Phase 7: Hardening and testing `[x]`
1. Stricter rate limits on auth routes, input sanitising and an audit of the logs.
2. Pagination and indexes on user and date fields.
3. API tests for validation, overlaps, auth, permissions and sync.
4. A security and privacy review.
5. Backup and restore plan for the server database.

## Phase 8: Documentation and handoff `[x]`
1. API documentation (Swagger or Postman) for the future mobile and admin developers.
2. Written estimate rule and sync rules.
3. Setup guide: env variables, seed, run and deploy.
4. Clinical review of tip content by an external reviewer. Start this early because it's outside our control.
5. Handoff notes for Kundan and future developers.

## Dependencies
- Phase 1 comes before everything.
- Phase 2 is required for Phases 3-6.
- Phase 3 comes before Phase 4, and Phase 4 before Phase 5.
- Phase 6 needs the models from Phases 3-4.
- Phases 7-8 run at the end, but clinical review should start in Phase 4.

---

# Estimate rule (must be identical in the mobile app and the backend)
Implemented in `backend/src/services/cycleEstimator.service.js` (pure functions) and covered by `backend/tests` (29 tests, `npm test`).
1. Dates are plain `YYYY-MM-DD` strings; all math uses UTC day numbers (no time zones, no DST effects).
2. A **cycle interval** = days between two consecutive ACTUAL period start dates. It is **valid only if 15-60 days** (gaps from missed logging are ignored).
3. With **2 or more valid intervals**: cycle length = the **rounded average of the most recent 6 valid intervals**. Otherwise it is the user's chosen cycle length, and `tooLittleHistory = true`.
4. **Next estimated start = last actual start + cycle length.** It is always labelled an estimate (`estimated: true`). Predictions are never stored.
5. **Period duration** = rounded average of the last 6 recorded durations when 2+ exist, otherwise the user's chosen duration (max 15).
6. `nextEstimatedEnd = nextEstimatedStart + duration - 1`. If today is past the estimate, `status = overdue` and `overdueDays` is returned; the estimate itself is not changed.
7. A period with no end date counts as ongoing from its start to today, capped at the usual duration.
8. The calendar projects the next **3** estimated periods. Actual days always win over estimated days.
9. No ovulation, fertile-window or pregnancy output (out of scope).

# Phase 3 API (all under `/api/user`, DBI token required)
- `GET /settings`, `PATCH /settings` { cycleLength 15-60, periodDuration 1-15 }. Falls back to the admin defaults (`usingDefaults: true`).
- `POST /periods` { startDate, endDate?, notes?, confirmOverlap? }, `GET /periods?from&to&page&limit`, `GET|PATCH|DELETE /periods/:id`. PATCH with `endDate: null` clears the end date.
- `GET /cycle/estimate`, `GET /cycle/calendar?month=YYYY-MM` (days typed `actual` or `predicted`).
- Rules: same start date twice -> `409 DUPLICATE_PERIOD` (cannot be confirmed away, edit instead). Overlap -> `409 OVERLAPPING_PERIOD` with `details.overlapping`; resend with `confirmOverlap: true` to save anyway. Period max 20 days; dates may be at most 1 day ahead of server UTC. Edits touch only the targeted record. Delete is soft (`deletedAt`) so it can sync; a deleted start date can be logged again.
- Notes are encrypted at field level (AES-256-GCM). Dates are plain so they can be queried/sorted; protect them with Atlas encryption at rest.
- Verified: 29 unit tests + a 55-check live API run (validation, duplicate/overlap, estimate, calendar, pagination, edits, soft delete, isolation between two users).

# Phase 4 API (all under `/api/user`, DBI token required, except `/api/content`)
- **Symptom log:** `PUT /symptoms/:date` (replaces the whole day, so retries are safe; 201 first time, 200 after) with `symptoms[]` (cramps, headache, bloating, fatigue, nausea, back_pain, breast_tenderness, acne), `flow` (light/medium/heavy), `mood`, `energy` (low/medium/high), `note` (encrypted, max 500). `GET /symptoms/:date`, `GET /symptoms?from&to&page&limit`, `DELETE /symptoms/:date` (soft). Empty entries are rejected. Wellness logging only, nothing diagnoses.
- **Checklist:** the user's own items are copied from the admin defaults on first use. `GET|POST /checklist/items`, `PATCH|DELETE /checklist/items/:itemId` (max 30; delete is soft so past days keep the label). `GET /checklist?date=` (default today), `PUT /checklist/:date/items/:itemId` { completed }, `GET /checklist/history?from&to` (max 92 days). A new day is simply a new date with no ticks, so history is kept and no reset job exists.
- **Hydration:** `GET /hydration?date=`, `PUT /hydration/:date/:time` { done }. Only the user's own reminder times can be marked. No water quantity is ever stored or suggested.
- **Reminders:** `GET /reminders` (period, daily_log, hydration; all off by default; each has `status` = disabled | paused | snoozed | active), `PATCH /reminders/:type` with `enabled`, `paused`, `snoozeDays` (0-30; 0 cancels), `leadDays` 0-7 + `timeOfDay` (period), `timeOfDay` (daily_log), `times[]` (hydration). Settings that do not apply to a type are rejected.
- **Schedule for the phone:** `GET /reminders/schedule?days=1-90` computes the upcoming notifications `[ { type, date, time, text } ]` from the CURRENT period history on every call, so an edited or deleted period can never leave a stale reminder. The phone cancels its old notifications and schedules this list (call it after any period change and on app start). Times are the user's local time of day; the backend does no time-zone conversion.
- **Tips:** `GET /tips?category=food|activity`. Only tips that are `active` AND have `reviewedAt` are served. Tips with `showWhen: 'period'` are added only while a period is logged (`inPeriod`), a plain rule, not AI. Activity tips carry `optional` and `canSkip` so the app can offer "skip / rest today".
- **Self-care screen in one call:** `GET /selfcare/today?date=` returns `{ date, inPeriod, checklist, hydration, tips }`.
- **Public content:** `GET /api/content` (no token) returns `featureEnabled`, `disclaimerText`, `privacyText` for the welcome/consent screen.
- Optional `?date=YYYY-MM-DD` (the phone's local date) is accepted wherever "today" matters; dates may be at most 1 day ahead of server UTC.
- **Seeded tips are inactive placeholders** until the clinical review sets `reviewedAt` and `active` (Phase 6 admin screen). Until then `/tips` returns an empty list.
- Verified: 41 unit tests (`npm test`) and a 109-check live API run covering validation, replace/dedupe, encryption at rest, per-date checklist history, pause/snooze/disable, schedule recomputation after period edits/deletes, tip filtering, and isolation between users.

# Phase 5: sync protocol (the contract for the mobile app)
All under `/api/user`, DBI token required.

**`POST /sync`** body `{ since?, limit?, changes? }` does push then pull in one call.
- `since`: the `cursor` from the previous response (omit on a fresh install). `limit`: page size per record type (default 1000, max 2000).
- `changes`: `{ settings: {..}, periods: [..], checklistItems: [..], checklistLogs: [..], symptoms: [..], hydrationLogs: [..], reminders: [..] }`, max 500 records per list. Unknown keys are ignored.
- Response: `{ serverTime, cursor, hasMore, erasedAt?, push: { applied, unchanged, rejected, warnings }, changes: { same record types } }`. Store `cursor` for the next call; while `hasMore` is true, call again with the new cursor.

**Record shapes** (same in push, pull and export; every record has `clientUpdatedAt`, an ISO date-time of the user's last edit; pulled records also have server `updatedAt`):
- `periods`: `{ id, startDate, endDate|null, notes|null, deleted? }`
- `checklistItems`: `{ id, label, order, deleted? }`
- `checklistLogs`: `{ date, itemId, completed }` (key: date + itemId)
- `symptoms`: `{ date, symptoms[], flow, mood, energy, note, deleted? }` (key: date)
- `hydrationLogs`: `{ date, time, done }` (key: date + time)
- `reminders`: `{ type, enabled, paused, snoozedUntil, leadDays?, timeOfDay?, times? }` (key: type)
- `settings`: `{ cycleLength?, periodDuration? }` (one per user)
- **Ids for `periods` and `checklistItems` are generated on the phone** (24 hex characters, like a Mongo ObjectId), so records can be created offline and checklist ticks can point at their item. Everything else is keyed by date/type, so it needs no id.

**Conflict rule: last-write-wins by `clientUpdatedAt`.** Newer edit -> `applied`. Same time -> `unchanged` (that exact change was already applied, so retries are safe and never duplicate). Older -> rejected as `stale`, and the rejection carries `server` with the newer version, which the phone must adopt. A device clock more than 5 minutes ahead is clamped to server time. Edits made through the normal REST endpoints count as edits too.

**Why two clocks:** server `updatedAt` drives the pull cursor (a wrong phone clock can never hide a change from another phone); `clientUpdatedAt` decides conflicts.

**Deletes** (periods, symptoms, checklist items) are soft: send `{ id|date, deleted: true, clientUpdatedAt }`; other phones receive `deleted: true`. A later, newer edit restores the record. A fresh install (no `since`) is not sent deleted records.

**Per-record validation:** a bad record is rejected with `{ entity, key, reason: 'invalid', message }`; the rest of the request still applies. Other reasons: `stale`, `conflict` (that id belongs to another account or a parallel request won), `erased`.

**Warnings:** if two phones logged the same period offline, both are kept and `push.warnings` lists `duplicate_start` / `overlap` so the app can ask the user to tidy up (the server cannot ask).

**Hydration/checklist caveat:** a sync client should not call the REST checklist endpoints before its first sync, otherwise the server may copy its default items and the phone has its own too.

**`GET /export`**: a versioned JSON backup (`{ version: 1, exportedAt, data }`, decrypted, no deleted records) with a download filename header. Same shape as sync.

**`DELETE /data`** body `{ "confirm": "DELETE ALL MY DATA" }`: hard-deletes every HerCare record of the user. DBI's own account is untouched. DBI login tokens cannot be revoked from HerCare, so the user may keep using the app and starts again from empty. A small marker (timestamp only, kept up to 1 year) is stored: `sync` then returns `erasedAt`; **a phone whose last sync is older than `erasedAt` must wipe its local copy**, and anything last edited before the erase is rejected with reason `erased`, so another phone cannot restore it. Data created after the erase is accepted.

**Limits/ops:** the sync route accepts bodies up to 2 MB (all other routes 10 KB). `RATE_LIMIT` (default 300 per 15 min) and `AUTH_RATE_LIMIT` (default 20) can be raised for automated tests only.

**Verified:** 53 unit tests (`npm test`) and a 65-check live run: create/restore on a fresh phone, idempotent replay, last-write-wins (newer, older, equal, future clock, REST edit), deletes and restore, per-record validation, natural-key upsert, overlap warnings, incremental pull and paging, a 100 KB+ body, export, isolation (a user cannot take over another user's id), and erase (marker, old data refused, new data accepted).

# Phase 6: admin API (all under `/api/admin`)
Login: `POST /api/admin/auth/login` { identifier, password } (the predefined `ADMIN_EMAIL` / `ADMIN_PASSWORD`). Every other route needs `Authorization: Bearer <admin token>`. DBI user tokens, even with role admin, are refused.

1. **Login** (above) + `GET /me`.
2. **Dashboard:** `GET /dashboard` returns aggregates only: `users` (total, activeLast7Days, activeLast30Days), `records` (periods, symptomLogs, checklistItemsCompleted, hydrationRemindersDone), `activeReminders` (period, daily_log, hydration; enabled and not paused), `tips` (total, active, awaitingReview; exact, since tips are admin content), `feature.enabled`. **Any user-derived count of 1-4 is returned as the string `"<5"`** (0 and 5+ are exact) so a tiny number cannot point at one person. The admin UI must display either a number or `"<5"`.
3. **Tips:** `GET /tips?category&active&reviewed&page&limit`, `POST /tips` { category food|activity, title (1-100), text (1-500), showWhen always|period }, `GET|PATCH|DELETE /tips/:id`, `POST /tips/:id/review` { reviewedAt? YYYY-MM-DD (default today, not future), reviewedBy? }, `PATCH /tips/:id/active` { active }.
   - New tips start inactive and unreviewed. **A tip cannot be activated until it is reviewed** (409 `TIP_NOT_REVIEWED`).
   - **Editing the wording of a tip (category, title, text, showWhen) resets its review and takes it offline** (`reviewReset: true`); it must be reviewed and activated again. Saving unchanged wording keeps the review.
   - Titles are unique per category (409). Users only ever see tips that are active and reviewed.
4. **Default content:** `GET|PATCH /content` with `disclaimerText` (20-2000, cannot be blank), `privacyText` (20-4000), `defaultChecklistItems` [{ id (a-z, 0-9, hyphen), label }] (max 20, unique ids). Changing the default checklist affects NEW users only; existing users keep their own copy. The public `GET /api/content` serves these texts.
5. **Feature switch and defaults:** `GET|PATCH /settings` with `featureEnabled`, `defaultCycleLength` (15-60), `defaultPeriodDuration` (1-15). The defaults apply to users who have not set their own. **When `featureEnabled` is false every user route returns 503 `FEATURE_DISABLED`**, except `/me`, `GET /export` and `DELETE /data` (users can always take their data out or erase it). The switch is cached for up to 10 s across server instances (immediate on the instance that saved it). The admin panel keeps working while the feature is off.

**Privacy rule, enforced by tests:** the admin sees content, settings and aggregate numbers only. There is no admin route that returns a user's periods, symptoms, notes, reminders or checklist. `tests/adminAccess.routes.test.js` fails if (a) an admin route is added that is not on the allow-list, (b) a route path looks like user data, (c) a route is registered before the admin check, (d) the dashboard service calls `find/findOne/lean/distinct/...` or mentions health fields, (e) any other admin file imports a user-data model, or (f) a controller imports a model directly. I confirmed the tests catch a planted violation. The live run also scans every admin response for user ids and note text.

**Express 5 gotcha (fixed):** `req.query` is read-only, so validator conversions (`toInt`, `toBoolean`) on query strings were silently dropped (`reviewed=false` stayed the truthy string `"false"`, and `limit` came back as `"1"`). `validate.middleware.js` now copies the converted query values back. Use `.toInt()/.toBoolean()` on query params freely.

**Verified:** 63 unit tests (`npm test`) plus live runs: Phase 3 56, Phase 4 109, Phase 5 65, Phase 6 112 (dashboard exact counts and `<5` hiding, tip workflow, content, feature switch with data-rights exceptions, access control, privacy scan), DBI auth/admin 16. Every live suite cleans up after itself.

**Running the live suites yourself:** start the server with `RATE_LIMIT=5000` and `AUTH_RATE_LIMIT=5000` (they only exist for tests) and make sure no old server is still holding port 5000; a stale server with the default limits makes suites fail with `RATE_LIMITED`.

# Phase 7: hardening, tests and operations
Full write-ups: `backend/docs/security-review.md` (17 findings, controls, residual risks, go-live checklist) and `backend/docs/backup-restore.md` (backup plan, restore steps, drills).

**What changed in the code**
- **Rate limits** (per 15 min, all in `.env`): per IP `RATE_LIMIT` (600, runs BEFORE body parsing, `/api/health` exempt), per signed-in user `USER_RATE_LIMIT` (300, keyed by user id so phones sharing a carrier IP do not block each other), failed admin logins `AUTH_RATE_LIMIT` (5; successful logins never count; the correct password is also refused while locked). `TRUST_PROXY` = number of reverse proxies in front (production behind one proxy: `1`); without it all users look like one IP.
- **Input:** requests whose body/query contain `$`-keys, dotted keys, `__proto__`/`constructor`/`prototype`, or a repeated query parameter get 400. Oversized body -> 413 `PAYLOAD_TOO_LARGE`. Mongoose `strictQuery` is on.
- **Tokens:** HS256 is pinned for DBI and admin tokens. `JWT_SECRET` must differ from `DBI_JWT_SECRET` (server refuses to start otherwise). In production `JWT_SECRET` needs 32+ and `ADMIN_PASSWORD` 12+ characters.
- **Responses:** `Cache-Control: no-store` everywhere. `/api/health` returns 503 + `db: "down"` when the database is unreachable. Graceful shutdown on SIGTERM/SIGINT; unhandled errors log and exit.
- **Logs:** messages and ids only; the scrubber hides credentials, personal details and health fields. Failed/successful admin logins and every erasure are logged (`security: ...`, `erasure: user=<id> at=<iso>`).
- **Indexes/pagination:** `(user, updatedAt)` index on all 7 synced collections, unique `(category, title)` on tips. In production `autoIndex` is OFF: run `npm run indexes` at deploy. All lists are paginated or capped.
- **Restore support:** `npm run reapply-erasures -- --log <file> --backup-time <ISO> [--apply]` repeats erasures that happened after a backup. `DATA_EPOCH` (env, default `1`): returned as `epoch` in every sync response; a phone that sends a different `epoch` gets `resyncRequired: true` and must reset its cursor and send all local data again. Bump it after any restore.

**Sync contract additions (Kundan):** send `epoch` (the last value the server returned) with every sync; if the response has `resyncRequired: true`, reset the cursor to null, re-send ALL local records (500 per list per request), then store the new `epoch`.

**Commands**
- `npm test`: 159 offline unit/guard tests (dates, estimator, reminders, sync rules, privacy guards, unsafe keys, erasure log, logging, config).
- `npm run test:api`: starts its own servers (ports 5055 relaxed, 5056 strict), runs 10 live suites (558 checks): auth, admin, API reference, periods, daily, sync, indexes, restore, rotation, hardening. `npm run test:api -- hardening` runs one. Needs `.env`, a seeded database (`npm run seed`) and a database with NO other user data (use a test database).
- `npm run indexes`, `npm run seed`, `npm run reapply-erasures`.

**Verified:** 159 offline tests, 558 live checks (all passing), `npm audit` 0 vulnerabilities. I weakened the algorithm pin, the no-store header and the per-user limit on purpose and the hardening suite caught all three; the restore procedure is exercised by a real suite.

**Residual risks (see the review):** suspended DBI users keep access until their token expires; anyone with DBI's JWT secret can act as any user; dates are not field-encrypted; no encryption-key rotation tool; one shared admin account; backups keep erased data until they expire (keep retention at 30 days or less).

# Encryption key rotation and clinical review (added after Phase 7)
**Key rotation** (`backend/docs/key-rotation.md`): every encrypted note is stored as `<keyId>:<iv>:<tag>:<data>`; legacy 3-part values (written before key ids) are still readable. `.env`: `ENCRYPTION_KEY` (current), `ENCRYPTION_KEY_ID` (default `k1`), `ENCRYPTION_KEYS_OLD` (`k1:<hex>,k0:<hex>`: retired keys that stay readable). `npm run rotate-key` = dry run; `-- --apply` re-encrypts; `-- --verify` exits 1 if anything is unreadable or still on an old key. It finds encrypted fields from the models (`set: encrypt`), writes conditionally (never clobbers a concurrent edit), leaves timestamps alone, prints counts and record ids only, and leaves unreadable values untouched. Old backups need the old key until they expire. Only 16-byte GCM tags are accepted. Multi-server deploys need the two-restart procedure in the doc.

**Clinical review** (`backend/docs/clinical-review-process.md`): `npm run review-sheet` writes `docs/clinical-review-sheet.html` (print to PDF) and `.md` from the REAL content (tips in the database, disclaimer, privacy text, default checklist, option lists, notification texts, estimate settings), with decision boxes, nine questions, a sign-off block and a content fingerprint that changes if any approved wording changes. The seed now holds 9 draft tips (inactive, unreviewed). After sign-off, record each approval with `POST /api/admin/tips/:id/review { reviewedAt, reviewedBy }` and activate it. Sections 1 and 4 of the sheet describe intended app behaviour; the mobile app writes the words on screen and must match.

# Phase 8: documentation and handoff (done)
Everything lives in `backend/docs/`; **start at `backend/docs/README.md`** (a table of "you are X, read these").
- **Guides:** `mobile-integration-guide.md` (screen by screen, errors, offline, reminders, wording duties), `sync-guide.md` (protocol with examples), `estimate-rule.md` (the exact rule, with `estimate-test-vectors.json`: 27 cases generated from the real estimator and checked against hand-computed values), `admin-panel-guide.md`, `setup-guide.md` (every setting and command, deploy, troubleshooting), `handoff.md` (architecture, decisions and why, conventions, recipes, what is still open).
- **API reference:** `docs/api/openapi.json` (OpenAPI 3, 47 operations) and `docs/api/hercare.postman_collection.json`, both GENERATED by `npm run docs:build` from `src/docs/openapi.doc.js` and the estimate cases in `src/docs/estimateVectors.doc.js`. `npm run -s dev-token` prints a local test user token (refuses in production).
- **They cannot go stale:** `npm test` fails if the spec and the real routes differ, if the generated files are out of date, if an env var or npm script is undocumented, if a document links to or names a file that does not exist, if the index misses a file, or if a document contains a secret-looking value. The live suite `tests/api/docs.api.js` sends the spec's own examples to the server and checks every response against the documented schema, and fails if any documented operation was not exercised. I planted lies in the spec and faults in the docs on purpose and the tests caught every one.
- **READMEs fixed:** the root, mobile, admin and backend READMEs were scaffold text that promised ovulation/fertile days, sleep tracking and "insights" (all out of v1 scope); they now match the product plan and point at the docs.
- **Still open (see handoff.md):** clinical review; mobile app and admin panel UIs; production secrets, MongoDB backups, HTTPS and a restore drill; rotating the MongoDB password shared in chat; whether suspended DBI users need faster cut-off; privacy notice wording; rate limits are per server instance.

# Full re-audit (28 Oct 2026, after Phase 8)
A clean-room install (no node_modules, no .env, a brand-new empty database, only .env.example to go by) passed everything, then adversarial probes found real defects in what had been built, all fixed and covered by regression tests:
- **Sync was far too slow** (500 records: 41-69 s -> about 5 s): batched lookups, conflicts decided in memory, 20 parallel writes, duplicate-period warnings from one query (`syncPush.service.js`).
- **Pull paging could loop forever and lose records** when records shared a timestamp: pages now end on a whole millisecond (`syncPull.service.js`).
- **Double-tap created duplicate periods** (8 of 10 simultaneous requests): lower-id request keeps it, the other withdraws (`period.service.js`).
- **Anonymous callers made the server parse a 2 MB body**: the sync body is now read inside the route after sign-in (`app.js`, `user.routes.js`).
- **DBI tokens**: a token with no expiry is refused; ids must be exactly 24 hex; new `DBI_ALLOWED_ROLES` limits which DBI account kinds (user/business/partner/admin) may use HerCare, judged on the role the token claims (default unchanged: all kinds; 403 for others). **Needs a team decision.**
- Admin can no longer choose a tip's `_id`; failed/successful admin sign-ins log the caller's address; unused `bcryptjs` removed; package marked `private`.
- **Held up**: all 132 unauthenticated/wrong-token calls got 401; user B could not touch user A's data; 534 hostile requests caused no 5xx; logs contained no notes/tokens/secrets; the documented estimate rule and the code agree on 4000 random histories + 2000 calendars (independent implementation from the document, `tests/estimateRule.oracle.test.js`); date logic passes unchanged under 8 time zones (DST, UTC+14, UTC-11, half-hour offsets).
- **Still open / not verifiable here**: real DBI tokens and DBI's production secret; throughput on a production-grade database (free tier throttles; ~43 req/s measured); Node versions other than 20; self-hosted MongoDB; independent security review; clinical review; the mobile app and admin UI; `privacyOptions` and an age/suitability text (both named in the product plan, not built); API versioning (`/api/v1`) decided before the mobile app ships; CI, lint, metrics, deletion-marker purge.

# Progress log
- Admin folder created (`admin/`), with admin backend folders under `backend/src/*/admin/`.
- Backend packages installed: express, mongoose, dotenv, cors, bcryptjs, jsonwebtoken, helmet, express-rate-limit, express-validator, nodemon (dev).
- Phase 1-7 verified: DB connects (MongoDB Atlas, db `hercare`), seed runs, /api/health, 404 and bad-JSON errors use the standard format, encryption round-trips. Credentials live only in `backend/.env` (git-ignored). Remove `.gitkeep` from a folder once it has real files.
- Seeded tips stay inactive until clinical review marks them reviewed.

# Open questions
- Is the app local-first with sync (assumed) or backend-first? (Kundan / assigner)
- Who builds the admin panel UI, and when?
- DBI users who are suspended keep HerCare access until their token expires (we do not query DBI's database). Acceptable?

## Auth: how it works now
- **DBI app (read from `digital-book-of-indiav2/backend`):** users get a JWT `{ id, role }` signed with DBI's `JWT_SECRET` (30d), sent as `Authorization: Bearer <token>`. Users are in DBI's `User` model. DBI also issues a 5-minute `pending2FA` temp token with the same secret.
- **HerCare user routes** (`/api/user/*`): `authenticateUser` verifies the token with `DBI_JWT_SECRET` (must equal DBI's `JWT_SECRET`), rejects `pending2FA` tokens and non-ObjectId ids, and sets `req.user = { id, role }`. HerCare does not look in DBI's database, so a user suspended in DBI keeps access until the token expires.
- **HerCare admin** (`/api/admin/*`): `POST /api/admin/auth/login` checks the predefined `ADMIN_EMAIL` / `ADMIN_PASSWORD` (constant-time) and issues an admin JWT (our `JWT_SECRET`, audience `hercare-admin`, `ADMIN_JWT_EXPIRES_IN`, default 8h). `authenticateAdmin` guards everything else. Tokens do not cross over: DBI tokens (even with role admin) are rejected on admin routes, and admin tokens are rejected on user routes.
- `GET /api/user/me` lets the frontend confirm its DBI token is accepted.
- **Per-user models** must have a `user` field holding the DBI id as an ObjectId, and call `registerUserOwnedModel(Model)` from `services/userData.service.js`. Phases 3-4 must do this.
- **Production:** set `DBI_JWT_SECRET` to the production DBI `JWT_SECRET` (the dev value is DBI's test secret). Use a long random `JWT_SECRET` and a strong `ADMIN_PASSWORD`.
- Verified by a 16-check scripted run against the live server (all pass).
- Removed on purpose: HerCare register/login/refresh/forgot/reset/delete-account endpoints, the `User` and `RefreshToken` models, and password-reset delivery (DBI owns accounts).
