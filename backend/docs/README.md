# HerCare backend: documentation

**Start with the line that describes you.**

| You are... | Read, in this order |
|---|---|
| **Building the mobile app** (Kundan) | [mobile-integration-guide.md](mobile-integration-guide.md) → [sync-guide.md](sync-guide.md) → [estimate-rule.md](estimate-rule.md) |
| **Building the admin panel** | [admin-panel-guide.md](admin-panel-guide.md) |
| **Taking over the backend** | [handoff.md](handoff.md) → [setup-guide.md](setup-guide.md) |
| **Deploying or running it** | [setup-guide.md](setup-guide.md) → [security-review.md](security-review.md) (go-live checklist) → [backup-restore.md](backup-restore.md) |
| **Getting the health content reviewed** | [clinical-review-process.md](clinical-review-process.md) |

## Everything here

| File | What it is |
|---|---|
| [handoff.md](handoff.md) | How the system fits together, why it is built this way, recipes for changing it, what is still open |
| [setup-guide.md](setup-guide.md) | Install, every setting, every command, deploying, troubleshooting |
| [mobile-integration-guide.md](mobile-integration-guide.md) | Everything the mobile developer needs, screen by screen |
| [sync-guide.md](sync-guide.md) | The phone-to-server sync protocol, with examples |
| [estimate-rule.md](estimate-rule.md) | The exact next-period rule the phone and the server must share |
| [estimate-test-vectors.json](estimate-test-vectors.json) | 27 inputs with the exact expected outputs, to test the phone's implementation against |
| [admin-panel-guide.md](admin-panel-guide.md) | Everything the admin panel developer needs |
| [api/openapi.json](api/openapi.json) | The full API reference (OpenAPI 3): open it in Swagger UI or import it anywhere |
| [api/hercare.postman_collection.json](api/hercare.postman_collection.json) | The same API as a ready-to-use Postman collection |
| [security-review.md](security-review.md) | What was reviewed, what was fixed, what risk remains, the go-live checklist |
| [backup-restore.md](backup-restore.md) | Backing up and restoring, including how erased data stays erased |
| [key-rotation.md](key-rotation.md) | Changing the encryption key without losing notes |
| [clinical-review-process.md](clinical-review-process.md) | How content gets approved by a clinician and recorded |
| [clinical-review-sheet.html](clinical-review-sheet.html) | The sheet to send the reviewer (open in a browser, print to PDF) |
| [clinical-review-sheet.md](clinical-review-sheet.md) | The same sheet as plain text |

## Trying the API in two minutes

1. `npm run seed` and `npm run dev` in the backend folder ([setup-guide.md](setup-guide.md)).
2. Import [api/hercare.postman_collection.json](api/hercare.postman_collection.json) into Postman.
3. For user requests: run `npm run -s dev-token` and paste the result into the collection variable `userToken`.
4. For admin requests: run "Sign in as the admin" once; it stores `adminToken` for you.

## Keeping these true

Three files are **generated** from the code: `api/openapi.json`, `api/hercare.postman_collection.json` and
`estimate-test-vectors.json`. After changing an endpoint or the estimate rule run `npm run docs:build`.
`npm test` fails if they are out of date, if the API reference and the real routes disagree, if a
setting or command is undocumented, or if a document points at a file that does not exist. The two
clinical review sheet files are regenerated with `npm run review-sheet`.
