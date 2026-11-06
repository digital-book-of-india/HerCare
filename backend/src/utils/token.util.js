import jwt from 'jsonwebtoken';
import env from '../config/env.config.js';

const ADMIN_AUDIENCE = 'hercare-admin';
// Pinned on purpose: a token must use exactly this algorithm, whatever its header claims.
const ALGORITHM = 'HS256';

// DBI issues the user tokens ({ id, role }), signed with DBI's JWT_SECRET. We only verify them.
export const verifyDbiToken = (token) => {
  const payload = jwt.verify(token, env.dbiJwtSecret, { algorithms: [ALGORITHM] });
  // DBI's temporary two-factor token uses the same secret; it must not count as a login.
  if (payload.pending2FA) throw new jwt.JsonWebTokenError('invalid token');
  // DBI always sets an expiry. A signed token without one would work forever, so it is not accepted.
  if (typeof payload.exp !== 'number') throw new jwt.JsonWebTokenError('token has no expiry');
  return payload;
};

// Admin tokens are ours: their own secret and audience, so a DBI token can never pass as admin.
export const signAdminToken = (email) =>
  jwt.sign({ role: 'admin' }, env.jwtSecret, {
    algorithm: ALGORITHM,
    subject: email,
    audience: ADMIN_AUDIENCE,
    expiresIn: env.adminJwtExpiresIn,
  });

export const verifyAdminToken = (token) =>
  jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM], audience: ADMIN_AUDIENCE });
