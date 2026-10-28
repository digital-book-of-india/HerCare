# Admin panel guide

For whoever builds the HerCare admin panel (the folder `admin/` is reserved for it). The backend for
it is finished: everything lives under `/api/admin`. Exact shapes: `api/openapi.json` (the "Admin: ..."
sections). Try it in Postman: sign in once with "Sign in as the admin" and the collection stores the
token for you.

## What the panel is for

Five jobs, and nothing else: **sign in, see the numbers, manage tips, edit the default texts, and
switch the feature on or off**. By design it **cannot show any individual user's data**: there is no
endpoint for periods, symptoms, notes or reminders. Please don't ask for one; it is a privacy rule that
tests enforce.

## Signing in

`POST /api/admin/auth/login` with `{ "identifier": "<admin email>", "password": "..." }`. The admin is
one predefined account set on the server (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).

- You get a token valid for **8 hours**. Send it as `Authorization: Bearer <token>`. On a `401`, go back
  to the sign-in screen.
- **Five failed attempts lock sign-in for 15 minutes**, even for the right password (`429 RATE_LIMITED`).
  Show "Too many attempts, try again later". An admin who is already signed in is not affected.
- User tokens from the DBI app do not work here, and admin tokens do not work in the app.
- Keep the token in memory or a short-lived session, not in long-term storage.

## Screens and the endpoints behind them

| Screen | Endpoints |
|---|---|
| **Sign in** | `POST /admin/auth/login`, `GET /admin/me` |
| **Dashboard** | `GET /admin/dashboard` |
| **Tips** (list, editor, review) | `GET/POST /admin/tips`, `GET/PATCH/DELETE /admin/tips/{id}`, `POST /admin/tips/{id}/review`, `PATCH /admin/tips/{id}/active` |
| **Texts** (disclaimer, privacy, default checklist) | `GET/PATCH /admin/content` |
| **Settings** (on/off, defaults) | `GET/PATCH /admin/settings` |

### Dashboard

Totals only: users, how many were active in the last 7 and 30 days, how many periods, symptom logs,
completed checklist items and hydration marks, how many reminders of each kind are on, and tip counts.

- **A count of 1 to 4 arrives as the text `"<5"`**, not a number. Display it as it is. This hides tiny
  numbers that could point at one person. A `0` or a number of 5 or more is exact.
- Tip counts are exact (tips are the admin's own content).
- The numbers are computed live; refresh on a button, not every second.

### Tips

A tip has a **type** (`food` or `activity`), a **title** (up to 100 characters), a **text** (up to 500)
and **when it shows** (`always`, or `period` = only while the user has a period logged).

The workflow the screens should make obvious:

```
 write ──►  Draft (hidden)  ──► a clinician approves it ──► Record the review ──► Activate ──► Live
            POST /tips                                       POST /review         PATCH /active
```

- A new tip is a **Draft**: hidden from users.
- **Record the review** with the clinician's name and the date they signed (`reviewedBy`, `reviewedAt`).
  The date can't be in the future.
- **Activate** shows it to users. **A tip that has not been reviewed can't be activated** (`409
  TIP_NOT_REVIEWED`): disable the button and say why.
- **Editing the wording of a reviewed or live tip clears the review and takes it offline** (the answer
  says `reviewReset: true`). Warn before saving ("This will need a new review and will be hidden
  until then"). Saving without changing the wording keeps the review.
- Titles must be unique within a type (`409 CONFLICT`).
- Deleting removes the tip for good: confirm first.
- Useful list filters: `?reviewed=false` ("waiting for review"), `?active=true` ("live").

A status label for each row works well: **Draft** (not reviewed), **Reviewed, hidden**, **Live**.

### Texts

`GET /admin/content` and `PATCH /admin/content` (send only what changed).

- **Disclaimer:** 20 to 2000 characters. It **cannot be blank**.
- **Privacy text:** 20 to 4000 characters.
- **Default checklist:** up to 20 items, each with a short id (lowercase letters, digits and hyphens,
  unique) and a label up to 80 characters.
- Tell the admin that **changing the default checklist only affects users who sign up afterwards**; existing
  users keep their own lists.
- Changing the disclaimer or privacy text isn't blocked by the review gate, so remind the admin that
  these texts are part of the clinical review.

### Settings

- **HerCare on/off** (`featureEnabled`). Off means every user screen in the app gets `FEATURE_DISABLED`
  until it is turned on again; users can still export or erase their data. **Ask for confirmation**
  before switching it off.
- **Default cycle length** (15 to 60) and **default period length** (1 to 15): used for users who have not
  chosen their own.
- The change takes effect within about 10 seconds on every server.

## Errors you will see

Same envelope as everywhere: `{ success: false, error: { code, message, details } }`. For forms, put
each `details[].message` next to its `field`. The codes you need: `BAD_REQUEST` (400, fix the input),
`UNAUTHORIZED` (401, sign in again), `NOT_FOUND` (404), `CONFLICT` and `TIP_NOT_REVIEWED` (409),
`RATE_LIMITED` (429).

## Hosting note

Put the panel (and `/api/admin`) behind a VPN or an IP allow-list in production: it is a single shared
account. See `security-review.md`.
