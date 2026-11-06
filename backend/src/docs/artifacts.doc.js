// The generated files in docs/, as text. The build script writes them; a test compares them with the
// committed copies, so they can never be out of date.
import openapi from './openapi.doc.js';
import { buildEstimateVectors } from './estimateVectors.doc.js';
import { buildPostmanCollection } from '../utils/postman.util.js';

const asJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

// Paths are relative to the backend folder.
export const buildArtifacts = () => ({
  'docs/api/openapi.json': asJson(openapi),
  'docs/api/hercare.postman_collection.json': asJson(buildPostmanCollection(openapi)),
  'docs/estimate-test-vectors.json': asJson(buildEstimateVectors()),
});
