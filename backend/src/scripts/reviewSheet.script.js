// Writes the clinical review sheet from the app's real content.
//
//   npm run review-sheet                   writes docs/clinical-review-sheet.md and .html
//   npm run review-sheet -- --out <folder> writes them somewhere else
//
// Read-only: it reads the database and the code, and changes nothing. Open the .html in a browser
// and print it to PDF to send to the reviewer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';
import logger from '../utils/logger.util.js';
import AdminSettings from '../models/adminSettings.model.js';
import Tip from '../models/tip.model.js';
import { SYMPTOMS, FLOWS, MOODS, ENERGY_LEVELS } from '../utils/constants.util.js';
import { MIN_VALID_CYCLE, MAX_VALID_CYCLE, RECENT_COUNT, MIN_SAMPLES, PREDICTED_CYCLES } from '../services/cycleEstimator.service.js';
import { periodReminderText, DAILY_LOG_TEXT, HYDRATION_TEXT } from '../services/reminderSchedule.service.js';
import { buildReviewSheet, renderMarkdown, renderHtml } from '../utils/reviewSheet.util.js';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : fileURLToPath(new URL('../../docs', import.meta.url));

try {
  await connectDB();
  const [settings, tips] = await Promise.all([AdminSettings.findOne({ key: 'global' }).lean(), Tip.find().lean()]);
  if (!settings) throw new Error('The database is not seeded. Run `npm run seed` first.');

  const sheet = buildReviewSheet({
    generatedAt: new Date().toISOString(),
    limits: {
      cycleMin: MIN_VALID_CYCLE, cycleMax: MAX_VALID_CYCLE, recent: RECENT_COUNT, minSamples: MIN_SAMPLES,
      predicted: PREDICTED_CYCLES, defaultCycleLength: settings.defaultCycleLength, defaultPeriodDuration: settings.defaultPeriodDuration,
    },
    disclaimerText: settings.disclaimerText,
    privacyText: settings.privacyText,
    checklistItems: settings.defaultChecklistItems.map(({ id, label }) => ({ id, label })),
    options: { symptoms: SYMPTOMS, flows: FLOWS, moods: MOODS, energy: ENERGY_LEVELS },
    notifications: [
      { where: 'Period reminder, on the day', text: periodReminderText(0) },
      { where: 'Period reminder, one day before', text: periodReminderText(1) },
      { where: 'Period reminder, several days before (here 3)', text: periodReminderText(3) },
      { where: 'Daily logging reminder', text: DAILY_LOG_TEXT },
      { where: 'Hydration reminder', text: HYDRATION_TEXT },
    ],
    tips: tips.map((tip) => ({
      category: tip.category, title: tip.title, text: tip.text, showWhen: tip.showWhen,
      active: tip.active, reviewedAt: tip.reviewedAt ? tip.reviewedAt.toISOString() : null, reviewedBy: tip.reviewedBy,
    })),
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'clinical-review-sheet.md'), renderMarkdown(sheet), 'utf8');
  writeFileSync(join(outDir, 'clinical-review-sheet.html'), renderHtml(sheet), 'utf8');
  logger.info(`Review sheet written to ${outDir} (fingerprint ${sheet.fingerprint}, ${tips.length} tips)`);
} catch (err) {
  logger.error(`Review sheet failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
