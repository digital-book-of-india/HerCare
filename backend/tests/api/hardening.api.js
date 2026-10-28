// Security hardening, checked against a server started with LOW rate limits (see runApi.script.js):
// RATE_LIMIT=250, USER_RATE_LIMIT=20, AUTH_RATE_LIMIT=5.
import 'dotenv/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const env = process.env;
const API = process.env.API_BASE ?? 'http://localhost:5000/api';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

const hex = () => Array.from({ length: 24 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
const userToken = (id, options = {}) => jwt.sign({ id, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h', ...options });
const b64 = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');

const call = async (method, path, { body, token, headers = {}, raw } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(raw === undefined && body !== undefined && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, headers: res.headers, json };
};

const attacker = hex();
const attackerToken = userToken(attacker);

try {
  // ---------------------------------------------------------------- headers
  let r = await call('GET', '/health');
  check('health: 200 and reports the database as up', r.status === 200 && r.json.data.db === 'up' && r.json.data.status === 'ok', JSON.stringify(r.json));
  check('header: X-Content-Type-Options nosniff', r.headers.get('x-content-type-options') === 'nosniff');
  check('header: X-Powered-By is not sent', r.headers.get('x-powered-by') === null);
  check('header: Strict-Transport-Security is set', /max-age=/.test(r.headers.get('strict-transport-security') ?? ''));
  check('header: framing is blocked', Boolean(r.headers.get('x-frame-options')) || /frame-ancestors/.test(r.headers.get('content-security-policy') ?? ''));
  check('header: responses are never cached (no-store)', /no-store/.test(r.headers.get('cache-control') ?? ''));
  r = await call('GET', '/user/me', { token: attackerToken });
  check('no-store also on authenticated responses', /no-store/.test(r.headers.get('cache-control') ?? ''));
  r = await call('GET', '/nowhere');
  check('no-store also on error responses', r.status === 404 && /no-store/.test(r.headers.get('cache-control') ?? ''));
  r = await call('GET', '/content');
  check('CORS: no cross-origin access is granted by default', r.headers.get('access-control-allow-origin') === null);
  r = await call('GET', '/content', { headers: { Origin: 'https://evil.example' } });
  check('CORS: a foreign origin is not allowed', r.headers.get('access-control-allow-origin') === null);

  // ---------------------------------------------------------------- injection
  r = await call('POST', '/admin/auth/login', { body: { identifier: { $ne: '' }, password: { $ne: '' } } });
  check('injection: operator objects as admin credentials -> 400', r.status === 400, JSON.stringify(r.json));
  r = await call('POST', '/user/periods', { token: attackerToken, body: { startDate: '2024-01-01', $where: 'sleep(5000)' } });
  check('injection: a $where key in the body -> 400', r.status === 400 && /not allowed/.test(r.json?.error?.message ?? ''), JSON.stringify(r.json));
  r = await call('POST', '/user/sync', { token: attackerToken, body: { changes: { periods: [{ id: hex(), startDate: '2024-01-01', 'a.b': 1 }] } } });
  check('injection: a dotted key deep inside a sync record -> 400', r.status === 400, JSON.stringify(r.json));
  r = await call('POST', '/user/periods', { token: attackerToken, raw: '{"__proto__":{"isAdmin":true},"startDate":"2024-01-01"}', headers: { 'Content-Type': 'application/json' } });
  check('prototype pollution: a __proto__ key -> 400', r.status === 400, JSON.stringify(r.json));
  r = await call('GET', '/user/periods?$where=1', { token: attackerToken });
  check('injection: a $ key in the query string -> 400', r.status === 400);
  r = await call('GET', '/user/periods?from.x=1', { token: attackerToken });
  check('injection: a dotted key in the query string -> 400', r.status === 400);
  r = await call('GET', '/user/periods?limit=1&limit=2', { token: attackerToken });
  check('parameter pollution: a repeated query parameter -> 400', r.status === 400 && /once/.test(r.json?.error?.message ?? ''), JSON.stringify(r.json));
  r = await call('GET', '/user/symptoms?date=2024-01-01&date=2024-01-02', { token: attackerToken });
  check('parameter pollution on a date -> 400', r.status === 400);
  r = await call('POST', '/user/periods', { token: attackerToken, raw: 'startDate=2024-01-01', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  check('a form-encoded body is not accepted as data -> 400', r.status === 400);
  r = await call('POST', '/user/periods', { token: attackerToken, raw: '{"startDate":', headers: { 'Content-Type': 'application/json' } });
  check('malformed JSON -> 400 in the standard format', r.status === 400 && r.json?.success === false && r.json.error.code === 'BAD_REQUEST');
  r = await call('POST', '/user/periods', { token: attackerToken, body: { startDate: '2024-01-01', notes: 'x'.repeat(11_000) } });
  check('an 11 KB body on a normal route -> 413 PAYLOAD_TOO_LARGE', r.status === 413 && r.json?.error?.code === 'PAYLOAD_TOO_LARGE', JSON.stringify(r.json));
  r = await call('GET', '/user/periods?limit=1%00', { token: attackerToken });
  check('a null byte in a value does not crash the server', r.status < 500);
  r = await call('GET', '/health');
  check('the server is still healthy after all of that', r.status === 200);

  // ---------------------------------------------------------------- tokens
  r = await call('GET', '/user/me', { token: userToken(attacker) });
  check('control: a correct HS256 DBI token works', r.status === 200 && r.json.data.user.id === attacker);
  const noneToken = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: attacker, role: 'user' })}.`;
  r = await call('GET', '/user/me', { token: noneToken });
  check('token: alg "none" (unsigned) is refused', r.status === 401);
  r = await call('GET', '/user/me', { token: userToken(attacker, { algorithm: 'HS512' }) });
  check('token: a different algorithm is refused even with the right secret (HS256 is pinned)', r.status === 401);
  const valid = userToken(attacker);
  r = await call('GET', '/user/me', { token: `${valid.slice(0, -2)}${valid.endsWith('A') ? 'BB' : 'AA'}` });
  check('token: a tampered signature is refused', r.status === 401);
  const [head, , sig] = valid.split('.');
  r = await call('GET', '/user/me', { token: `${head}.${b64({ id: hex(), role: 'user', exp: Math.floor(Date.now() / 1000) + 3600 })}.${sig}` });
  check('token: a tampered payload (someone else\'s id) is refused', r.status === 401);
  r = await call('GET', '/user/me', { token: jwt.sign({ id: attacker }, env.JWT_SECRET, { expiresIn: '1h' }) });
  check('token: a token signed with HerCare\'s admin secret is not a user token', r.status === 401);
  r = await call('GET', `/user/me?token=${valid}`);
  check('token: a token in the URL is not accepted', r.status === 401);
  r = await call('GET', '/user/me', { headers: { Cookie: `token=${valid}` } });
  check('token: a token in a cookie is not accepted', r.status === 401);
  r = await call('GET', '/user/me', { headers: { Authorization: valid } });
  check('token: a header without the Bearer prefix is not accepted', r.status === 401);
  r = await call('GET', '/user/me', { token: userToken(attacker, { expiresIn: -60 }) });
  check('token: an expired token is refused', r.status === 401);
  r = await call('GET', '/user/me', { token: jwt.sign({ id: attacker, pending2FA: true }, env.DBI_JWT_SECRET, { expiresIn: '5m' }) });
  check('token: DBI\'s half-finished two-factor token is refused', r.status === 401);

  r = await call('GET', '/user/me', { token: jwt.sign({ id: attacker, role: 'user' }, env.DBI_JWT_SECRET) });
  check('token: a DBI-signed token that never expires is refused', r.status === 401);
  r = await call('GET', '/user/me', { token: jwt.sign({ id: 'abcdefghijkl', role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('token: an id that is not exactly 24 hex characters is refused (even a 12-character text)', r.status === 401);

  // ---------------------------------------------------------------- which DBI account kinds may use HerCare
  // (this server is started with DBI_ALLOWED_ROLES=user)
  const kind = hex();
  r = await call('GET', '/user/me', { token: jwt.sign({ id: kind, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('account kinds: a "user" token is accepted', r.status === 200);
  r = await call('GET', '/user/me', { token: jwt.sign({ id: kind, role: 'partner' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('account kinds: a "partner" token is refused with 403 FORBIDDEN', r.status === 403 && r.json?.error?.code === 'FORBIDDEN', JSON.stringify(r.json));
  r = await call('GET', '/user/me', { token: jwt.sign({ id: kind }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('account kinds: a token with no role (a business account) is NOT mistaken for a user', r.status === 403);
  r = await call('GET', '/user/me', { token: jwt.sign({ id: kind, role: 'admin' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('account kinds: a DBI admin token is refused as a HerCare user', r.status === 403);
  r = await call('GET', '/admin/dashboard', { token: jwt.sign({ id: kind, role: 'admin' }, env.DBI_JWT_SECRET, { expiresIn: '1h' }) });
  check('account kinds: and still never works on the HerCare admin routes', r.status === 401);

  // ---------------------------------------------------------------- big bodies are read only after the caller is identified
  const brokenBody = `{"a":${'1,'.repeat(400_000)}`;
  r = await call('POST', '/user/sync', { raw: brokenBody, headers: { 'Content-Type': 'application/json' } });
  check('anonymous caller: a 0.8 MB broken body gets 401, so it was never even parsed (400 would mean it was)', r.status === 401, String(r.status));
  r = await call('POST', '/user/sync', { token: jwt.sign({ id: 'a'.repeat(24), role: 'user' }, 'wrong-secret', { expiresIn: '1h' }), raw: brokenBody, headers: { 'Content-Type': 'application/json' } });
  check('forged token: same, 401 before the body is read', r.status === 401);
  const sizeUser = userToken(hex());
  r = await call('POST', '/user/sync', { token: sizeUser, body: { changes: { periods: [{ notes: 'x'.repeat(2_300_000) }] } } });
  check('signed-in caller: a body over 2 MB is refused with 413', r.status === 413 && r.json?.error?.code === 'PAYLOAD_TOO_LARGE', String(r.status));
  r = await call('POST', '/user/sync', { token: sizeUser, raw: brokenBody, headers: { 'Content-Type': 'application/json' } });
  check('signed-in caller: a broken body gets 400 in the standard format', r.status === 400 && r.json?.error?.code === 'BAD_REQUEST');
  r = await call('POST', '/user/sync', { token: sizeUser, raw: '{"changes":{"periods":[{"id":"a","$where":"x"}]}}', headers: { 'Content-Type': 'application/json' } });
  check('signed-in caller: attack-shaped keys inside a sync body are still refused (the check runs after the big parser)', r.status === 400 && /not allowed/.test(r.json?.error?.message ?? ''), JSON.stringify(r.json));

  // ---------------------------------------------------------------- admin brute force
  for (let i = 0; i < 8; i += 1) {
    r = await call('POST', '/admin/auth/login', { body: { identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
    if (r.status !== 200) break;
  }
  check('admin login: successful logins are never rate limited (8 in a row)', r.status === 200);
  const adminToken = r.json?.data?.token;
  r = await call('GET', '/admin/dashboard', { token: adminToken });
  check('admin: the token works', r.status === 200);
  r = await call('GET', '/admin/dashboard', { token: userToken(attacker, { algorithm: 'HS512' }) });
  check('admin: a forged algorithm is refused', r.status === 401);

  const codes = [];
  for (let i = 0; i < 5; i += 1) codes.push((await call('POST', '/admin/auth/login', { body: { identifier: env.ADMIN_EMAIL, password: `wrong-password-${i}` } })).status);
  check('admin login: 5 wrong passwords are answered normally (401)', codes.every((c) => c === 401), codes.join(','));
  r = await call('POST', '/admin/auth/login', { body: { identifier: env.ADMIN_EMAIL, password: 'wrong-again' } });
  check('admin login: the 6th failed attempt is blocked (429 RATE_LIMITED)', r.status === 429 && r.json?.error?.code === 'RATE_LIMITED', JSON.stringify(r.json));
  r = await call('POST', '/admin/auth/login', { body: { identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  check('admin login: even the CORRECT password is blocked while locked out', r.status === 429);
  r = await call('GET', '/admin/dashboard', { token: adminToken });
  check('admin: an admin who is already signed in is not affected by the lockout', r.status === 200);

  // ---------------------------------------------------------------- per-user limit (20 per window)
  const busy = hex(), calm = hex();
  const busyToken = userToken(busy), calmToken = userToken(calm);
  let lastBusy;
  let allowed = 0;
  for (let i = 0; i < 20; i += 1) { lastBusy = await call('GET', '/user/me', { token: busyToken }); if (lastBusy.status === 200) allowed += 1; }
  check('per-user limit: the first 20 requests are allowed', allowed === 20, `allowed=${allowed}`);
  r = await call('GET', '/user/me', { token: busyToken });
  check('per-user limit: the 21st is refused (429 RATE_LIMITED)', r.status === 429 && r.json?.error?.code === 'RATE_LIMITED', JSON.stringify(r.json));
  r = await call('GET', '/user/periods', { token: busyToken });
  check('per-user limit: it covers every user route, not just one', r.status === 429);
  r = await call('GET', '/user/me', { token: calmToken });
  check('per-user limit: another user on the SAME IP is not blocked', r.status === 200, String(r.status));
  r = await call('GET', '/health');
  check('per-user limit: /health is not affected', r.status === 200);
  r = await call('GET', '/content');
  check('per-user limit: public routes are not affected', r.status === 200);

  // ---------------------------------------------------------------- per-IP limit (250 per window), last
  let blockedAt = 0;
  for (let i = 1; i <= 400; i += 1) {
    r = await call('GET', '/content');
    if (r.status === 429) { blockedAt = i; break; }
  }
  check('IP limit: a flood from one address is eventually refused (429)', blockedAt > 0 && blockedAt <= 250, `blockedAt=${blockedAt}`);
  check('IP limit: the refusal uses the standard error format', r.json?.error?.code === 'RATE_LIMITED' && r.json?.success === false);
  check('IP limit: standard RateLimit headers are sent', Boolean(r.headers.get('ratelimit-limit')) || Boolean(r.headers.get('ratelimit-policy')));
  r = await call('POST', '/user/periods', { token: calmToken, body: { startDate: '2024-01-01', notes: 'x'.repeat(20_000) } });
  check('IP limit: it is applied BEFORE bodies are parsed (a 20 KB body gets 429, not 413)', r.status === 429, String(r.status));
  r = await call('GET', '/health');
  check('IP limit: monitoring on /health keeps working', r.status === 200);
} catch (err) {
  fail += 1;
  console.log('FAIL  script crashed:', err.stack);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
