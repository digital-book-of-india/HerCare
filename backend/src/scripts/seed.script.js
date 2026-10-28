import mongoose from 'mongoose';
import connectDB from '../config/db.config.js';
import logger from '../utils/logger.util.js';
import Tip from '../models/tip.model.js';
import AdminSettings from '../models/adminSettings.model.js';

const DISCLAIMER =
  'HerCare is a wellness and tracking tool, not a medical diagnosis or contraception app. ' +
  'Cycle dates are estimates, not guarantees. See a clinician for concerning symptoms.';

const PRIVACY =
  'Your data is yours. It is used only to run HerCare features and is never sold or shared. ' +
  'You can export or delete your data at any time.';

const CHECKLIST = [
  { id: 'rest-break', label: 'Take a rest break' },
  { id: 'balanced-meal', label: 'Eat a balanced meal' },
  { id: 'log-symptoms', label: 'Log symptoms' },
  { id: 'period-essentials', label: 'Prepare period essentials' },
];

// DRAFT wording for the clinical reviewer (see docs/clinical-review-sheet.md). Written to be general,
// optional and free of health claims: nothing here treats, prevents or diagnoses anything.
// Every tip is inserted INACTIVE and unreviewed, so none reaches a user until a reviewer approves it
// and the admin activates it. Existing tips are never overwritten by re-running the seed.
const TIPS = [
  { category: 'food', title: 'Balanced meals', showWhen: 'always', text: 'Include a mix of vegetables, fruits and whole grains in your meals.' },
  { category: 'food', title: 'Vegetables and fruits', showWhen: 'always', text: 'Colourful vegetables and fruits are a good addition to everyday meals.' },
  { category: 'food', title: 'Whole grains', showWhen: 'always', text: 'Whole grains such as brown rice, oats or whole wheat roti can be part of balanced meals.' },
  { category: 'food', title: 'Iron-containing foods', showWhen: 'period', text: 'Foods such as leafy greens, legumes and fortified cereals contain iron.' },
  { category: 'food', title: 'Simple, comfortable meals', showWhen: 'period', text: 'Simple meals that you enjoy and find easy to eat are a good choice. Eat when you are hungry.' },
  { category: 'activity', title: 'Light walking', showWhen: 'always', text: 'A gentle walk is optional. Rest today if you prefer.' },
  { category: 'activity', title: 'Slow breathing break', showWhen: 'always', text: 'A few slow, deep breaths or a quiet break can help you pause. This is optional.' },
  { category: 'activity', title: 'Comfortable stretching', showWhen: 'period', text: 'Try easy stretching or relaxation. Stop if pain or discomfort gets worse.' },
  { category: 'activity', title: 'Rest is okay', showWhen: 'period', text: 'Rest is a good choice if you are tired. You can skip activity today.' },
];

const seed = async () => {
  await connectDB();

  await AdminSettings.findOneAndUpdate(
    { key: 'global' },
    {
      $setOnInsert: {
        defaultChecklistItems: CHECKLIST,
        disclaimerText: DISCLAIMER,
        privacyText: PRIVACY,
      },
    },
    { upsert: true }
  );

  for (const tip of TIPS) {
    await Tip.findOneAndUpdate(
      { category: tip.category, title: tip.title },
      { $setOnInsert: { ...tip, active: false, reviewedAt: null } },
      { upsert: true }
    );
  }

  logger.info('Seed complete');
};

try {
  await seed();
} catch (err) {
  logger.error(`Seed failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
