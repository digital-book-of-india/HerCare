// Regenerates the machine-readable documentation: npm run docs:build
//   docs/api/openapi.json                    the API reference (Swagger UI, Postman, code generators)
//   docs/api/hercare.postman_collection.json the same API as a ready-to-use Postman collection
//   docs/estimate-test-vectors.json          test cases for the estimate rule, for the mobile developer
// Run it after changing an endpoint or the estimate rule; `npm test` fails if you forget.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from '../docs/artifacts.doc.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
for (const [relative, text] of Object.entries(buildArtifacts())) {
  const target = join(root, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text, 'utf8');
  console.log(`wrote ${relative}`);
}
