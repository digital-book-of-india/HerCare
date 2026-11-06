import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const BASE = process.env.API_BASE ?? 'http://localhost:5000/api';
const env = process.env;
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };
const call = async (method, path, body, token) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

const dbiId = '65f1c2a4b8e9d3a7c1f20e11';
// Exactly how DBI signs a user token: jwt.sign({ id, role }, JWT_SECRET, { expiresIn })
const dbiToken = jwt.sign({ id: dbiId, role: 'user' }, env.DBI_JWT_SECRET, { expiresIn: '30d' });

let r = await call('GET', '/user/me', null, dbiToken);
check('DBI user token accepted', r.status === 200 && r.json.data.user.id === dbiId && r.json.data.user.role === 'user', JSON.stringify(r.json));

r = await call('GET', '/user/me');
check('no token 401', r.status === 401);
r = await call('GET', '/user/me', null, 'garbage');
check('garbage token 401', r.status === 401);
r = await call('GET', '/user/me', null, jwt.sign({ id: dbiId }, 'some-other-secret'));
check('token signed with a different secret 401', r.status === 401);
r = await call('GET', '/user/me', null, jwt.sign({ id: dbiId }, env.DBI_JWT_SECRET, { expiresIn: -10 }));
check('expired token 401', r.status === 401);
r = await call('GET', '/user/me', null, jwt.sign({ id: dbiId, pending2FA: true }, env.DBI_JWT_SECRET, { expiresIn: '5m' }));
check('DBI pending-2FA temp token 401', r.status === 401);
r = await call('GET', '/user/me', null, jwt.sign({ id: 'not-an-object-id' }, env.DBI_JWT_SECRET));
check('token with invalid id 401', r.status === 401);
r = await call('GET', '/user/me', null, jwt.sign({ role: 'user' }, env.DBI_JWT_SECRET));
check('token without id 401', r.status === 401);

// admin
r = await call('POST', '/admin/auth/login', { identifier: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
check('admin login 200', r.status === 200 && r.json.data.token, JSON.stringify(r.json));
const adminToken = r.json.data?.token;
r = await call('POST', '/admin/auth/login', { identifier: env.ADMIN_EMAIL, password: 'wrong' });
check('wrong admin password 401', r.status === 401);
r = await call('GET', '/admin/me', null, adminToken);
check('admin token on admin route 200', r.status === 200);
r = await call('GET', '/admin/me', null, dbiToken);
check('DBI user token on admin route 401', r.status === 401);
r = await call('GET', '/admin/me', null, jwt.sign({ id: dbiId, role: 'admin' }, env.DBI_JWT_SECRET));
check('DBI admin-role token on HerCare admin route 401', r.status === 401);
r = await call('GET', '/user/me', null, adminToken);
check('admin token on user route 401', r.status === 401);

// removed endpoints
r = await call('POST', '/auth/register', { email: 'a@b.com', password: 'Passw0rd-one' });
check('old /auth/register is gone (404)', r.status === 404);
r = await call('POST', '/auth/login', { identifier: 'a@b.com', password: 'x' });
check('old /auth/login is gone (404)', r.status === 404);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
