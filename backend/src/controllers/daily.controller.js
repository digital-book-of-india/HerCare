import * as symptomService from '../services/symptom.service.js';
import * as checklistService from '../services/checklist.service.js';
import * as hydrationService from '../services/hydration.service.js';
import * as reminderService from '../services/reminder.service.js';
import * as tipService from '../services/tip.service.js';
import * as selfCareService from '../services/selfCare.service.js';
import * as contentService from '../services/content.service.js';
import { success, created } from '../utils/response.util.js';
import { todayUTC } from '../utils/dates.util.js';

// The phone knows the user's local date, so it may pass ?date=YYYY-MM-DD. Otherwise: server UTC today.
const dayOf = (req) => req.query.date ?? todayUTC();

// ---- symptom log
export const saveSymptoms = async (req, res) => {
  const { log, created: isNew } = await symptomService.saveDay(req.user.id, req.params.date, req.body);
  return isNew ? created(res, { log }, 'Log saved') : success(res, { log }, 'Log updated');
};
export const getSymptoms = async (req, res) =>
  success(res, { log: await symptomService.getDay(req.user.id, req.params.date) });
export const listSymptoms = async (req, res) =>
  success(res, await symptomService.listDays(req.user.id, req.query));
export const removeSymptoms = async (req, res) => {
  await symptomService.removeDay(req.user.id, req.params.date);
  success(res, null, 'Log deleted');
};

// ---- checklist
export const listItems = async (req, res) =>
  success(res, { items: await checklistService.listItems(req.user.id) });
export const addItem = async (req, res) =>
  created(res, { item: await checklistService.addItem(req.user.id, req.body) }, 'Item added');
export const updateItem = async (req, res) =>
  success(res, { item: await checklistService.updateItem(req.user.id, req.params.itemId, req.body) }, 'Item updated');
export const removeItem = async (req, res) => {
  await checklistService.removeItem(req.user.id, req.params.itemId);
  success(res, null, 'Item removed');
};
export const checklistDay = async (req, res) =>
  success(res, await checklistService.getDay(req.user.id, dayOf(req)));
export const setCompletion = async (req, res) =>
  success(res, await checklistService.setCompletion(req.user.id, req.params.date, req.params.itemId, req.body.completed));
export const checklistHistory = async (req, res) =>
  success(res, { days: await checklistService.getHistory(req.user.id, req.query) });

// ---- hydration
export const hydrationDay = async (req, res) =>
  success(res, await hydrationService.getDay(req.user.id, dayOf(req)));
export const hydrationDone = async (req, res) =>
  success(res, await hydrationService.setDone(req.user.id, req.params.date, req.params.time, req.body.done));

// ---- reminders
export const getReminders = async (req, res) =>
  success(res, { reminders: await reminderService.getReminders(req.user.id, dayOf(req)) });
export const updateReminder = async (req, res) =>
  success(res, { reminder: await reminderService.updateReminder(req.user.id, req.params.type, req.body, dayOf(req)) }, 'Reminder saved');
export const getSchedule = async (req, res) =>
  success(res, await reminderService.getSchedule(req.user.id, { days: req.query.days }, dayOf(req)));

// ---- tips, self-care, public content
export const getTips = async (req, res) =>
  success(res, await tipService.getTips(req.user.id, { category: req.query.category }, dayOf(req)));
export const selfCareToday = async (req, res) =>
  success(res, await selfCareService.getToday(req.user.id, dayOf(req)));
export const getContent = async (_req, res) => success(res, await contentService.getContent());
