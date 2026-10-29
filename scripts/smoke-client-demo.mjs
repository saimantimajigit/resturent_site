import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const secretPath = resolve(process.cwd(), '.env.client-demo');
if (!existsSync(secretPath)) throw new Error('Run npm run demo:prepare first.');
const env = dotenv.parse(readFileSync(secretPath));
const origin = process.env.SAVORE_DEMO_BASE_URL || env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3015';
const qrCode = env.DEMO_QR_T03_TOKEN;
if (!/^savore_client_demo_[a-z0-9_]+$/.test(decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1))) || !/^[a-f0-9]{64}$/i.test(qrCode || '')) {
  throw new Error('Demo smoke checks require the isolated database and local QR fixture.');
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}
async function request(path, init = {}) {
  return fetch(new URL(path, origin), { redirect: 'manual', ...init });
}
function cookie(response) {
  return (response.headers.getSetCookie?.() || []).map((value) => value.split(';', 1)[0]).find((value) => value.startsWith('savore_session=')) || '';
}
async function page(path, expectedCookie = '', expectedStatus = 200, label = path) {
  const response = await request(path, { headers: expectedCookie ? { Cookie: expectedCookie } : {} });
  check(`HTTP ${label}`, response.status === expectedStatus, `${response.status}`);
  return response;
}

const health = await request('/api/health');
check('database-aware health endpoint', health.status === 200);
for (const path of ['/', '/menu', '/our-story', '/experiences/chef-tasting', '/reservations', '/cart', '/order-online']) await page(path);

const customerLogin = await request('/api/v1/customer/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ email: 'customer.demo@savore.example.test', password: env.DEMO_CUSTOMER_PASSWORD }),
});
const customerCookie = cookie(customerLogin);
check('customer login creates a session cookie', customerLogin.status === 200 && Boolean(customerCookie));
await page('/account', customerCookie);
await page('/account/reservations', customerCookie);
await page('/account/favorites', customerCookie);
const customerStaffPage = await request('/staff/host', { headers: { Cookie: customerCookie } });
check('customer is redirected away from host operations', customerStaffPage.status >= 300 && customerStaffPage.status < 400);

async function staffLogin(role, email, password) {
  const body = new URLSearchParams({ email, password });
  const response = await request('/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin }, body,
  });
  const result = cookie(response);
  check(`${role} login creates a session cookie`, response.status === 303 && Boolean(result));
  return result;
}
const hostCookie = await staffLogin('host', 'host.demo@savore.example.test', env.DEMO_HOST_PASSWORD);
await page('/staff/host', hostCookie);
await page('/staff/host/calendar', hostCookie);
await page('/staff/floor', hostCookie);
await page('/staff/waitlist', hostCookie);
const waiterCookie = await staffLogin('waiter', 'waiter.demo@savore.example.test', env.DEMO_WAITER_PASSWORD);
await page('/staff/service', waiterCookie);
const waiterKitchenPage = await request('/staff/kitchen', { headers: { Cookie: waiterCookie } });
check('waiter is redirected away from kitchen operations', waiterKitchenPage.status >= 300 && waiterKitchenPage.status < 400);
const chefCookie = await staffLogin('chef', 'chef.demo@savore.example.test', env.DEMO_CHEF_PASSWORD);
await page('/staff/kitchen', chefCookie);
const chefAdminPage = await request('/staff/admin', { headers: { Cookie: chefCookie } });
check('chef is redirected away from administration', chefAdminPage.status >= 300 && chefAdminPage.status < 400);
const managerCookie = await staffLogin('manager', 'manager.demo@savore.example.test', env.DEMO_MANAGER_PASSWORD);
await page('/staff/admin', managerCookie);
await page('/staff/admin/reports', managerCookie);
const ownerCookie = await staffLogin('owner', 'owner.demo@savore.example.test', env.DEMO_OWNER_PASSWORD);
await page('/staff/admin/settings', ownerCookie);

await page(`/qr/${qrCode}`, '', 200, 'T03 QR welcome page');
const claim = await request('/api/v1/qr/claim', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({ code: qrCode }),
});
const qrCookie = (claim.headers.getSetCookie?.() || []).map((value) => value.split(';', 1)[0]).find((value) => value.startsWith('savore_qr_access=')) || '';
check('occupied T03 QR claim succeeds', claim.status === 200 && Boolean(qrCookie));
const qrMenu = await request('/api/v1/qr/menu', { headers: { Cookie: qrCookie } });
check('QR guest can read the published menu', qrMenu.status === 200);

console.log(`${checks.filter((item) => item.ok).length}/${checks.length} demo HTTP checks passed.`);
if (checks.some((item) => !item.ok)) process.exitCode = 1;
