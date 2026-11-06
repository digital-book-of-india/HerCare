# Handoff notes

For anyone taking over the HerCare backend. Start with `README.md` in this folder for where
everything is. This page is the "why" and the "how do I".

## What was built

The backend for **HerCare Women**, a free period tracker that lives inside the DBI app: period history
and next-period estimates, a symptom and flow log, reminders, a daily self-care checklist with hydration
and reviewed tips, sync between the phone and the server, data export and erase, and an admin API
(dashboard, tips, default texts, on/off switch). It is a standalone Node.js service. The mobile app and
the admin panel are separate work that call it.

## How a request flows

```
 phone / admin panel
        │ HTTPS, JSON
        ▼
 app.js:  helmet · CORS · no-store · IP rate limit · body limit · unsafe-key check
        ▼
 routes ──► authenticateUser (DBI token)  or  authenticateAdmin
        │       └─ user routes: per-user rate limit · feature on/off gate
        ▼
 validators (express-validator) ──► validate.middleware.js
        ▼
 controllers  (thin: read the request, call a service, send the reply)
        ▼
 services     (all the logic: estimates, sync, reminders, tips, dashboard)
        ▼
 models (Mongoose) ──► MongoDB          errors ──► errorHandler.middleware.js (one format)
```

## Where things are

```
backend/
  src/
    app.js, server.js         the Express app; startup, graceful shutdown
    config/                   env.config.js (all settings, validated), db.config.js
    routes/                   user.routes.js, content.routes.js, admin/admin.routes.js
    controllers/ (+ admin/)   thin request handlers
    services/ (+ admin/)      the logic (cycleEstimator, period, sync*, reminder*, keyRotation, ...)
    models/                   Mongoose models (one per collection)
    plugins/sync.plugin.js    adds clientUpdatedAt + the sync index to every synced model
    middlewares/              auth, rate limits, sanitising, errors, validation, feature gate
    validators/               request rules per area
    utils/                    dates, cipher/encryption, logger, tokens, review sheet, postman, ...
    scripts/                  seed, indexes, rotate-key, reapply-erasures, review-sheet, docs, dev-token
    docs/                     the OpenAPI source and the estimate test cases (code that builds docs/)
  tests/                      offline tests (*.test.js)
  tests/api/                  live suites + runApi.script.js
  docs/                       everything you are reading
admin/                        reserved for the admin panel UI (not built)
mobile/                       reserved for the mobile app (not built)
context.md  (repo root)       the running project log: decisions, phases, API notes
```

## Decisions that shape the code, and why

- **DBI owns user accounts.** HerCare never stores passwords for users. It verifies DBI's JWT
  (`DBI_JWT_SECRET`, HS256) and uses the `id` inside as the owner of every record. Consequence: HerCare
  cannot revoke a user's access; a suspended DBI user keeps working until the token expires.
- **Admin is one predefined account** from the environment, not a database user, with its own token
  type, so DBI tokens can never act as admin.
- **Local-first with sync.** The product plan says the app works offline, so the phone computes the
  estimate itself and the server is the backup. Hence the sync protocol, phone-generated ids, and the
  shared estimate rule with test vectors.
- **Dates are `YYYY-MM-DD` strings and all date maths is UTC day counting.** This removes the whole
  class of time-zone and daylight-saving bugs. Never use `new Date()` arithmetic for calendar dates.
- **Predictions are computed, never stored.** Only user-confirmed periods are records.
- **The admin cannot see individual data.** There is no such route, tests fail if one appears, and the
  dashboard hides counts of 1 to 4.
- **Notes are encrypted per field; dates are not** (they must be queried and sorted).
- **Last write wins, by the time of the user's edit**, with two clocks (`clientUpdatedAt` decides
  conflicts, server `updatedAt` drives the pull cursor) so a wrong phone clock cannot hide changes.
- **Soft deletes** for periods, symptom logs and checklist items, so a deletion reaches other phones.
- **Health content is gated.** A tip needs a recorded clinical review before it can be activated, and
  editing a reviewed tip un-reviews it.
- **No AI and no third-party services** anywhere. All logic is plain code and fixed text.

## Conventions

- **Modern ES modules** (`import`/`export`, `async`/`await`); MongoDB only.
- **Every file is `<name>.<type>.js`:** `.config`, `.controller`, `.middleware`, `.model`, `.routes`,
  `.service`, `.util`, `.validator`, `.script`, `.plugin`, `.doc`; tests are `<name>.<type>.test.js`.
  Only `app.js` and `server.js` are exempt.
