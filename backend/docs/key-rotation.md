# Changing the encryption key

Notes (period notes and symptom notes) are encrypted with `ENCRYPTION_KEY`. Every stored note records
**which key** encrypted it, so the key can be changed without losing anything:

```
k1:<iv>:<tag>:<ciphertext>        written by key "k1"
```

The server always **writes** with the current key and can **read** the current key plus any retired
keys you list. `npm run rotate-key` then re-encrypts every old note with the current key.

## When to do it

- **Immediately** if the key may have leaked (a laptop was lost, a `.env` was shared, a person with access left on bad terms).
- **Once a year** as routine.
- Never "just to see": it touches every note. Take a backup first.

## Before you start

1. **Take a database backup** (see `backup-restore.md`). Confirm you can still read the *current* key from your secret manager.
2. **Do it on staging first** with a copy of the data.
3. **Remember what an old key is still needed for:** reading backups made before the rotation. Do not destroy the old key until those backups have expired (at most 30 days).

## Steps (one server)

1. Generate a new key and pick a new id:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Store the new key in the secret manager and an offline copy.
3. Change the server environment, keeping the old key as a **retired** key:
   ```
   ENCRYPTION_KEY=<the NEW key>
   ENCRYPTION_KEY_ID=k2
   ENCRYPTION_KEYS_OLD=k1:<the OLD key>
   ```
   Restart. From now on new notes use `k2`, and old notes are still readable.
4. See what would change (changes nothing):
   ```
   npm run rotate-key
   ```
5. Do it:
   ```
   npm run rotate-key -- --apply
   ```
6. Check it. This must exit with code 0 and say every value is on the current key:
   ```
   npm run rotate-key -- --verify
   ```
7. **Wait** until every backup made before step 3 has expired. Then remove `ENCRYPTION_KEYS_OLD`, restart, run `--verify` once more, and **destroy the old key** everywhere (secret manager and the offline copy).

## Steps (several servers behind a load balancer)

During a rolling restart, a server that still has only the old key cannot read notes that a restarted
server has just written with the new key. Avoid that with two restarts:

1. **First, teach every server the new key without using it yet:**
   ```
   ENCRYPTION_KEY=<the OLD key>        ENCRYPTION_KEY_ID=k1
   ENCRYPTION_KEYS_OLD=k2:<the NEW key>
   ```
   (`ENCRYPTION_KEYS_OLD` just means "keys I can read".) Restart all servers, one at a time.
2. **Then switch the writing key** on every server, exactly as in step 3 above (new key current, old key retired). Restart one at a time.
3. Continue from step 4 above.

## What the tool guarantees

- It finds every encrypted field **by itself** by looking at the models. A field added later with `set: encrypt, get: decrypt` is included automatically, so it can never be forgotten.
- **Safe to run again and again.** Values already on the current key are left exactly as they are.
- **Nothing is overwritten by accident.** Each update only applies if the value is still the one it read. If a user edited a note a moment earlier, that edit was already written with the current key and is kept.
- **Timestamps are not touched**, so phones see no change and nothing re-syncs.
- **Nothing readable is printed.** It shows counts and record ids only, never note text or keys.
- A value it cannot read (key missing, damaged, or never encrypted) is **left untouched and reported by id**, and the run ends with exit code 1.

## If it reports "unreadable"

**Do not remove any old key.** The usual causes, in order of likelihood:

1. The old key is missing from `ENCRYPTION_KEYS_OLD`, or its id does not match the id stored in the notes (`k1`, `k2`, ...). The tool names the ids it cannot find.
2. A note was written by something that did not use the encryption (the output says which entries by id).
3. A stored value was damaged. Restore that entry from a backup, or clear its note.

## Related

- Losing the key (not rotating it) makes every note permanently unreadable. Keep it in two places: `backup-restore.md`.
- If the key **leaked**, rotate at once, and treat every backup made before the rotation as exposed to anyone who has the old key: let those backups age out or delete them as soon as your restore plan allows.
- Every stored value, in every backup, names the key it needs. `k9:...` in a note means "needs key k9".
