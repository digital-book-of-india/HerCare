import { createHash, timingSafeEqual } from 'node:crypto';
import env from '../config/env.config.js';
import ApiError from '../utils/apiError.util.js';
import { signAdminToken } from '../utils/token.util.js';

// Compare fixed-length digests so the check is constant-time regardless of input length.
const digest = (value) => createHash('sha256').update(value).digest();
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b));

// Admin is a predefined account (ADMIN_EMAIL / ADMIN_PASSWORD in .env), not a database user.
// User accounts belong to the main DBI app; HerCare only verifies DBI's tokens.
// (Successful and failed sign-ins are logged by the controller, which knows the caller's address.)
export const adminLogin = async ({ identifier, password }) => {
  const email = env.adminEmail.toLowerCase();
  const emailOk = safeEqual(identifier.trim().toLowerCase(), email);
  const passwordOk = safeEqual(password, env.adminPassword);
  if (!emailOk || !passwordOk) throw ApiError.unauthorized('Invalid credentials');
  return { admin: { email, role: 'admin' }, token: signAdminToken(email) };
};
