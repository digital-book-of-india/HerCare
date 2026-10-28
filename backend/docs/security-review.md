# HerCare backend: security and privacy review

Reviewed on 28 Oct 2026 against the code as of Phase 7. The data is sensitive (menstrual cycles,
symptoms, mood, free-text notes), so the bar is higher than for a normal app.

**Method:** read every route, middleware and service; `npm audit`; searched the repository for
leaked secrets and for any log line that touches request data; attacked the running API (injection,
forged tokens, brute force, flooding, oversized bodies); checked query plans against the real
database. Everything below that says "tested" is covered by `npm test` (159 offline tests) or
`npm run test:api` (558 live checks across 10 suites).

## 1. Findings from this review

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Behind a proxy or load balancer every user would share one IP, so the per-IP rate limit could lock out everyone | High | **Fixed**: `TRUST_PROXY` setting, plus a per-user limit keyed by user id. Tested. |
| 2 | Rate limiting ran after request bodies were parsed, so floods of large bodies cost full parsing | Medium | **Fixed**: the IP limiter now runs first. Tested (a 20 KB body gets 429, not 413). |
| 3 | Successful admin logins counted toward the login limit while failed ones were not distinguished | Medium | **Fixed**: only failed attempts count; 5 failures lock the door for 15 minutes. Tested, including that the correct password is also refused while locked. |
| 4 | `JWT_SECRET` could be set equal to DBI's secret, letting anyone who can sign DBI tokens sign admin tokens | High | **Fixed**: the server refuses to start if they are equal. Tested. |
| 5 | Weak secrets were accepted in production | Medium | **Fixed**: in production `JWT_SECRET` needs 32+ and `ADMIN_PASSWORD` 12+ characters. Tested. |
| 6 | The JWT algorithm was not pinned | Medium | **Fixed**: HS256 only, for DBI and admin tokens. `alg: none` and HS512 tokens are refused. Tested. |
| 7 | Responses could be cached by browsers, proxies or CDNs | Medium | **Fixed**: `Cache-Control: no-store` on every response, including errors. Tested. |
| 8 | Nothing stopped `$where` / `a.b` / `__proto__` keys or repeated query parameters from reaching the code | Medium | **Fixed**: such requests are refused with 400. Tested, including `JSON.parse`d `__proto__` and 100,000-level nesting. |
| 9 | The sync pull query had no `(user, updatedAt)` index, so it would scan a collection | Medium | **Fixed**: index added to all 7 synced collections. Verified with query plans (`indexes.api.js`). |
| 10 | Tip title uniqueness was only checked in code (two parallel requests could create duplicates) | Low | **Fixed**: unique database index. Tested. |
| 11 | `/api/health` said "ok" even when the database was down | Low | **Fixed**: returns 503 when the database is unreachable; exempt from rate limits. |
| 12 | No graceful shutdown; an unhandled rejection left the process in an unknown state | Low | **Fixed**: SIGTERM/SIGINT finish in-flight requests and close the database; unhandled errors log and exit so the supervisor restarts the process. |
| 13 | Oversized bodies returned a generic error code | Low | **Fixed**: 413 `PAYLOAD_TOO_LARGE`. Tested. |
| 14 | The log scrubber missed some personal fields (email, labels, times, free text) | Low | **Fixed** and tested. |
| 15 | Restoring a backup would silently bring back data users had erased | High (privacy) | **Fixed**: erasures are written to the application log; `npm run reapply-erasures` repeats them after a restore. See `backup-restore.md`. Parser unit-tested. |
| 16 | After a restore, phones whose sync cursor is ahead of the restored data would never re-send what was lost | High (data loss) | **Fixed**: `DATA_EPOCH`. The server reports it on every sync; a phone that sees a different value must reset its cursor and send everything again. Tested. |
| 18 | There was no way to change the encryption key without losing notes | Medium | **Fixed**: every note records its key id; `npm run rotate-key` re-encrypts them all, finds encrypted fields automatically, is safe to repeat, and never prints note text. Tested against the real database. See `key-rotation.md`. |
| 19 | The decryption code would have accepted a truncated (weaker) GCM authentication tag | Low | **Fixed**: only full 16-byte tags are accepted. Unit-tested. |
| 20 | Sync handled records one at a time with several database round trips each: 500 records took 40 to 70 seconds, enough to time out a phone or trip a proxy | High (reliability) | **Fixed** (re-audit): one lookup per list, conflicts decided in memory, writes 20 at a time. The same 500 records now take about 5 s on the same slow link. Covered by a time bound in the live tests. |
| 21 | Pull paging could give the client the same page forever, and lose records, when several records shared a timestamp | High (data loss) | **Fixed**: a page always ends on a whole millisecond. Tested. |
| 22 | Two simultaneous requests could both log a period starting on the same date (a double tap): 8 of 10 were created | Medium | **Fixed**: after inserting, the request with the lower id keeps the period and the other withdraws. 10 at once now give exactly 1. Tested. |
| 23 | The server read and parsed a 2 MB body from an anonymous caller before checking who they were | Medium | **Fixed**: sync's body is read inside the route, after sign-in and rate limiting. Tested. |
| 24 | A DBI-signed token with no expiry was accepted forever | Medium | **Fixed**: tokens without an expiry are refused. Tested. |
| 25 | Every kind of DBI account (users, businesses, partners, admins) could use HerCare; a business token carries no role, so it would also pass as a plain user | Medium | **Option added**: `DBI_ALLOWED_ROLES` limits it, judged on the role the token actually claims. The default is unchanged (all kinds), so **the team has to decide**. Tested. |
| 26 | The admin could choose a tip's database id when creating it | Low | **Fixed**: only the four wording fields are read. Tested. |
| 27 | An unused library (`bcryptjs`) was still installed, left over from the removed user login | Low | **Removed**. |
| 28 | Failed admin sign-ins were logged without the caller's address | Low | **Fixed**: the address (never the typed credentials) is logged, so repeated failures can be traced. |
| 29 | The user-id check accepted any 12-character text as an id | Low | **Fixed**: exactly 24 hex characters. Tested. |
| 17 | Indexes were built automatically every time the server started, which can lock a large collection in production | Low | **Fixed**: in production indexes are built on purpose by `npm run indexes` during a deploy, not on startup. |

