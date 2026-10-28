import express, { Router } from 'express';
import { authenticateUser } from '../middlewares/auth.middleware.js';
import { requireFeatureEnabled } from '../middlewares/featureGate.middleware.js';
import { userLimiter } from '../middlewares/rateLimiter.middleware.js';
import { rejectUnsafeInput } from '../middlewares/sanitize.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { success } from '../utils/response.util.js';
import * as periodController from '../controllers/period.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import * as cycleController from '../controllers/cycle.controller.js';
import * as daily from '../controllers/daily.controller.js';
import * as syncController from '../controllers/sync.controller.js';
import { syncRules, eraseRules } from '../validators/sync.validator.js';
import {
  createPeriodRules, updatePeriodRules, periodIdRules, listPeriodRules, calendarRules, settingsRules,
} from '../validators/tracking.validator.js';
import {
  saveSymptomRules, symptomDateRules, listSymptomRules, addItemRules, updateItemRules, itemIdRules,
  checklistDayRules, setCompletionRules, checklistHistoryRules, hydrationDayRules, hydrationDoneRules,
  updateReminderRules, scheduleRules, remindersRules, tipRules, selfCareRules,
} from '../validators/daily.validator.js';

const router = Router();

// Every route here belongs to a logged-in DBI user and only ever touches that user's data.
router.use(authenticateUser);
// Per-user (not per-IP) limit, so phones sharing a carrier IP do not block each other.
router.use(userLimiter);

// Lets the frontend confirm that its DBI token is accepted by HerCare.
router.get('/me', (req, res) => success(res, { user: req.user }));

// Data rights stay available even when the admin switches HerCare off.
router.get('/export', syncController.exportData);
router.delete('/data', eraseRules, validate, syncController.eraseData);

// Admin's on/off switch: everything below returns 503 FEATURE_DISABLED while it is off.
router.use(requireFeatureEnabled);

router.get('/settings', settingsController.get);
router.patch('/settings', settingsRules, validate, settingsController.update);

router.get('/periods', listPeriodRules, validate, periodController.list);
router.post('/periods', createPeriodRules, validate, periodController.create);
router.get('/periods/:id', periodIdRules, validate, periodController.get);
router.patch('/periods/:id', updatePeriodRules, validate, periodController.update);
router.delete('/periods/:id', periodIdRules, validate, periodController.remove);

router.get('/cycle/estimate', cycleController.estimate);
router.get('/cycle/calendar', calendarRules, validate, cycleController.calendar);

// Symptom and flow log: one entry per date, PUT replaces it
router.get('/symptoms', listSymptomRules, validate, daily.listSymptoms);
router.put('/symptoms/:date', saveSymptomRules, validate, daily.saveSymptoms);
router.get('/symptoms/:date', symptomDateRules, validate, daily.getSymptoms);
router.delete('/symptoms/:date', symptomDateRules, validate, daily.removeSymptoms);

// Daily checklist: the user's editable items, and completion per date
router.get('/checklist/items', daily.listItems);
router.post('/checklist/items', addItemRules, validate, daily.addItem);
router.patch('/checklist/items/:itemId', updateItemRules, validate, daily.updateItem);
router.delete('/checklist/items/:itemId', itemIdRules, validate, daily.removeItem);
router.get('/checklist/history', checklistHistoryRules, validate, daily.checklistHistory);
router.get('/checklist', checklistDayRules, validate, daily.checklistDay);
router.put('/checklist/:date/items/:itemId', setCompletionRules, validate, daily.setCompletion);

// Hydration reminders marked done
router.get('/hydration', hydrationDayRules, validate, daily.hydrationDay);
router.put('/hydration/:date/:time', hydrationDoneRules, validate, daily.hydrationDone);

// Reminder preferences, and the schedule the phone should set up
router.get('/reminders', remindersRules, validate, daily.getReminders);
router.get('/reminders/schedule', scheduleRules, validate, daily.getSchedule);
router.patch('/reminders/:type', updateReminderRules, validate, daily.updateReminder);

// Sync: push local changes, pull server changes. Its large (2 MB) body is read here, after the caller
// is authenticated and rate limited; the unsafe-key check has to run again because the body is new.
router.post('/sync', express.json({ limit: '2mb' }), rejectUnsafeInput, syncRules, validate, syncController.sync);

// Reviewed tips, and the one-call Daily Self-Care screen
router.get('/tips', tipRules, validate, daily.getTips);
router.get('/selfcare/today', selfCareRules, validate, daily.selfCareToday);

export default router;
