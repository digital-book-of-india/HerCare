import { body, param, query } from 'express-validator';
import { dateRule } from './tracking.validator.js';
import {
  SYMPTOMS, FLOWS, MOODS, ENERGY_LEVELS, REMINDER_TYPES, TIP_CATEGORIES, TIME_OF_DAY_RE,
} from '../utils/constants.util.js';

const timeRule = (chain, field) =>
  chain.isString().bail().custom((v) => TIME_OF_DAY_RE.test(v)).withMessage(`${field} must be HH:MM (24-hour)`);

const dateParam = dateRule(param('date'), 'date');
const optionalDateQuery = dateRule(query('date').optional(), 'date');
const itemIdParam = param('itemId').isMongoId().withMessage('Invalid item id');
const oneOf = (list) => (v) => list.includes(v);

// ---- symptom log
export const saveSymptomRules = [
  dateParam,
  body('symptoms').optional().isArray({ max: SYMPTOMS.length }).withMessage('symptoms must be a list'),
  body('symptoms.*').custom(oneOf(SYMPTOMS)).withMessage(`symptoms can only be: ${SYMPTOMS.join(', ')}`),
  body('flow').optional({ values: 'null' }).custom(oneOf(FLOWS)).withMessage(`flow must be one of: ${FLOWS.join(', ')}`),
  body('mood').optional({ values: 'null' }).custom(oneOf(MOODS)).withMessage(`mood must be one of: ${MOODS.join(', ')}`),
  body('energy').optional({ values: 'null' }).custom(oneOf(ENERGY_LEVELS)).withMessage(`energy must be one of: ${ENERGY_LEVELS.join(', ')}`),
  body('note').optional({ values: 'null' }).isString().isLength({ max: 500 }).withMessage('note can be at most 500 characters'),
];
export const symptomDateRules = [dateParam];
export const listSymptomRules = [
  dateRule(query('from').optional(), 'from'),
  dateRule(query('to').optional(), 'to'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100').toInt(),
];

// ---- checklist
const labelRule = (chain) => chain.isString().trim().isLength({ min: 1, max: 80 }).withMessage('label must be 1-80 characters');
export const addItemRules = [labelRule(body('label'))];
export const updateItemRules = [
  itemIdParam,
  labelRule(body('label').optional()),
  body('order').optional().isInt({ min: 0, max: 1000 }).toInt(),
  body().custom((value) => {
    if (value.label === undefined && value.order === undefined) throw new Error('Provide label or order');
    return true;
  }),
];
export const itemIdRules = [itemIdParam];
export const checklistDayRules = [optionalDateQuery];
export const setCompletionRules = [
  dateParam,
  itemIdParam,
  body('completed').isBoolean().withMessage('completed must be true or false').toBoolean(),
];
export const checklistHistoryRules = [dateRule(query('from'), 'from'), dateRule(query('to'), 'to')];

// ---- hydration
export const hydrationDayRules = [optionalDateQuery];
export const hydrationDoneRules = [
  dateParam,
  timeRule(param('time'), 'time'),
  body('done').isBoolean().withMessage('done must be true or false').toBoolean(),
];

// ---- reminders
const typeParam = param('type').custom(oneOf(REMINDER_TYPES)).withMessage(`type must be one of: ${REMINDER_TYPES.join(', ')}`);
export const updateReminderRules = [
  typeParam,
  body('enabled').optional().isBoolean().withMessage('enabled must be true or false').toBoolean(),
  body('paused').optional().isBoolean().withMessage('paused must be true or false').toBoolean(),
  body('leadDays').optional().isInt({ min: 0, max: 7 }).withMessage('leadDays must be 0-7').toInt(),
  timeRule(body('timeOfDay').optional(), 'timeOfDay'),
  body('times').optional().isArray({ max: 12 }).withMessage('times can have at most 12 entries'),
  timeRule(body('times.*'), 'each time'),
  body('snoozeDays').optional({ values: 'null' }).isInt({ min: 0, max: 30 }).withMessage('snoozeDays must be 0-30').toInt(),
  body().custom((value) => {
    const keys = ['enabled', 'paused', 'leadDays', 'timeOfDay', 'times', 'snoozeDays'];
    if (!keys.some((k) => value[k] !== undefined)) throw new Error(`Provide at least one of: ${keys.join(', ')}`);
    return true;
  }),
];
export const scheduleRules = [
  query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be 1-90').toInt(),
  optionalDateQuery,
];
export const remindersRules = [optionalDateQuery];

// ---- tips and self-care
export const tipRules = [
  query('category').optional().custom(oneOf(TIP_CATEGORIES)).withMessage(`category must be one of: ${TIP_CATEGORIES.join(', ')}`),
  optionalDateQuery,
];
export const selfCareRules = [optionalDateQuery];
