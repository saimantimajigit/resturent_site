import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(path,'utf8');
test('booking confirmation does not falsely claim table number',()=>{
 const ui=read('src/app/reservations/booking-form.tsx');
 assert.match(ui,/Confirmed: \${v\.data\.reference}/);
 assert.doesNotMatch(ui,/v\.data\.table/);
});
test('host actions call non-redirecting authorization',()=>{
 assert.match(read('src/server/host-actions.ts'),/authorizeRole/);
 assert.match(read('src/server/session.ts'),/class AuthenticationError/);
 assert.match(read('src/server/session.ts'),/class AuthorizationError/);
});
test('status route sends explicit HTTP 401 and 403',()=>{
 const api=read('src/app/api/v1/staff/reservations/[id]/status/route.ts');
 assert.match(api,/status:401/);assert.match(api,/status:403/);
});
test('reservation engine uses serializable transaction and table lock',()=>{
 const svc=read('src/server/reservations.ts');
 assert.match(svc,/isolationLevel:'Serializable'/);
 assert.match(svc,/pg_advisory_xact_lock/);
});
