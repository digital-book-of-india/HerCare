import UserSettings from '../models/userSettings.model.js';
import PeriodRecord from '../models/periodRecord.model.js';
import ChecklistItem from '../models/checklistItem.model.js';
import ChecklistLog from '../models/checklistLog.model.js';
import SymptomLog from '../models/symptomLog.model.js';
import HydrationLog from '../models/hydrationLog.model.js';
import Reminder from '../models/reminder.model.js';
import AdminSettings from '../models/adminSettings.model.js';
import ErasureMarker from '../models/erasureMarker.model.js';
import Tip from '../models/tip.model.js';

// Every collection HerCare owns. The key-rotation script also uses this to find encrypted fields.
export const ALL_MODELS = [
  UserSettings, PeriodRecord, ChecklistItem, ChecklistLog, SymptomLog, HydrationLog, Reminder,
  AdminSettings, ErasureMarker, Tip,
];

// Makes the database's indexes match the models: creates missing ones, drops ones no model asks for.
// Returns the names of the indexes that were dropped, per model.
export const syncAllIndexes = async () => {
  const dropped = {};
  for (const model of ALL_MODELS) dropped[model.modelName] = await model.syncIndexes();
  return dropped;
};
