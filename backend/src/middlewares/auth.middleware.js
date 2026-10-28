import env from '../config/env.config.js';
import ApiError from '../utils/apiError.util.js';
import { verifyDbiToken, verifyAdminToken } from '../utils/token.util.js';

const readToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
};

// Trusts DBI's signed token. HerCare keeps no user accounts: req.user.id is the DBI user id
// and every HerCare record is keyed by it.
export const authenticateUser = (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized();
  let payload;
  try {
    payload = verifyDbiToken(token);
    // Exactly a 24-character hex id (mongoose.isValidObjectId would also accept any 12-character text).
    if (typeof payload.id !== 'string' || !/^[0-9a-f]{24}$/i.test(payload.id)) throw new Error('bad id');
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  // DBI has several kinds of account (users, businesses, partners, admins) and signs them all with the
  // same secret. When DBI_ALLOWED_ROLES is set, only those kinds may use HerCare. This looks at the role
  // the token CLAIMS: a business token carries none, and must not be mistaken for a plain user.
  if (env.dbiAllowedRoles.length > 0 && !env.dbiAllowedRoles.includes(payload.role)) {
    throw ApiError.forbidden('This kind of account cannot use HerCare');
  }
  req.user = { id: payload.id.toLowerCase(), role: payload.role ?? 'user' };
  next();
};

// Admin is a predefined account from .env, so there is no database lookup.
export const authenticateAdmin = (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw ApiError.unauthorized();
  try {
    const payload = verifyAdminToken(token);
    req.admin = { email: payload.sub, role: payload.role };
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  next();
};
