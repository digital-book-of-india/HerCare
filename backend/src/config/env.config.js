import 'dotenv/config';

const required = [
  'MONGODB_URI', 'JWT_SECRET', 'DBI_JWT_SECRET', 'ENCRYPTION_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes as 64 hex characters');
}

// Admin tokens are signed with JWT_SECRET. If it equalled DBI's secret, anyone who can sign DBI
// user tokens (or who leaks that secret) could also sign admin tokens.
if (process.env.JWT_SECRET === process.env.DBI_JWT_SECRET) {
  throw new Error('JWT_SECRET must be different from DBI_JWT_SECRET');
}

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');
  if (process.env.ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters in production');
}

// How many reverse proxies (load balancer, nginx, Cloudflare) sit in front of the server.
// Without this every user appears to come from the proxy's IP and shares one rate limit.
const parseTrustProxy = (value) => {
  if (value === undefined || value === '' || value === 'false') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. 'loopback' or a subnet
};

// The current key has an id (default k1) that is stored with every encrypted value. After changing
// the key, retired keys stay readable through ENCRYPTION_KEYS_OLD="k1:<64 hex>,k0:<64 hex>".
const encryptionKeyId = process.env.ENCRYPTION_KEY_ID || 'k1';
if (!/^[A-Za-z0-9_-]{1,32}$/.test(encryptionKeyId)) {
  throw new Error('ENCRYPTION_KEY_ID must be 1-32 letters, digits, "-" or "_"');
}
const parseOldKeys = (value) => (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [id, key, ...extra] = entry.split(':');
  if (!id || !key || extra.length > 0) throw new Error('ENCRYPTION_KEYS_OLD must look like "k1:<64 hex>,k0:<64 hex>"');
  return { id, key };
});
const oldEncryptionKeys = parseOldKeys(process.env.ENCRYPTION_KEYS_OLD);
for (const { id, key } of oldEncryptionKeys) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error(`Retired encryption key id "${id}" is not valid`);
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error(`Retired encryption key "${id}" must be 64 hex characters`);
  if (id === encryptionKeyId) throw new Error('ENCRYPTION_KEYS_OLD must not reuse the id of the current key');
}
if (new Set(oldEncryptionKeys.map((k) => k.id)).size !== oldEncryptionKeys.length) {
  throw new Error('ENCRYPTION_KEYS_OLD lists the same key id twice');
}

const positiveInt = (value, fallback) => (Number(value) > 0 ? Number(value) : fallback);

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  corsOrigins: (process.env.CORS_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // Per 15 minutes. RATE_LIMIT is per IP, USER_RATE_LIMIT per signed-in user (so users sharing a
  // mobile-carrier IP do not block each other), AUTH_RATE_LIMIT counts only FAILED admin logins.
  rateLimit: positiveInt(process.env.RATE_LIMIT, 600),
  userRateLimit: positiveInt(process.env.USER_RATE_LIMIT, 300),
  authRateLimit: positiveInt(process.env.AUTH_RATE_LIMIT, 5),
  // Bump this (any text) after restoring the database from a backup. Phones that see a new value
  // reset their sync cursor and send all their data again, so nothing the restore lost stays lost.
  dataEpoch: process.env.DATA_EPOCH || '1',
  // Signs HerCare's own admin tokens.
  jwtSecret: process.env.JWT_SECRET,
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN ?? '8h',
  // Same value as DBI's JWT_SECRET: used only to verify tokens DBI issued to its users.
  dbiJwtSecret: process.env.DBI_JWT_SECRET,
  // Optional: which DBI account types (the `role` in their token) may use HerCare, e.g. "user".
  // Empty means every kind of DBI account is accepted.
  dbiAllowedRoles: (process.env.DBI_ALLOWED_ROLES ?? '').split(',').map((role) => role.trim()).filter(Boolean),
  encryptionKey: process.env.ENCRYPTION_KEY,
  encryptionKeyId,
  oldEncryptionKeys,
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};

export default env;
