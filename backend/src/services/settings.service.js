import UserSettings from '../models/userSettings.model.js';
import AdminSettings from '../models/adminSettings.model.js';

const FALLBACK = { cycleLength: 28, periodDuration: 5 };

// The user's own values, falling back to the admin-managed defaults.
export const getSettings = async (userId) => {
  const [mine, defaults] = await Promise.all([
    UserSettings.findOne({ user: userId }).lean(),
    AdminSettings.findOne({ key: 'global' }).lean(),
  ]);
  return {
    cycleLength: mine?.cycleLength ?? defaults?.defaultCycleLength ?? FALLBACK.cycleLength,
    periodDuration: mine?.periodDuration ?? defaults?.defaultPeriodDuration ?? FALLBACK.periodDuration,
    usingDefaults: !mine,
  };
};

export const updateSettings = async (userId, patch) => {
  await UserSettings.findOneAndUpdate(
    { user: userId },
    { $set: { ...patch, clientUpdatedAt: new Date() } },
    { upsert: true, runValidators: true }
  );
  return getSettings(userId);
};
