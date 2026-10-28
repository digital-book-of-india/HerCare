# HerCare Mobile

The mobile part of **HerCare Women**, inside the DBI app. **It has not been built yet.** The backend it talks
to is finished and documented.

**Start here: [backend/docs/mobile-integration-guide.md](../backend/docs/mobile-integration-guide.md).** Then
[sync-guide.md](../backend/docs/sync-guide.md) and [estimate-rule.md](../backend/docs/estimate-rule.md) (with
`estimate-test-vectors.json` to test your implementation against). The API reference is
`backend/docs/api/openapi.json`.

## What v1 is

A simple, free tracker that **works offline** (local database, local notifications) and syncs to the server.

| Screen | Contents |
|---|---|
| Welcome and consent | Short explanation, disclaimer and privacy text (from the server), notification permission asked at the right moment |
| Home | Next estimated period, current cycle status, quick actions: log period, log symptoms, self-care |
| Calendar | Month view; logged days look different from estimated days |
| History | Past periods; add, edit, delete |
| Daily log | Period start/end, flow, symptoms, mood, energy, optional note |
| Daily self-care | Hydration reminders, today's checklist, reviewed food and activity tips |
| Settings | Cycle and period length, reminders, export, erase, privacy |

## What v1 must not contain

Ovulation, fertile days or pregnancy information; calling a cycle irregular, normal or abnormal;
medical advice or diagnosis; a fixed amount of water; AI or chat; charts and "insights"; social
features; subscriptions. Every predicted date is shown as an **estimate**. See the product plan and the
clinical review sheet (`backend/docs/clinical-review-process.md`).

## Where the user comes from

There is no HerCare login. The user signs in to the DBI app; send DBI's token to the HerCare API.

## Suggested layout

- `src/assets/`: Images, icons, fonts.
- `src/components/`: Reusable UI (calendar, symptom chips, mood picker...).
- `src/context/`: State providers (cycle data, sync status, theme). The signed-in user comes from the DBI app.
- `src/navigation/`: Tabs and stacks.
- `src/screens/`: The screens in the table above.
- `src/services/`: Local database, the sync client, the API client, local notifications.
- `src/utils/`: The estimate rule (tested against the test vectors) and date helpers (UTC day counting).
