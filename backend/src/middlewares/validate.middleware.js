import { validationResult, matchedData } from 'express-validator';
import ApiError from '../utils/apiError.util.js';

// Place after a list of express-validator checks.
const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(ApiError.badRequest('Validation failed', details));
  }

  // Express 5 makes req.query read-only, so converted values (toInt, toBoolean) would be lost
  // and "false" would stay a truthy string. Put the converted values back for the controllers.
  const converted = matchedData(req, { locations: ['query'] });
  if (Object.keys(converted).length > 0) {
    Object.defineProperty(req, 'query', {
      value: { ...req.query, ...converted },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return next();
};

export default validate;
