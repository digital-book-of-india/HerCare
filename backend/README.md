# HerCare Backend

The REST API for **HerCare Women**, a free period tracker inside the DBI app. Node.js 20+, Express 5,
MongoDB, modern ES modules. It recognises DBI users by their DBI token, stores their records, keeps phones
in sync, serves the admin-managed content, and backs the admin panel.

**Documentation: [docs/README.md](docs/README.md)** (start there: guides for the mobile developer, the admin
panel developer, whoever deploys it, and whoever maintains it).

## Quick start

```bash
npm install
cp .env.example .env     # fill it in: docs/setup-guide.md explains every setting
npm run seed             # default texts, checklist and draft tips
npm run dev              # http://localhost:5000
npm run -s dev-token     # a test user token, so you can try the API without DBI
```

`GET /api/health` should answer `"db": "up"`. To try every endpoint, import
`docs/api/hercare.postman_collection.json` into Postman.

## What it does

- **Period tracking:** history, next-period estimates (always labelled as estimates), calendar.
- **Daily tracking:** symptom and flow log, editable daily checklist, hydration marks, reminders (the
  server works out what to schedule; the phone schedules it), reviewed self-care tips.
- **Sync:** local-first phones push and pull in one call; newest edit wins; deletes and erasures propagate.
- **Data rights:** full export and permanent erase.
- **Admin API:** aggregate dashboard (never an individual's data), tips with a clinical-review gate,
  default texts, and the feature on/off switch.

## Folders

| Folder | Holds |
|---|---|
| `src/` | The application: `routes` → `controllers` → `services` → `models`, plus `middlewares`, `validators`, `utils`, `config`, `scripts` |
| `tests/` | Offline tests (`npm test`) |
| `tests/api/` | Live tests against a real server and database (`npm run test:api`) |
| `docs/` | All the documentation, and the generated API reference |

## Commands

| | |
|---|---|
| `npm run dev` / `npm start` | Run (with restart on change / normally) |
| `npm test` | Offline tests (seconds, no database needed) |
| `npm run test:api` | Live tests; needs a seeded, otherwise empty test database |
| `npm run seed`, `npm run indexes` | Prepare a database |
| `npm run docs:build` | Regenerate the API reference and estimate test cases |
| `npm run rotate-key`, `npm run reapply-erasures`, `npm run review-sheet` | Operations: see `docs/` |

The full table is in [docs/setup-guide.md](docs/setup-guide.md).

## Conventions

Every file is named `<name>.<type>.js` (`period.service.js`, `auth.middleware.js`), controllers stay thin,
logic lives in services, and nothing ever logs request data. [docs/handoff.md](docs/handoff.md) has the
reasoning and recipes for the common changes.
