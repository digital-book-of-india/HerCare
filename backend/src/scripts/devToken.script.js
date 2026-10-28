// A user token for LOCAL development, so the API can be tried without the DBI app:
//
//   npm run -s dev-token                      a token for a new random user
//   npm run -s dev-token -- --user <24 hex>   a token for a specific user id
//   npm run -s dev-token -- --hours 72        valid for 72 hours (default 24)
//
// It signs a token exactly the way DBI does ({ id, role }, HS256, DBI_JWT_SECRET). Because that is
// all it takes to act as any user, it refuses to run when NODE_ENV=production.
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../config/env.config.js';

const args = process.argv.slice(2);
const option = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);

if (env.nodeEnv === 'production') {
  console.error('dev-token refuses to run with NODE_ENV=production.');
  process.exit(1);
}

const userId = option('user') ?? randomBytes(12).toString('hex');
const hours = Number(option('hours') ?? 24);
if (!/^[0-9a-f]{24}$/i.test(userId)) {
  console.error('--user must be 24 hex characters (a Mongo ObjectId).');
  process.exit(1);
}
if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
  console.error('--hours must be between 1 and 720.');
  process.exit(1);
}

const token = jwt.sign({ id: userId, role: 'user' }, env.dbiJwtSecret, { algorithm: 'HS256', expiresIn: `${hours}h` });
console.error(`Token for user ${userId}, valid for ${hours} hours. Send it as:  Authorization: Bearer <token>`);
console.log(token);
