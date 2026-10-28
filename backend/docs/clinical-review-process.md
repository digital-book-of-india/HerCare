# Clinical review: how it works

Nothing health-related reaches users until a qualified person has approved it. Tips are blocked by
the code itself: a tip cannot be activated without a review date, and editing a reviewed tip clears
that review and takes it offline.

## The review pack

`npm run review-sheet` writes two files to `backend/docs/`:

| File | Use |
|---|---|
| `clinical-review-sheet.html` | Open in a browser and **print to PDF** to send. Landscape, with tick boxes and a sign-off block. |
| `clinical-review-sheet.md` | The same content as plain text, for version control and diffs. |

The sheet is built **from the real content** (the tips in the database, the disclaimer and privacy
text, the default checklist, the option lists, the notification texts, the estimate settings), so it
cannot drift from what users see. It lists 9 draft tips written to be general and claim-free.

Each sheet carries a **content fingerprint** (a short code such as `18bac20b0b1c`). It changes if any
approved wording changes, so a signature can be tied to one exact version. The reviewer quotes it when
returning the sheet.

## Who reviews

A qualified clinician agreed with DBI (for example a doctor, gynaecologist or registered nurse). They
review *wording*; they are not asked to endorse the app as a medical product.

## Steps

1. **Send** the printed sheet (PDF) to the reviewer. Regenerate it first if anything changed:
   `npm run review-sheet`.
2. **Get it back**, signed, with the fingerprint, and **file the signed copy** with your launch records.
3. **Apply the answers.** In the admin panel (API shown for reference):
   - *Approved as written:* record the review, then activate.
     ```
     POST  /api/admin/tips/<id>/review   { "reviewedAt": "2026-10-20", "reviewedBy": "Dr. A. Rao" }
     PATCH /api/admin/tips/<id>/active   { "active": true }
     ```
   - *Approved with edits:* edit the tip first (this clears any review), then review and activate as above. Use the reviewer's name and the date they signed.
   - *Rejected:* leave it inactive, or delete it.
   - *Disclaimer, privacy text, default checklist:* `PATCH /api/admin/content`. These are not blocked by the review gate, so make sure the approved wording is in place **before launch**.
4. **Check** the result: `GET /api/admin/tips?reviewed=true&active=true` lists what users will see; `GET /api/user/tips` (as a test user) shows it from their side.
5. **Give the approved sheet to the mobile developer.** Sections 1 and 4 describe how the app is *meant* to behave ("estimates only", the wording for a late period, no "irregular/normal" labels, optional activity with a "rest today" choice). The backend supplies the data; **the mobile app writes the words on screen**, so it must match the sheet. Any other health-related text that the mobile app hard-codes is **not** on the sheet; ask the mobile developer to list it and send it to the reviewer too.

## When it has to be redone

- **A tip is edited:** the code clears its review automatically. Review it again.
- **A new tip is added:** it starts hidden. Add it to a fresh sheet.
- **The disclaimer, privacy text, checklist, option lists, notification texts or estimate settings change:** the fingerprint changes. Send the changed items again.
- **Routinely:** once a year.

## Where the names and dates end up

`reviewedAt` and `reviewedBy` are stored on each tip and shown in the admin panel and the next sheet
("Live. Reviewed 2026-10-20 by Dr. A. Rao").
