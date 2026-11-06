# Setup, run and deploy

## You need

- **Node.js 20 or newer** and npm.
- **MongoDB**: a MongoDB Atlas cluster (recommended) or a local MongoDB. Production needs a plan **with backups** (`backup-restore.md`).
- The **DBI app's `JWT_SECRET`** (HerCare uses it to recognise DBI users).

## First run (about five minutes)

```bash
cd backend
npm install
cp .env.example .env        # then edit .env (next section)
npm run seed                # default texts, default checklist, draft tips
npm run dev                 # starts on http://localhost:5000, restarts on changes
```

Check it: `GET http://localhost:5000/api/health` should answer `"db": "up"`. Then
`npm run -s dev-token` prints a test user token (never available in production):
`GET /api/user/me` with `Authorization: Bearer <that token>` returns the user's id.

Generate secrets with:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Configuration (`backend/.env`)

Copy `.env.example`; it has the same list with comments. **Never commit `.env`** (it is git-ignored).
The server refuses to start if a required setting is missing or wrong, and tells you which.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `NODE_ENV` | no | `development` | Set `production` on the live server. Production enforces strong secrets, hides error details and turns off automatic index building. |
| `PORT` | no | `5000` | Port to listen on. |
| `MONGODB_URI` | **yes** | | MongoDB connection string, with the database name (for example `.../hercare`). |
| `CORS_ORIGIN` | no | none | Comma-separated browser origins allowed to call the API. A native mobile app needs none; leave empty. |
| `TRUST_PROXY` | no | none | How many reverse proxies are in front of the server (usually `1`). **Set it in production** or every user looks like one IP and shares one rate limit. |
| `JWT_SECRET` | **yes** | | Signs the admin's tokens. 32+ random characters in production. **Must differ from `DBI_JWT_SECRET`.** |
| `ADMIN_JWT_EXPIRES_IN` | no | `8h` | How long an admin sign-in lasts. |
| `DBI_JWT_SECRET` | **yes** | | **The DBI app's `JWT_SECRET`**, used to verify the tokens DBI issues to its users. In production it must be DBI's production value. |
| `DBI_ALLOWED_ROLES` | no | all kinds | Which kinds of DBI account may use HerCare, by the `role` in their token, comma-separated (for example `user`). DBI also has business, partner and admin accounts, all signed with the same secret; with this empty they can all use HerCare. A refused account gets `403`. |
| `ENCRYPTION_KEY` | **yes** | | 64 hex characters (32 bytes). Encrypts notes. **Back it up separately from the database**: lose it and every note is unreadable. |
| `ENCRYPTION_KEY_ID` | no | `k1` | The name of the current key, stored with every note. Use a new id when you change the key. |
| `ENCRYPTION_KEYS_OLD` | no | none | Retired keys that must stay readable, as `id:key,id:key`. See `key-rotation.md`. |
| `ADMIN_EMAIL` | **yes** | | The admin's email (the one predefined admin account). |
| `ADMIN_PASSWORD` | **yes** | | The admin's password. 12+ characters in production. |
| `DATA_EPOCH` | no | `1` | Change it after restoring the database from a backup so phones send their data again (`backup-restore.md`). |
| `RATE_LIMIT` | no | `600` | Requests per 15 minutes per IP address. |
| `USER_RATE_LIMIT` | no | `300` | Requests per 15 minutes per signed-in user. |
| `AUTH_RATE_LIMIT` | no | `5` | **Failed** admin sign-ins per 15 minutes before a lockout. |

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with automatic restart (development). |
| `npm start` | Start normally (production). |
| `npm test` | Offline tests: no database, no server needed. Fast. |
| `npm run test:api` | The live tests. Starts its own servers on ports 5055 and 5056 and talks to the database in `.env`. **Use a test database**: it needs the database seeded and with no other users' data (it counts them). `npm run test:api -- hardening` runs one suite. |
| `npm run seed` | Creates the default disclaimer, privacy text, checklist and the draft tips. Safe to repeat: nothing is overwritten. |
| `npm run indexes` | Builds the database indexes. **Run it on every deploy** (production does not build them on startup). |
| `npm run docs:build` | Regenerates `docs/api/openapi.json`, the Postman collection and `docs/estimate-test-vectors.json`. Run it after changing an endpoint or the estimate rule. |
| `npm run -s dev-token` | Prints a test user token for local development (refuses in production). |
| `npm run review-sheet` | Writes the clinical review sheet (`clinical-review-process.md`). |
| `npm run rotate-key` | Re-encrypts notes after a key change (`key-rotation.md`). |
| `npm run reapply-erasures` | After a restore, repeats erasures that happened since the backup (`backup-restore.md`). |

