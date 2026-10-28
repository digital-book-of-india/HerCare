import AdminSettings from '../../models/adminSettings.model.js';

// Feature on/off is checked on every user request, so it is cached briefly. Saving a change here
// clears the cache at once; with several server instances the others catch up within CACHE_MS.
const CACHE_MS = 10_000;
let featureCache = null; // { value, expires }

const getDoc = async () => (await AdminSettings.findOne({ key: 'global' })) ?? AdminSettings.create({ key: 'global' });

const toSettings = (doc) => ({
  featureEnabled: doc.featureEnabled,
  defaultCycleLength: doc.defaultCycleLength,
  defaultPeriodDuration: doc.defaultPeriodDuration,
  updatedAt: doc.updatedAt,
});

const toContent = (doc) => ({
  disclaimerText: doc.disclaimerText,
  privacyText: doc.privacyText,
  defaultChecklistItems: doc.defaultChecklistItems.map(({ id, label }) => ({ id, label })),
  updatedAt: doc.updatedAt,
});

export const isFeatureEnabled = async () => {
  if (featureCache && featureCache.expires > Date.now()) return featureCache.value;
  const doc = await AdminSettings.findOne({ key: 'global' }).select('featureEnabled').lean();
  const value = doc?.featureEnabled ?? true;
  featureCache = { value, expires: Date.now() + CACHE_MS };
  return value;
};

export const getSettings = async () => toSettings(await getDoc());

// The feature switch, and the cycle/period defaults used for users who have not set their own.
export const updateSettings = async (patch) => {
  const doc = await getDoc();
  for (const key of ['featureEnabled', 'defaultCycleLength', 'defaultPeriodDuration']) {
    if (patch[key] !== undefined) doc[key] = patch[key];
  }
  await doc.save();
  featureCache = null;
  return toSettings(doc);
};

export const getContent = async () => toContent(await getDoc());

// New users get a copy of the default checklist on first use; existing users keep their own.
export const updateContent = async (patch) => {
  const doc = await getDoc();
  for (const key of ['disclaimerText', 'privacyText', 'defaultChecklistItems']) {
    if (patch[key] !== undefined) doc[key] = patch[key];
  }
  await doc.save();
  return toContent(doc);
};