Not a problem: `npm audit` reports **0 vulnerabilities** (production and development). No secret, key
or password appears in any tracked file, and `.env` is git-ignored. No log line reads `req.body`,
`req.query` or any health field (a test fails if one is added).

## 2. Controls in place

**Identity.** HerCare has no passwords of its own for users. DBI issues the token; HerCare only
verifies it (HS256 pinned, signature and expiry checked, DBI's half-finished two-factor token
refused, `id` must be a valid ObjectId). Tokens are accepted only from the `Authorization: Bearer`
header: never from the URL or a cookie. Tested with forged, tampered, expired, wrong-secret and
wrong-algorithm tokens.

**Admin.** A single predefined account from `.env`, compared in constant time. Its tokens use a
different secret and audience from DBI's, so neither kind of token works on the other's routes
(tested in both directions). Failed logins are logged without the typed credentials.

**Authorization.** Every user query is scoped by the token's user id. Tested with two users trying to
read, edit, delete and sync-overwrite each other's records. The admin cannot read an individual
user's data: there is no such route, and `tests/adminAccess.routes.test.js` fails if one is added
(it also fails if the dashboard starts reading documents, or if any other admin file imports a
user-data model). Dashboard counts of 1 to 4 are shown as `"<5"`.

**Input.** Every route validates types, lengths, enums and real calendar dates. Request bodies are
limited to 10 KB (2 MB for sync). Attack-shaped keys and repeated parameters are refused before the
route runs. Mongoose `strictQuery` is on. Lists are paginated and capped (periods 200, symptoms 100,
sync pages 2000, checklist 30 items, history range 92 days).

**Data at rest.** Notes (periods and symptoms) are encrypted per field with AES-256-GCM using a
random IV per value. MongoDB Atlas encrypts the disks. Dates and symptom choices are stored in plain
text on purpose (they must be queried and sorted).

**Rate limits (per 15 minutes).** Per IP 600; per signed-in user 300; failed admin logins 5.
`/api/health` is exempt.

**Transport and headers.** Helmet (HSTS, nosniff, frame blocking, CSP), no `X-Powered-By`, `no-store`
everywhere, CORS closed unless `CORS_ORIGIN` lists origins (a native mobile app needs none). HTTPS
must be terminated in front of the server (see section 4).