- **Controllers are thin; logic lives in services**, which are testable without HTTP.
- **One response format** for success and for errors; throw `ApiError` (see `utils/apiError.util.js`).
- **Never log request data.** Messages and ids only. A test fails if a logger call touches `req.body`
  and friends. Log lines that matter operationally: `security: ...`, `erasure: user=<id> at=<time>`.
- **Remove `.gitkeep`** from a folder once it holds real files.
- **Git ignore rules** live in four files: the root `.gitignore` plus one each in `backend/`, `admin/` and `mobile/` (the mobile rules must sit in `mobile/` to reach `mobile/android` and `mobile/ios`). `.env` files and database backups or exports are never committed; **lock files (`package-lock.json`) are**, because `npm ci` needs them; the generated files in `docs/` are committed too.

## Recipes

**Add an endpoint.** Service function → controller → validator rules → route in the right router (user
routes go after `authenticateUser`; mind the feature gate) → add it to `src/docs/openapi.doc.js` with an
example → `npm run docs:build`. `npm test` fails until the spec matches the routes.

**Add something users record and that must sync.** Model with a `user` field and `syncPlugin` (copy
`reminder.model.js`), call `registerUserOwnedModel` (so erase removes it), add it to
`SYNC_ENTITY_CONFIG` (`syncPull.service.js`), a handler in `syncPush.service.js`, a validation case in
`syncRules.service.js`, and to `ALL_MODELS` (`indexes.service.js`). Then extend the sync, export and
index suites.

**Add an encrypted field.** Declare it `{ type: String, set: encrypt, get: decrypt }`. Key rotation
finds it by itself.

**Change the estimate rule.** See the last section of `estimate-rule.md`. It touches the phone, the
vectors and the clinical review.

**Add a tip category or a symptom option.** Edit `src/utils/constants.util.js`, then the validators that
use it, the OpenAPI enums, and send the new wording to the reviewer (`npm run review-sheet`).

## Tests

| Run | What it proves |
|---|---|
| `npm test` (offline, seconds) | Date and estimate maths, reminder schedule, sync rules, encryption and key rotation logic, the privacy guards (admin cannot reach user data; nothing logs request data), config validation, **that the OpenAPI file matches the real routes**, that the generated docs are up to date, and that every setting and command is documented. |
| `npm run test:api` (live, a few minutes) | The real server and database: auth and permissions, the admin panel, periods, daily tracking, sync, export and erase, index use and uniqueness, the backup restore procedure, key rotation, security hardening (injection, forged tokens, brute force, rate limits, headers), and that the examples in the API docs are accepted by the server. |

Both are expected to be green before any release. The live tests need a seeded, otherwise empty test
database (`setup-guide.md`).

## Operations

`setup-guide.md` (run and deploy) · `backup-restore.md` · `key-rotation.md` · `security-review.md`
(including the go-live checklist) · `clinical-review-process.md`.

## Known limits (details in `security-review.md`)

- A suspended or deleted DBI user keeps access until their token expires (up to 30 days).
- Whoever holds DBI's JWT secret can act as any user.
- Cycle dates and symptom choices are not encrypted individually (only notes are).
- One shared admin account; no per-person audit trail beyond the logs, and no admin 2FA.
- Rate limits are per server instance, not shared.
- Backups keep erased data until they expire (keep retention at 30 days or less).
- The dashboard runs counting queries over whole collections: fine for thousands of users, cache it
  before hundreds of thousands.
- Any kind of DBI account (business, partner, admin) can use HerCare until `DBI_ALLOWED_ROLES` is set.
- Throughput has not been measured on a production-grade database (the free tier throttles).
- Deletion markers are never purged; they grow slowly.
- Verified on Node.js 20 and MongoDB Atlas only.

## Still open

| Item | Owner |
|---|---|
| Clinical review of the tips, disclaimer and privacy text; apply the answers (`clinical-review-process.md`) | the product owner / a clinician |
| Confirm the mobile app is local-first with sync (everything assumes so) | mobile developer and product owner |
| Build the mobile screens and the admin panel against this API | mobile developer; admin panel developer |
| Make production secrets, MongoDB with backups, HTTPS, and a restore drill (`security-review.md` checklist) | whoever deploys |
| Rotate the MongoDB password that was shared in chat during development | whoever owns the database |
| Decide whether suspended DBI users must lose HerCare access sooner (needs a small change in DBI) | DBI team |
| Privacy notice wording that matches how data is really stored (phone plus server, 30-day backups, erase) | product owner |

## People

The backend was built for the HerCare Women feature of the DBI app: backend by Sidd, mobile by Kundan,
DBI sign-in knowledge from Prabhjot. `context.md` at the repo root records the decisions in the order
they were made.
