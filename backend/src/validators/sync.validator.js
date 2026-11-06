import { body } from 'express-validator';
import { SYNC_ENTITIES, MAX_RECORDS_PER_ENTITY } from '../services/syncRules.service.js';

export const ERASE_CONFIRMATION = 'DELETE ALL MY DATA';

// Only the shape of the request is checked here. Each record is validated on its own, so one bad
// record is reported and skipped instead of failing the whole sync.
export const syncRules = [
  body('since').optional({ values: 'null' }).isISO8601().withMessage('since must be an ISO date-time'),
  body('epoch').optional({ values: 'null' }).isString().isLength({ max: 64 }).withMessage('epoch must be text of at most 64 characters'),
  body('limit').optional().isInt({ min: 1, max: 2000 }).withMessage('limit must be 1-2000').toInt(),
  body('changes').optional({ values: 'null' }).isObject().withMessage('changes must be an object'),
  body('changes').custom((changes) => {
    if (!changes) return true;
    for (const name of SYNC_ENTITIES) {
      const value = changes[name];
      if (value === undefined) continue;
      if (name === 'settings') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('changes.settings must be an object');
      } else if (!Array.isArray(value)) {
        throw new Error(`changes.${name} must be a list`);
      } else if (value.length > MAX_RECORDS_PER_ENTITY) {
        throw new Error(`changes.${name} can have at most ${MAX_RECORDS_PER_ENTITY} records per request`);
      }
    }
    return true;
  }),
];

export const eraseRules = [
  body('confirm').equals(ERASE_CONFIRMATION).withMessage(`Send { "confirm": "${ERASE_CONFIRMATION}" } to erase all your data`),
];
