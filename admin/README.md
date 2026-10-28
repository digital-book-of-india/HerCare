# HerCare Admin Panel

This folder is reserved for the admin panel's user interface. **It has not been built yet.** The
backend it needs is finished and lives in `backend/` (everything under `/api/admin`).

**Read: [backend/docs/admin-panel-guide.md](../backend/docs/admin-panel-guide.md).** It lists the screens, the
endpoint behind each one, the limits, the error cases, and how each screen should behave. The full API
reference is `backend/docs/api/openapi.json`; a Postman collection with the admin requests is in
`backend/docs/api/hercare.postman_collection.json`.

## The five jobs

1. **Sign in** with the one predefined admin account (five failed attempts lock it for 15 minutes).
2. **Dashboard:** aggregate numbers only. A count of 1 to 4 arrives as the text `"<5"`.
3. **Tips:** write, record the clinician's review, then activate. A tip cannot go live without a review,
   and editing a reviewed tip clears the review.
4. **Texts:** the disclaimer (cannot be blank), the privacy text and the default checklist.
5. **Settings:** switch HerCare on or off, and set the default cycle and period length.

The panel **cannot and must not show any individual user's data**: no endpoint returns it, by design.

## Suggested layout

- `src/pages/`: Sign in, Dashboard, Tips, Texts, Settings.
- `src/components/`: Reusable UI.
- `src/services/`: A small client for `/api/admin/*` (sends the admin token, understands the error format).
- `src/utils/`: Helpers.
