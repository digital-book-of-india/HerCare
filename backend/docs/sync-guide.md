# Sync guide (for the mobile developer)

HerCare is **local-first**: the phone keeps its own database and works fully offline. The server is the
backup, the way to get the same data on a new phone, and the home of the admin's content. `POST
/api/user/sync` does both directions in one call. This page is the protocol; `api/openapi.json` has
the exact shapes.

## The idea in one minute

Each phone remembers a **cursor** (a server time). Every sync it sends *what the user changed since last
time* and gets back *what changed on the server since its cursor*. Conflicts are settled by **who
edited last**. Sending the same thing twice is harmless, so you can always retry.

```
phone:  changes made offline ──┐
                               ├─►  POST /api/user/sync { since: cursor, epoch, changes }
server: applies them (newest   │         │
        edit wins), then ◄─────┘         ▼
        returns what changed since cursor, plus a new cursor
```

## What the local database must keep

| For every record | Why |
|---|---|
| its **identity** | `id` for periods and checklist items (24 hex characters, **generated on the phone**, e.g. 12 random bytes as hex); the **date** for symptom logs; **date + itemId** for checklist ticks; **date + time** for hydration marks; the **type** for reminders; one row for settings |
| **`clientUpdatedAt`** | when the user last edited it (an ISO date-time, set to "now" on every local edit) |
| **`deleted`** (periods, symptoms, checklist items) | deleting is a flag, not a removal, until the server has heard about it |
| a **dirty** marker | "changed since the last successful sync" |

And three values for the whole account: the **`cursor`** (null before the first sync), the
**`epoch`** (null before the first sync) and nothing else.

## One sync, step by step

1. **Collect** every dirty record. Put each in its list in `changes` (`periods`, `checklistItems`,
   `checklistLogs`, `symptoms`, `hydrationLogs`, `reminders`, and `settings` as a single object). At
   most **500 per list** per request: send several requests if you have more.
2. **Send** `{ since: cursor, epoch, changes }`. Use the user's token.
3. **Read the answer:**
   - `push.applied` / `push.unchanged`: those records are now on the server. Clear their dirty marker.
     (`unchanged` means "already there": a retry, not a problem.)
   - `push.rejected`: look at each `reason` (next section).
   - `push.warnings`: tell the user (below).
   - `changes`: **apply every record to the local database** (section "Applying what comes back").
4. **Only now store** the new `cursor` and `epoch`. If anything above failed, keep the old cursor and
   retry the whole sync: repeating is safe.
5. If `hasMore` is true, **call again straight away with the new cursor** (and nothing to push) until it
   is false. The server returns up to 1000 changes per type per call by default.

When to sync: on app start, when connectivity returns, a few seconds after the user makes a change, and
when the app comes back to the foreground. Never block the user interface on it.

## Why a record was rejected (`push.rejected[].reason`)

| reason | Meaning | What to do |
|---|---|---|
| `invalid` | The record broke a rule (bad date, unknown option, too long). `message` says why. | It will never be accepted as sent. Fix or discard it locally; do not retry it forever. This should only happen through a bug. |
| `stale` | The server already has a **newer** edit of that record. `server` holds the server's version. | **Replace your local copy with `server`** and clear the dirty marker. Newest edit wins. |
| `conflict` | That `id` is already used by something else (a clash of random ids, or an id that belongs to another account). | Give the record a **new id** and send it again. |
| `erased` | The user erased their data on the server after this record was last edited. | **Delete this record locally** (see "Erase"). |

## Applying what comes back

For each record in `changes`:

- **Missing locally** → insert it.
- **You also have it** → keep the one with the **later `clientUpdatedAt`**. If your local copy is dirty
  and newer, keep yours (it will be sent next time).
- `deleted: true` → delete it locally (or mark it deleted). A fresh install (no cursor) is never sent
  deleted records.
- Records may repeat across calls; applying one twice must change nothing.

## Deleting

Set `deleted = true` and `clientUpdatedAt = now` locally, and send a tiny record: `{ "id": "...",
"deleted": true, "clientUpdatedAt": "..." }` (for a symptom log: `{ "date": "...", "deleted": true, ... }`).
Other phones learn of it on their next sync. A **later, newer edit brings the record back**.

## Conflicts, in plain words

- Two phones edit the same period offline → whichever edit has the **later `clientUpdatedAt`** wins, on
  the server and on both phones after they sync. The loser's phone is told with `stale`.
- A device clock that is ahead is treated as "now" by the server (more than 5 minutes ahead is clamped),
  so a wrong clock cannot make an edit unbeatable. Use the real current time anyway.
- **Two phones log the same period** → both are kept. The server cannot ask the user, so it returns
  `push.warnings` of `duplicate_start` or `overlap` (`key` is the record, `with` the other one). Show the
  user a "you may have a duplicate period" prompt and let them delete one (a normal delete).

## First install, new phone, reinstall

Start with `cursor = null`, `epoch = null`, nothing to push (or whatever the user already entered
locally). One or more syncs (follow `hasMore`) download everything. That is also how "restore on a new
phone" works.

**Default checklist items.** The admin's default items are copied to a user the first time the
checklist is read from the server. So on a brand-new account call `GET /api/user/checklist/items`
**once, before creating any checklist item locally**, and store what comes back (they are normal
synced items with ids). If the phone makes up its own defaults and the server also copies its own,
the user sees every item twice.

## When the user erases their data

`DELETE /api/user/data` removes everything on the server. The phone that did it wipes its local
database and sets `cursor = null`.

**Other phones** find out through `erasedAt` in the sync answer. The rule:

> If the answer has `erasedAt` **and** your cursor is not null **and** `erasedAt` is later than your
> cursor → **wipe your whole local database**, set the cursor to null, and carry on (the account is
> empty). 

Also delete any record the server rejects as `erased`. Data the user creates *after* the erasure is
accepted normally.

## When the server was restored from a backup

If the operators restore an old backup they change the server's `epoch`. A phone that sends a different
`epoch` gets **`resyncRequired: true`**. Then:

1. Set `cursor = null`.
2. Mark **every** local record dirty and send them all (500 per list per request). Last-edit-wins merges
   them safely; nothing newer is overwritten.
3. Store the new `epoch` once that completes.

Always send the `epoch` you last stored. (First ever sync: send none.)

## Worked example

A phone logs a period offline, then connects.

Request:

```json
{
  "since": "2026-10-28T08:00:00.000Z",
  "epoch": "1",
  "changes": {
    "periods": [
      { "id": "65f1c2a4b8e9d3a7c1f20e41", "startDate": "2026-09-01", "endDate": "2026-09-05", "notes": null,
        "clientUpdatedAt": "2026-10-28T08:30:00.000Z" }
    ]
  }
}
```

Answer:

```json
{
  "success": true, "message": "OK",
  "data": {
    "serverTime": "2026-10-28T09:00:00.000Z",
    "cursor": "2026-10-28T09:00:00.000Z",
    "hasMore": false, "epoch": "1", "resyncRequired": false,
    "push": { "applied": { "periods": 1 }, "unchanged": {}, "rejected": [], "warnings": [] },
    "changes": { "settings": null, "periods": [ { "id": "65f1c2a4b8e9d3a7c1f20e41", "...": "..." } ],
                 "checklistItems": [], "checklistLogs": [], "symptoms": [], "hydrationLogs": [], "reminders": [] }
  }
}
```

(The period comes back too, because it changed on the server after the cursor: applying it is a no-op.)

Same record edited earlier on another phone → in `push.rejected`:

```json
{ "entity": "periods", "key": "65f1c2a4b8e9d3a7c1f20e41", "reason": "stale",
  "message": "The server has a newer version",
  "server": { "id": "65f1c2a4b8e9d3a7c1f20e41", "startDate": "2026-09-02", "endDate": "2026-09-06",
              "notes": null, "deleted": false, "clientUpdatedAt": "2026-10-28T08:45:00.000Z", "updatedAt": "..." } }
```

## Order of processing on the server

Settings, periods, checklist items, checklist ticks, symptoms, hydration marks, reminders. A tick can
therefore arrive in the same request as the item it ticks.

## Limits worth knowing

| | |
|---|---|
| Records per list per request | 500 |
| Request size | 2 MB |
| Changes returned per type per call | about 1000 by default (`limit` up to 2000). A page may run slightly over, because records that share one timestamp are never split across pages. |
| Notes | 500 characters |
| Checklist items per user | 30 |
| A period | at most 20 days; dates at most one day ahead of the server's UTC date |
| Rate limit | 300 requests per 15 minutes per user (HTTP 429, see the `RateLimit-*` headers) |

## What the server does not do

It does not merge field by field: the **whole record** of the newer edit wins. It does not keep the
losing version. It does not check your device clock beyond the 5-minute clamp.