## The database

1. **Atlas:** create a database user with read and write on the `hercare` database only. Under *Network
   Access*, allow only your server's address (not "anywhere"). Put the connection string in `MONGODB_URI`.
2. `npm run seed` once, then `npm run indexes` whenever the code changes.
3. The seed puts in **draft** tips that nobody can see until a reviewer approves them and the admin
   activates them in the admin panel. Until then `GET /api/user/tips` is empty. That is intentional.

## Deploying

A checklist, then examples to adapt (test them on a staging server first).

1. Server with Node 20+, a process manager, and **HTTPS in front** (a reverse proxy or load balancer).
2. Set the environment (a `.env` file with restricted permissions, or your platform's secret store):
   `NODE_ENV=production`, `TRUST_PROXY=1`, strong `JWT_SECRET` and `ADMIN_PASSWORD`, DBI's real secret in
   `DBI_JWT_SECRET`, a **fresh** `ENCRYPTION_KEY` (and a copy of it somewhere safe), `MONGODB_URI`.
3. Each release:
   ```bash
   git pull
   npm ci --omit=dev
   npm run indexes
   <restart the process>
   ```
   then check `/api/health` and run a smoke test (sign in to the admin panel; sync from a test phone).
4. Point the load balancer's health check at `GET /api/health` (it is exempt from rate limits and
   returns 503 when the database is down).
5. Ship the application logs somewhere that outlives your backups: erasure requests are recorded in them
   (`backup-restore.md`).
6. Restrict `/api/admin` to a VPN or an IP allow-list.
7. Do the go-live checklist in `security-review.md`.

Example, PM2 (`ecosystem.config.cjs`):

```js
module.exports = {
  apps: [{
    name: 'hercare-api',
    script: 'src/server.js',
    cwd: '/srv/hercare/backend',
    instances: 1,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production', PORT: 5000, TRUST_PROXY: 1 },   // secrets come from .env, not from here
  }],
};
```

Example, nginx in front (terminates HTTPS):

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:5000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 2m;
}
```

### Running more than one server instance

It works, with two things to know. **Rate limits are counted per instance** (in memory), so with N
instances the real limits are about N times higher; use a shared store (for example Redis) if that
matters. The admin's on/off switch is cached for 10 seconds per instance. Everything else is stored in
MongoDB and is shared. For a rolling restart that changes the encryption key, follow the two-restart
procedure in `key-rotation.md`.

## Troubleshooting

| You see | Usually |
|---|---|
| `Missing required environment variables: ...` | `.env` is missing or incomplete. |
| `JWT_SECRET must be different from DBI_JWT_SECRET` | You copied the same value into both. They are different secrets. |
| `Failed to start: Server selection timed out` | Wrong `MONGODB_URI`, or the Atlas network allow-list does not include this machine. |
| Every user request is `401` | `DBI_JWT_SECRET` is not the DBI app's `JWT_SECRET`, the token is expired, it has no expiry date (HerCare refuses tokens that never expire), or it is not HS256. |
| User requests answer `403` | `DBI_ALLOWED_ROLES` is set and this account's `role` is not in it. |
| `GET /user/tips` is empty | No tip has been reviewed and activated yet. Intended. |
| `429 RATE_LIMITED` while testing | An old server is still running on that port with the default limits. Stop it; `npm run test:api` starts its own. |
| `npm run test:api`: "database is not seeded" / "already holds data" | Run `npm run seed`, and use an empty test database. |
| `Encrypted with key "k1", which is not configured` | The old key is missing from `ENCRYPTION_KEYS_OLD`. Add it back (`key-rotation.md`). |
| `dev-token refuses to run` | `NODE_ENV` is `production`. Intended. |
| Admin sign-in answers `429` | Five wrong passwords in 15 minutes. Wait, then use the right one. |
