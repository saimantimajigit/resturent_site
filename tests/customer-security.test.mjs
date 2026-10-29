import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rateLimitAddress} from '../src/server/client-address.ts';

const read=path=>readFileSync(path,'utf8');

test('customer reservation pages scope every record to the signed-in guest profile',()=>{
 for(const path of ['src/app/account/page.tsx','src/app/account/reservations/page.tsx','src/app/account/reservations/[id]/page.tsx']){
  assert.match(read(path),/guestProfileId:\s*customer\.guest\.id/);
  assert.match(read(path),/currentCustomer\(\)/);
 }
 assert.match(read('src/app/account/reservations/[id]/page.tsx'),/restaurantId:\s*process\.env\.RESTAURANT_ID/);
});

test('customer login accepts only an active account with a guest profile',()=>{
 const route=read('src/app/api/v1/customer/login/route.ts');
 assert.match(route,/user\.status\s*!==\s*'ACTIVE'/);
 assert.match(route,/guestProfile\.findUnique\(\{where:\{userId:user\.id\}\}\)/);
});

test('dish details and favorites are limited to published dishes for this restaurant',()=>{
 assert.match(read('src/app/menu/[slug]/page.tsx'),/status:'PUBLISHED',menuCategoryRef:\{menuRef:\{restaurantId(?:,|:process\.env\.RESTAURANT_ID),published:true\}\}/);
 const route=read('src/app/api/v1/customer/favorites/route.ts');
 assert.match(route,/const customer=await currentCustomer\(\)/);
 assert.match(route,/status:'PUBLISHED',menuCategoryRef:\{menuRef:\{restaurantId:process\.env\.RESTAURANT_ID,published:true\}\}/);
});

test('registration stores a password hash and creates a linked guest profile transactionally',()=>{
 const route=read('src/app/api/v1/customer/register/route.ts');
 assert.match(route,/hash\(body\.password,12\)/);
 assert.match(route,/tx\.guestProfile\.create\(\{data:\{userId:created\.id/);
 assert.match(route,/db\.\$transaction/);
});

test('reservations from signed-in customers use their owned guest profile',()=>{
 const source=read('src/server/reservations.ts');
 assert.match(source,/const customer=await currentCustomer\(\)/);
 assert.match(source,/customer\s*\?\s*await tx\.guestProfile\.findUniqueOrThrow\(\{where:\{id:customer\.guest\.id\}\}\)/);
});

test('same-origin validation rejects missing and foreign Origin headers',()=>{
 const security=read('src/server/request-security.ts');
 assert.match(security,/if\(!origin\)return false/);
 assert.match(security,/new URL\(origin\)\.origin===new URL\(request\.url\)\.origin/);
 for(const route of ['src/app/api/v1/auth/login/route.ts','src/app/api/v1/auth/logout/route.ts','src/app/api/v1/customer/login/route.ts','src/app/api/v1/customer/register/route.ts','src/app/api/v1/customer/profile/route.ts','src/app/api/v1/customer/favorites/route.ts','src/app/api/v1/private-dining/route.ts','src/app/api/v1/reservations/route.ts','src/app/api/v1/staff/reservations/[id]/status/route.ts']) assert.match(read(route),/rejectCrossOrigin/);
});

test('login attempts use persistent email and IP rate limits with retry guidance',()=>{
 const limiter=read('src/server/auth-rate-limit.ts');
 const migration=read('prisma/migrations/20261013000100_auth_rate_limit/migration.sql');
 assert.match(limiter,/INSERT INTO "AuthRateLimit"/);
 assert.match(limiter,/ON CONFLICT/);
 assert.match(limiter,/EMAIL_LIMIT=5/);
 assert.match(limiter,/IP_LIMIT=30/);
 assert.match(limiter,/Retry-After/);
 assert.match(migration,/CREATE TABLE "AuthRateLimit"/);
});

test('production rate limits ignore caller-supplied forwarding addresses unless a trusted single-value proxy header is configured',()=>{
 const first=new Request('http://localhost/api',{headers:{'x-real-ip':'203.0.113.1','x-forwarded-for':'203.0.113.1'}});
 const spoofed=new Request('http://localhost/api',{headers:{'x-real-ip':'198.51.100.9','x-forwarded-for':'198.51.100.9'}});
 assert.equal(rateLimitAddress(first,{production:true}),'trusted-proxy-unconfigured');
 assert.equal(rateLimitAddress(spoofed,{production:true}),'trusted-proxy-unconfigured');
 assert.equal(rateLimitAddress(first,{production:true,trustedHeader:'x-real-ip'}),'203.0.113.1');
 const clientForwardingSpoof=new Request('http://localhost/api',{headers:{'x-real-ip':'203.0.113.1','x-forwarded-for':'198.51.100.9'}});
 assert.equal(rateLimitAddress(clientForwardingSpoof,{production:true,trustedHeader:'x-real-ip'}),'203.0.113.1');
 assert.equal(rateLimitAddress(new Request('http://localhost/api',{headers:{'x-forwarded-for':'198.51.100.9'}}),{production:true,trustedHeader:'x-real-ip'}),'unknown');
 assert.equal(rateLimitAddress(new Request('http://localhost/api',{headers:{'x-real-ip':'203.0.113.1, 198.51.100.9'}}),{production:true,trustedHeader:'x-real-ip'}),'unknown');
 assert.equal(rateLimitAddress(first,{production:true,trustedHeader:'x-forwarded-for'}),'trusted-proxy-unconfigured');
});

test('session tokens are hashed, expire, honor revocation and require active accounts',()=>{
 const session=read('src/server/session.ts');
 assert.match(session,/createHash\('sha256'\)/);
 assert.match(session,/session\.expiresAt<new Date\(\)/);
 assert.match(session,/session\.revokedAt/);
 assert.match(session,/user\?\.status==='ACTIVE'/);
 for(const path of ['src/app/api/v1/auth/login/route.ts','src/app/api/v1/customer/login/route.ts','src/app/api/v1/customer/register/route.ts']){
  const route=read(path);
  assert.match(route,/randomBytes\(32\)/);
  assert.match(route,/httpOnly:true/);
  assert.match(route,/secure:process\.env\.NODE_ENV==='production'/);
  assert.match(route,/sameSite:'lax'/);
 }
 const qrClaim=read('src/app/api/v1/qr/claim/route.ts');
 assert.match(qrClaim,/sameSite:'strict'/);
 assert.match(qrClaim,/path:'\/api\/v1\/qr'/);
});

test('live customer, QR, kitchen and floor status changes have polite screen-reader announcements',()=>{
 for(const path of ['src/components/order-tracker.tsx','src/components/qr-order-tracking.tsx','src/components/order-status-action.tsx','src/components/order-queue-refresh.tsx','src/components/floor-live-board.tsx']){
  assert.match(read(path),/aria-live="polite"/);
 }
 assert.match(read('src/components/qr-menu.tsx'),/role="status" aria-live="polite"/);
 const css=read('src/app/globals.css');
 assert.match(css,/outline:3px solid var\(--forest\).*box-shadow:0 0 0 6px var\(--gold\)/);
 assert.match(css,/\.button-small\{min-height:44px/);
 assert.match(css,/\.floor-actions \.button\{min-height:44px/);
 assert.match(css,/\.qr-quantity button\{width:44px;height:44px/);
});
