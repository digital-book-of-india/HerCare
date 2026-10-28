import { ALL_MODELS } from './indexes.service.js';
import { encrypt, needsRotation, rotate } from '../utils/encryption.util.js';

// Every field that holds encrypted text, found by looking at the models themselves: a field
// declared with `set: encrypt` is included automatically, so a field added later can never be
// forgotten during a rotation (and then become unreadable when the old key is removed).
export const encryptedFields = () => ALL_MODELS.flatMap((model) =>
  Object.entries(model.schema.paths)
    .filter(([, type]) => type.options?.set === encrypt)
    .map(([path]) => ({ model, path })));

// Walks every encrypted value. Reads and writes the raw stored text, so it never needs the
// plaintext in memory longer than one value, and never logs or returns it.
//   apply = false : only reports (a dry run)
//   apply = true  : re-encrypts anything not on the current key
// The write is conditional on the value still being the one we read, so a note the user edited
// a moment ago is not overwritten (their edit was already written with the current key).
// Timestamps are not touched: to sync clients nothing changed.
export const rotateEncryptedFields = async ({ apply = false, batchSize = 500 } = {}) => {
  const report = [];

  for (const { model, path } of encryptedFields()) {
    const stats = {
      field: `${model.modelName}.${path}`,
      scanned: 0, alreadyCurrent: 0, toRotate: 0, rotated: 0, changedMeanwhile: 0, failed: 0, failedIds: [],
    };
    let operations = [];
    const flush = async () => {
      if (operations.length === 0) return;
      const result = await model.collection.bulkWrite(operations, { ordered: false });
      stats.rotated += result.modifiedCount;
      stats.changedMeanwhile += operations.length - result.modifiedCount;
      operations = [];
    };

    const cursor = model.collection.find({ [path]: { $type: 'string' } }, { projection: { [path]: 1 } });
    for await (const doc of cursor) {
      stats.scanned += 1;
      const stored = doc[path];
      if (!needsRotation(stored)) { stats.alreadyCurrent += 1; continue; }

      let next;
      try {
        next = rotate(stored);
      } catch {
        // Unknown key, tampered value, or text that was never encrypted. Left untouched and reported.
        stats.failed += 1;
        if (stats.failedIds.length < 20) stats.failedIds.push(String(doc._id));
        continue;
      }

      stats.toRotate += 1;
      if (apply) {
        operations.push({ updateOne: { filter: { _id: doc._id, [path]: stored }, update: { $set: { [path]: next } } } });
        if (operations.length >= batchSize) await flush();
      }
    }
    await flush();
    report.push(stats);
  }
  return report;
};
