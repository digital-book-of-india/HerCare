import { body, param, query } from 'express-validator';
import { TIP_CATEGORIES, TIP_SHOW_WHEN } from '../utils/constants.util.js';
import { isValidDate } from '../utils/dates.util.js';

const oneOf = (list) => (value) => list.includes(value);
const idRule = param('id').isMongoId().withMessage('Invalid id');
const atLeastOne = (keys) => body().custom((value) => {
  if (!keys.some((key) => value[key] !== undefined)) throw new Error(`Provide at least one of: ${keys.join(', ')}`);
  return true;
});

// ---- tips
const title = (chain) => chain.isString().trim().isLength({ min: 1, max: 100 }).withMessage('title must be 1-100 characters');
const text = (chain) => chain.isString().trim().isLength({ min: 1, max: 500 }).withMessage('text must be 1-500 characters');
const category = (chain) => chain.custom(oneOf(TIP_CATEGORIES)).withMessage(`category must be one of: ${TIP_CATEGORIES.join(', ')}`);
const showWhen = (chain) => chain.custom(oneOf(TIP_SHOW_WHEN)).withMessage(`showWhen must be one of: ${TIP_SHOW_WHEN.join(', ')}`);

export const createTipRules = [
  category(body('category')),
  title(body('title')),
  text(body('text')),
  showWhen(body('showWhen').optional()),
];

export const updateTipRules = [
  idRule,
  category(body('category').optional()),
  title(body('title').optional()),
  text(body('text').optional()),
  showWhen(body('showWhen').optional()),
  atLeastOne(['category', 'title', 'text', 'showWhen']),
];

export const reviewTipRules = [
  idRule,
  body('reviewedAt').optional().isString().custom((v) => isValidDate(v)).withMessage('reviewedAt must be a real date (YYYY-MM-DD)'),
  body('reviewedBy').optional({ values: 'null' }).isString().trim().isLength({ min: 1, max: 100 }).withMessage('reviewedBy must be 1-100 characters'),
];

export const setActiveRules = [
  idRule,
  body('active').isBoolean().withMessage('active must be true or false').toBoolean(),
];

export const tipIdRules = [idRule];

export const listTipRules = [
  query('category').optional().custom(oneOf(TIP_CATEGORIES)).withMessage(`category must be one of: ${TIP_CATEGORIES.join(', ')}`),
  query('active').optional().isBoolean().withMessage('active must be true or false').toBoolean(),
  query('reviewed').optional().isBoolean().withMessage('reviewed must be true or false').toBoolean(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be 1-200').toInt(),
];

// ---- default content
export const updateContentRules = [
  body('disclaimerText').optional().isString().trim().isLength({ min: 20, max: 2000 }).withMessage('disclaimerText must be 20-2000 characters (the health disclaimer cannot be blank)'),
  body('privacyText').optional().isString().trim().isLength({ min: 20, max: 4000 }).withMessage('privacyText must be 20-4000 characters'),
  body('defaultChecklistItems').optional().isArray({ max: 20 }).withMessage('defaultChecklistItems can have at most 20 items'),
  body('defaultChecklistItems.*.id').isString().matches(/^[a-z0-9-]{1,40}$/).withMessage('each item id must be 1-40 lowercase letters, numbers or hyphens'),
  body('defaultChecklistItems.*.label').isString().trim().isLength({ min: 1, max: 80 }).withMessage('each item label must be 1-80 characters'),
  body('defaultChecklistItems').custom((items) => {
    if (items && new Set(items.map((i) => i?.id)).size !== items.length) throw new Error('item ids must be unique');
    return true;
  }),
  atLeastOne(['disclaimerText', 'privacyText', 'defaultChecklistItems']),
];

// ---- feature switch and defaults
export const updateSettingsRules = [
  body('featureEnabled').optional().isBoolean().withMessage('featureEnabled must be true or false').toBoolean(),
  body('defaultCycleLength').optional().isInt({ min: 15, max: 60 }).withMessage('defaultCycleLength must be 15-60').toInt(),
  body('defaultPeriodDuration').optional().isInt({ min: 1, max: 15 }).withMessage('defaultPeriodDuration must be 1-15').toInt(),
  atLeastOne(['featureEnabled', 'defaultCycleLength', 'defaultPeriodDuration']),
];
