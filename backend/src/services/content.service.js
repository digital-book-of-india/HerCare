import AdminSettings from '../models/adminSettings.model.js';

// Public texts shown before and during use (welcome/consent screen, settings).
export const getContent = async () => {
  const settings = await AdminSettings.findOne({ key: 'global' }).lean();
  return {
    featureEnabled: settings?.featureEnabled ?? true,
    disclaimerText: settings?.disclaimerText ?? '',
    privacyText: settings?.privacyText ?? '',
  };
};