**Logging.** Messages and ids only, never request data; stack traces only outside production; the
logger also scrubs a list of sensitive field names from anything passed as metadata.

**Deletion.** `DELETE /api/user/data` hard-deletes everything; a timestamp-only marker stops other
phones from restoring it. Export and erase keep working even when the admin switches the feature off.

## 3. Residual risks and honest limits

1. **Suspended or deleted DBI users keep access until their token expires** (up to 30 days), because
   HerCare does not query DBI's database and cannot revoke DBI tokens. *Mitigation if needed:* have
   DBI call a HerCare endpoint on suspension, or add a short-lived cache of a DBI "is this user
   active" check.
2. **Whoever holds DBI's `JWT_SECRET` can act as any user in HerCare.** That is inherent in trusting
   DBI's token; it just means the secret must be protected as strictly as DBI protects it.
3. **Dates and symptom choices are not field-encrypted.** Someone with direct database access could
   read cycle dates. Mitigations: restrict database access, Atlas encryption at rest, and backup
   encryption (see `backup-restore.md`).
4. **Encryption-key rotation is supported but manual.** Every note records which key encrypted it,
   and `npm run rotate-key` re-encrypts them all (`key-rotation.md`). Backups made before a rotation
   still need the old key, so keep it until they expire. Losing the key outright makes all notes
   unrecoverable: back it up separately from the database.
5. **One shared admin account, no audit trail beyond logs.** Admin actions (tip changes, logins) are
   logged without content, but there is no per-person audit log or admin 2FA. Give the admin panel
   network-level protection (VPN or IP allow-list) in production.
6. **The dashboard counts with aggregation pipelines over whole collections.** Fine for thousands of
   users; at hundreds of thousands, cache its result or move it to a scheduled job.
7. **Backups keep erased data until they expire.** Keep retention short (30 days), say so in the
   privacy notice, and run `reapply-erasures` after any restore.
8. **Clinical review of the tip text is outside the code.** Seeded tips stay inactive and invisible
   until a reviewer approves them in the admin panel. `npm run review-sheet` prepares the pack for
   the reviewer; the process is in `clinical-review-process.md`.
9. **No refresh-token or device management**, because DBI owns sessions.
10. **Which DBI account kinds may use HerCare is undecided.** Until `DBI_ALLOWED_ROLES` is set, a DBI business, partner or admin account can use HerCare like any user.
11. **Token lifetime is DBI's choice.** HerCare requires an expiry but does not cap it (a token valid for 10 years is accepted). An admin token cannot be revoked during its 8 hours except by changing `JWT_SECRET`.
12. **Throughput is unmeasured on a real database.** The free Atlas tier throttles operations (about 43 simple requests per second in the load test, with the code idle). Load-test on the production-grade cluster before launch.
13. **Deletion markers are never purged.** A deleted period, symptom log or checklist item stays as a small marker so other phones learn of it. This grows slowly; a purge job after about a year would bound it.
14. **Verified on Node.js 20 and MongoDB Atlas only.** Newer Node versions and self-hosted MongoDB are untested.

## 4. Before going live: checklist

- [ ] `NODE_ENV=production`; `JWT_SECRET` 32+ random characters and different from DBI's; strong `ADMIN_PASSWORD`.
- [ ] `DBI_JWT_SECRET` is DBI's **production** `JWT_SECRET` (not the test value).
- [ ] `ENCRYPTION_KEY` generated fresh for production and stored in a secret manager **and** one offline copy.
- [ ] HTTPS in front of the server; `TRUST_PROXY` set to the number of proxies (usually `1`).
- [ ] MongoDB: a production cluster with backups (not the free tier), network access restricted to the server, a dedicated database user with least privilege, and the password rotated since it was shared in chat.
- [ ] `npm run indexes` and `npm run seed` run once on the production database; the placeholder admin email changed.
- [ ] Admin panel behind a VPN or IP allow-list.
- [ ] Application logs shipped to storage that outlives the backups (the erasure lines depend on it).
- [ ] A restore drill done once (`backup-restore.md`).
- [ ] Clinical review of tips; privacy notice states local-plus-server storage, backup retention and erasure.
- [ ] `npm run test:api` passes against a staging database.
