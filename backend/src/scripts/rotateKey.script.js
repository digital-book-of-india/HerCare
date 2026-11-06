// Re-encrypt every note with the current key. See docs/key-rotation.md.
//
//   npm run rotate-key                 dry run: report only, nothing is changed
//   npm run rotate-key -- --apply      re-encrypt everything that is not on the current key
//   npm run rotate-key -- --verify     check that every value is readable AND on the current key
//
// Safe to run again and again. Prints counts and record ids, never any note text.
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';
import logger from '../utils/logger.util.js';
import { currentKeyId } from '../utils/encryption.util.js';
import { rotateEncryptedFields } from '../services/keyRotation.service.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const verify = args.includes('--verify');

try {
  await connectDB();
  logger.info(`Current encryption key id: ${currentKeyId}. Mode: ${apply ? 'APPLY' : verify ? 'VERIFY' : 'dry run (nothing is changed)'}`);
  const report = await rotateEncryptedFields({ apply });

  for (const row of report) {
    logger.info(`${row.field}: scanned ${row.scanned}, already on ${currentKeyId}: ${row.alreadyCurrent}, `
      + `to rotate: ${row.toRotate}, rotated: ${row.rotated}, changed meanwhile: ${row.changedMeanwhile}, unreadable: ${row.failed}`);
    if (row.failed > 0) logger.error(`${row.field}: could not read the entries with ids ${row.failedIds.join(', ')}${row.failed > row.failedIds.length ? ' ...' : ''}`);
  }

  const unreadable = report.reduce((sum, row) => sum + row.failed, 0);
  const pending = report.reduce((sum, row) => sum + row.toRotate - row.rotated, 0);
  if (unreadable > 0) {
    logger.error(`${unreadable} value(s) cannot be read with the configured keys. Do NOT remove any old key yet.`);
    process.exitCode = 1;
  } else if (verify && pending > 0) {
    logger.error(`${pending} value(s) are still on an old key. Run with --apply.`);
    process.exitCode = 1;
  } else if (apply && pending > 0) {
    logger.warn(`${pending} value(s) were edited while this ran. Run it again to finish.`);
  } else if (!apply && !verify && pending > 0) {
    logger.info(`${pending} value(s) would be re-encrypted. Run with --apply to do it.`);
  } else {
    logger.info('Every encrypted value is readable and on the current key.');
  }
} catch (err) {
  logger.error(`Key rotation failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
