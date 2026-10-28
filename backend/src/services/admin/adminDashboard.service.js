// Aggregate numbers only. This file must never read an individual user's records: it uses
// countDocuments and aggregation pipelines that return counts, never documents.
// (tests/adminAccess.routes.test.js fails if a document-reading call appears here.)
import PeriodRecord from '../../models/periodRecord.model.js';
import SymptomLog from '../../models/symptomLog.model.js';
import UserSettings from '../../models/userSettings.model.js';
import ChecklistItem from '../../models/checklistItem.model.js';
import ChecklistLog from '../../models/checklistLog.model.js';
import HydrationLog from '../../models/hydrationLog.model.js';
import Reminder from '../../models/reminder.model.js';
import Tip from '../../models/tip.model.js';
import { isFeatureEnabled } from './adminSettings.service.js';
import { suppressSmallCount } from '../../utils/privacy.util.js';

const USER_COLLECTIONS = [PeriodRecord, SymptomLog, UserSettings, ChecklistItem, ChecklistLog, HydrationLog, Reminder];
const DAY_MS = 24 * 60 * 60 * 1000;

// How many different users appear in any HerCare collection (optionally only recent activity).
// Only the count leaves the database.
const countUsers = async (match = {}) => {
  const [first, ...others] = USER_COLLECTIONS;
  const slim = [{ $match: match }, { $project: { user: 1 } }];
  const [result] = await first.aggregate([
    ...slim,
    ...others.map((model) => ({ $unionWith: { coll: model.collection.name, pipeline: slim } })),
    { $group: { _id: '$user' } },
    { $count: 'users' },
  ]);
  return result?.users ?? 0;
};

const countActiveReminders = async () => {
  const rows = await Reminder.aggregate([
    { $match: { enabled: true, paused: false } },
    { $group: { _id: '$type', count: { $sum: 1 } } },
  ]);
  const byType = Object.fromEntries(rows.map((row) => [row._id, row.count]));
  return {
    period: suppressSmallCount(byType.period ?? 0),
    daily_log: suppressSmallCount(byType.daily_log ?? 0),
    hydration: suppressSmallCount(byType.hydration ?? 0),
  };
};

export const getDashboard = async () => {
  const since = (days) => ({ updatedAt: { $gte: new Date(Date.now() - days * DAY_MS) } });

  const [
    totalUsers, active7, active30, periods, symptomLogs, checklistTicks, hydrationDone, reminders,
    tipsTotal, tipsActive, tipsAwaitingReview, featureEnabled,
  ] = await Promise.all([
    countUsers(),
    countUsers(since(7)),
    countUsers(since(30)),
    PeriodRecord.countDocuments({ deletedAt: null }),
    SymptomLog.countDocuments({ deletedAt: null }),
    ChecklistLog.countDocuments({ completed: true }),
    HydrationLog.countDocuments({ done: true }),
    countActiveReminders(),
    Tip.countDocuments(),
    Tip.countDocuments({ active: true }),
    Tip.countDocuments({ reviewedAt: null }),
    isFeatureEnabled(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    privacyNote: 'Aggregates only. Counts of 1 to 4 are shown as "<5" to protect privacy.',
    feature: { enabled: featureEnabled },
    users: {
      total: suppressSmallCount(totalUsers),
      activeLast7Days: suppressSmallCount(active7),
      activeLast30Days: suppressSmallCount(active30),
    },
    records: {
      periods: suppressSmallCount(periods),
      symptomLogs: suppressSmallCount(symptomLogs),
      checklistItemsCompleted: suppressSmallCount(checklistTicks),
      hydrationRemindersDone: suppressSmallCount(hydrationDone),
    },
    activeReminders: reminders,
    // Tips are admin-written content, not user data, so these are exact.
    tips: { total: tipsTotal, active: tipsActive, awaitingReview: tipsAwaitingReview },
  };
};
