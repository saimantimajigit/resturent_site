import assert from 'node:assert/strict';

const target=new URL(process.env.PHASE123_BASE_URL||'http://localhost:3006');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE123_BASE_URL must be a plain loopback HTTP URL.');
const base=target.origin;
function pass(label:string){console.log(`PASS ${label}`)}

async function main(){
 const page=await fetch(base);
 assert.equal(page.status,200);
 for(const [name,value] of [['x-content-type-options','nosniff'],['x-frame-options','DENY'],['referrer-policy','strict-origin-when-cross-origin'],['permissions-policy','camera=(), microphone=(), geolocation=()']] as const)assert.equal(page.headers.get(name),value,`${name} missing or incorrect`);
 assert.match(page.headers.get('content-security-policy')||'',/base-uri 'self'; object-src 'none'; frame-ancestors 'none'/);
 assert.equal(page.headers.get('x-powered-by'),null);
 assert.equal(page.headers.get('strict-transport-security'),null,'HSTS must remain disabled until the deployment HTTPS origin is verified');
 pass('security response headers are present and framework version header is disabled');

 const orders=await fetch(`${base}/api/v1/customer/orders`);
 assert.equal(orders.status,401);
 assert.ok(orders.headers.get('cache-control')?.includes('no-store'));
 assert.ok(orders.headers.get('cache-control')?.includes('private'));
 const ordersBody=await orders.json() as {error?:{message?:string}};
 assert.equal(ordersBody.error?.message,'Sign in to view your orders.');
 pass('unauthenticated customer API response is generic and non-cacheable');

 const admin=await fetch(`${base}/api/v1/staff/admin/dashboard`);
 assert.equal(admin.status,401);
 assert.ok(admin.headers.get('cache-control')?.includes('no-store'));
 pass('unauthenticated management API response is denied and non-cacheable');

 const deniedForeign=await fetch(`${base}/api/v1/customer/profile`,{method:'PATCH',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'});
 assert.equal(deniedForeign.status,403);
 const deniedMissing=await fetch(`${base}/api/v1/customer/profile`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(deniedMissing.status,403);
 pass('profile mutations reject foreign and missing Origin headers before authentication or mutation');

 const invalidLogin=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:`${'x'.repeat(260)}@example.com`,password:'long-password'})});
 assert.equal(invalidLogin.status,400);
 assert.ok(invalidLogin.headers.get('cache-control')?.includes('no-store'));
 const oversizedStream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(`email=${'x'.repeat(9000)}&password=long-password`));controller.close()}});
 const chunkedLogin=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:oversizedStream,duplex:'half'} as unknown as RequestInit);
 assert.equal(chunkedLogin.status,400);
 assert.ok(chunkedLogin.headers.get('cache-control')?.includes('no-store'));
 pass('staff login bounds both declared and chunked request bodies before database lookup');

 const invalidDate=await fetch(`${base}/api/v1/reservations/availability?date=2026-02-30&partySize=2`);
 assert.equal(invalidDate.status,400);
 assert.ok(invalidDate.headers.get('cache-control')?.includes('no-store'));
 pass('availability rejects impossible calendar dates before querying reservations');

 console.log('Phase 12.3 integration checks passed: 7');
}

main().catch(error=>{console.error(error);process.exitCode=1});
