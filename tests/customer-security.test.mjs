import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
