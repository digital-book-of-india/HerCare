import ApiError from '../utils/apiError.util.js';
import { findUnsafeKey } from '../utils/unsafeKeys.util.js';

// Rejects (instead of silently rewriting) any request whose body or query contains an attack-shaped
// key. Every route also validates its own fields; this is the shared safety net underneath.
export const rejectUnsafeInput = (req, _res, next) => {
  for (const [place, value] of [['body', req.body], ['query', req.query]]) {
    if (findUnsafeKey(value) !== null) throw ApiError.badRequest(`The request ${place} contains a field name that is not allowed`);
  }
  // `?limit=1&limit=2` arrives as a list. No HerCare endpoint takes a repeated parameter, and
  // validators would otherwise check each element on its own and let the list through.
  for (const [name, value] of Object.entries(req.query ?? {})) {
    if (Array.isArray(value)) throw ApiError.badRequest(`Query parameter ${name} must be given once`);
  }
  next();
};

// Health data must never be stored by a browser, proxy or CDN.
export const noStore = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};
