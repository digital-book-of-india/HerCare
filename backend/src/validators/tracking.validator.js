import { body, param, query } from 'express-validator';
import { isValidDate, isValidMonth } from '../utils/dates.util.js';

export const dateRule = (chain, field) =>
  chain
    .isString().withMessage(`${field} must be a date string`)
    .bail()
    .custom((value) => isValidDate(value)).withMessage(`${field} must be a real date in YYYY-MM-DD format`);

const notesRule = body('notes').optional({ values: 'null' }).isString().isLength({ max: 500 })
  .withMessage('notes can be at most 500 characters');

const confirmRule = body('confirmOverlap').optional().isBoolean().withMessage('confirmOverlap must be true or false').toBoolean();

const idRule = param('id').isMongoId().withMessage('Invalid id');

export const createPeriodRules = [
  dateRule(body('startDate'), 'startDate'),
  dateRule(body('endDate').optional({ values: 'null' }), 'endDate'),
  notesRule,
  confirmRule,
];

export const updatePeriodRules = [
  idRule,
  dateRule(body('startDate').optional(), 'startDate'),
  dateRule(body('endDate').optional({ values: 'null' }), 'endDate'),
  notesRule,
  confirmRule,
  body().custom((value) => {
    if (!['startDate', 'endDate', 'notes'].some((key) => value[key] !== undefined)) {
      throw new Error('Provide startDate, endDate or notes to update');
    }
    return true;
  }),
];

export const periodIdRules = [idRule];

export const listPeriodRules = [
  dateRule(query('from').optional(), 'from'),
  dateRule(query('to').optional(), 'to'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more').toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200').toInt(),
];

export const calendarRules = [
  query('month').custom((value) => isValidMonth(value)).withMessage('month must be in YYYY-MM format'),
];

export const settingsRules = [
  body('cycleLength').optional().isInt({ min: 15, max: 60 }).withMessage('cycleLength must be 15-60').toInt(),
  body('periodDuration').optional().isInt({ min: 1, max: 15 }).withMessage('periodDuration must be 1-15').toInt(),
  body().custom((value) => {
    if (value.cycleLength === undefined && value.periodDuration === undefined) {
      throw new Error('Provide cycleLength or periodDuration');
    }
    return true;
  }),
];
