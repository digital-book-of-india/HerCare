# HerCare backend: backup and restore plan

## What has to be backed up

| What | Where it lives | Why it matters |
|---|---|---|
| The database | MongoDB (`hercare`) | All users' cycles, symptoms, reminders, checklists, and the admin's tips/content/settings |
| `ENCRYPTION_KEY` | server environment | **Without it every encrypted note is permanently unreadable.** |
| `JWT_SECRET`, `DBI_JWT_SECRET`, admin credentials | server environment | Needed to start the server and to accept DBI users' tokens |
| Application logs | log storage | They hold the `erasure:` lines used to repeat erasures after a restore |

**The encryption key must never be stored together with the database backups.** If it were, stealing
a backup would also reveal every note. Keep it in a secret manager, plus one offline copy (for
example a sealed printout or an encrypted USB key) held by a different person.

## Database backups

1. **Use a plan with real backups.** Atlas's free tier has none. For production use a paid cluster and
   turn on **Cloud Backup with point-in-time recovery**. Suggested retention: daily snapshots kept
   7 days, weekly for 4 weeks, nothing older than **30 days**.
2. **If you cannot use Atlas backups**, run `mongodump --uri "<MONGODB_URI>" --gzip --archive=hercare-<date>.gz`
   at least daily from a machine that is not the API server, then **encrypt the archive** (for example
   with `age` or GPG) before it leaves that machine, and keep copies in two places.
3. **Treat backups as production data.** Same access restrictions as the database; encrypted at rest;
   every access logged.
4. **Targets:** at most 24 hours of data lost (RPO) with daily dumps, minutes with point-in-time
   recovery; service restored within 4 hours (RTO). Measure the real figure in the first drill.

### Why 30 days at most
A backup still contains data a user later erased. Short retention limits how long that lasts; say so in
the privacy notice. The steps below make sure a restore never *revives* erased data.

## Restoring

Do this in a calm order. Do not point users at a half-restored database.

1. **Stop traffic.** Stop the API servers (or set `featureEnabled` to false in the admin panel if the
   current database is still reachable). Users keep working offline: the phones are local-first.
2. **Restore into a new database or cluster** (not over the damaged one, so you can compare). Note the
   exact **time the backup was taken**; step 5 needs it.
3. **Check it:** collection counts look right; open the admin dashboard after step 6.
4. **Rebuild indexes:** `npm run indexes`.
5. **Repeat the erasures that happened after the backup** (users who erased their data since must not
   reappear). First a dry run, then apply:
   ```
   npm run reapply-erasures -- --log <path-to-server-logs> --backup-time 2026-11-02T03:00:00Z
   npm run reapply-erasures -- --log <path-to-server-logs> --backup-time 2026-11-02T03:00:00Z --apply
   ```
   Only erasures *after* the backup time are repeated; earlier ones are already inside the backup.
6. **Tell the phones the data was restored.** Set a new `DATA_EPOCH` (for example
   `restored-2026-11-02`) in the server environment. Phones compare it on every sync; a phone that
   sees a different value resets its cursor and sends all of its data again. Because sync is
   last-write-wins by edit time, this safely fills in everything the restore lost without overwriting
   newer changes. (`resyncRequired: true` in the sync response.)
7. **Point the server at the restored database** (`MONGODB_URI`) and start it.
8. **Smoke test:** `GET /api/health` returns `db: "up"`; sign in to the admin panel; check the
   dashboard counts; sign in on a test phone and sync.
9. **Re-enable** the feature if you disabled it, and write down what happened and how long it took.

### If the encryption key is lost
The database can still be restored, but every note is gone for good (dates, symptoms and the rest
still work). Nothing can recover them. This is why the key has its own backup.

### If the key leaked
Rotate it: follow `key-rotation.md` (new key, `npm run rotate-key -- --apply`, verify). Backups made
before the rotation can still be read by anyone holding the old key, so let them expire or delete
them as soon as the restore plan allows. Keep the old key only as long as you might need to restore one.

## Rehearse it

Do a full restore drill **before launch and every quarter**: restore the latest backup into a scratch
database, run steps 4 and 5 (dry run), start a server against it, and check it. A backup that has
never been restored is only a hope.

## Quick reference

| Task | Command |
|---|---|
| Rebuild indexes | `npm run indexes` |
| Preview erasures to repeat | `npm run reapply-erasures -- --log <file> --backup-time <ISO time>` |
| Repeat them | same, plus `--apply` |
| Tell phones to re-send everything | change `DATA_EPOCH`, restart |
| Change the encryption key | `key-rotation.md` (`npm run rotate-key`) |
| Export one user's data (they can do this themselves) | `GET /api/user/export` |
