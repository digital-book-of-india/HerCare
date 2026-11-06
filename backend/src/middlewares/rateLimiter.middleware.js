import rateLimit from 'express-rate-limit';
import env from '../config/env.config.js';

const base = { windowMs: 15 * 60 * 1000, standardHeaders: true, legacyHeaders: false };
const refusal = (message) => ({ success: false, error: { code: 'RATE_LIMITED', message } });

// Per IP, for every request: a floor against floods. Runs before request bodies are parsed.
export const ipLimiter = rateLimit({ ...base, limit: env.rateLimit, message: refusal('Too many requests, try again later') });

// Admin login: only FAILED attempts count, so a few wrong passwords lock the door for a while
// while normal use is never slowed down.
export const authLimiter = rateLimit({
  ...base,
  limit: env.authRateLimit,
  skipSuccessfulRequests: true,
  message: refusal('Too many failed attempts, try again later'),
});

// Per signed-in user (after authenticateUser). Keyed by user id, not IP, because many phones
// share one mobile-carrier IP and must not block each other.
export const userLimiter = rateLimit({
  ...base,
  limit: env.userRateLimit,
  keyGenerator: (req) => req.user.id,
  message: refusal('Too many requests, slow down and try again shortly'),
});
