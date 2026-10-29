import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE111_BASE_URL||'http://localhost:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE111_BASE_URL must be a plain loopback HTTP URL.');
const origin=target.origin,base=target.origin,run=randomUUID().replaceAll('-','').slice(0,16),ip=`192.0.2.${1+randomBytes(1)[0]%254}`;
const common=(cookie?:string)=>({Origin:origin,'X-Real-IP':ip,...(cookie?{Cookie:cookie}:{})});
function pass(label:string){console.log(`PASS ${label}`)}
function cookie(response:Response){const value=response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie');assert.ok(value,'session cookie missing');return value.split(';',1)[0]}
async function request(path:string,init:RequestInit={},session?:string){return fetch(`${base}${path}`,{...init,headers:{...common(session),...(init.headers||{})}})}
async function register(email:string){const response=await request('/api/v1/customer/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Order Integration Guest',email,password:randomBytes(20).toString('hex')})});assert.equal(response.status,201,await response.text());return cookie(response)}
async function staffCookie(roleCode:'CHEF'|'MANAGER'){
 const user=await db.user.create({data:{email:`phase111.${roleCode.toLowerCase()}.${run}@example.test`,name:`Phase 11 ${roleCode}`,passwordHash:await hash(randomBytes(24).toString('hex'),10)}});
 const role=await db.role.upsert({where:{code:roleCode},create:{code:roleCode,name:roleCode},update:{}});
 const membership=await db.staffMembership.create({data:{userId:user.id,restaurantId:process.env.RESTAURANT_ID!}});
 await db.staffRole.create({data:{staffMembershipId:membership.id,roleId:role.id}});
 const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600_000)}});
 return `savore_session=${token}`;
}
async function body(response:Response){return response.json() as Promise<any>}
async function expectStatus(response:Response,expected:number){if(response.status!==expected)throw new Error(`Expected ${expected}, received ${response.status}: ${await response.text()}`)}

async function main(){
 try{
  const restaurantId=process.env.RESTAURANT_ID!;assert.ok(restaurantId);
  const constraints=await db.$queryRaw<Array<{conname:string}>>`SELECT conname FROM pg_constraint WHERE conname IN ('order_item_quantity_positive','order_amounts_nonnegative')`;
  assert.deepEqual(new Set(constraints.map(row=>row.conname)),new Set(['order_item_quantity_positive','order_amounts_nonnegative']));
  const immutable=await db.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='OrderEvent_immutable' AND NOT tgisinternal) AS present`;
  assert.equal(immutable[0].present,true);pass('order amount constraints and immutable event trigger are installed');
  const sampleOrders=await db.order.findMany({where:{restaurantId,reference:{in:['DEMO-PH11-001','DEMO-PH11-002','DEMO-PH11-003']}},include:{KitchenTicket_orderId:true}});
  assert.equal(sampleOrders.length,3);assert.ok(sampleOrders.every(sample=>sample.KitchenTicket_orderId.length===1));pass('fictional demo order and ticket seed is present and repeatable');
  const dish=await db.menuItem.findFirst({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1}},orderBy:{name:'asc'}});
  assert.ok(dish?.MenuItemPrice_menuItemId[0],'published priced dish required');
  const customerCookie=await register(`phase111.customer.${run}@example.test`);
  const idem=`phase111-${run}-main`;
  const makeOrder=()=>request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':idem},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:2,notes:'No garnish, please.'}]})},customerCookie);
  const created=await makeOrder();await expectStatus(created,201);const createdBody=await body(created);
  const replay=await makeOrder();assert.equal(replay.status,201);assert.equal((await body(replay)).data.id,createdBody.data.id);
  const order=await db.order.findUnique({where:{id:createdBody.data.id},include:{OrderItem_orderId:true,KitchenTicket_orderId:{include:{KitchenTicketItem_kitchenTicketId:true}},Payment_orderId:true,OrderEvent_orderId:true}});
  assert.ok(order);assert.equal(order.OrderItem_orderId.length,1);assert.equal(order.OrderItem_orderId[0].quantity,2);assert.equal(order.OrderItem_orderId[0].notes,'No garnish, please.');assert.equal(order.OrderItem_orderId[0].unitPriceMinor,BigInt(dish.MenuItemPrice_menuItemId[0].amountMinor));assert.equal(order.KitchenTicket_orderId.length,1);assert.equal(order.KitchenTicket_orderId[0].KitchenTicketItem_kitchenTicketId.length,1);assert.equal(order.Payment_orderId[0].provider,'DEMO');assert.equal(order.OrderEvent_orderId.length,1);
  assert.equal(await db.order.count({where:{guestProfileId:order.guestProfileId,idempotencyKey:idem}}),1);pass('checkout persists server-priced snapshots, payment, event and one kitchen ticket; repeated key is idempotent');
  await assert.rejects(()=>db.orderEvent.updateMany({where:{orderId:order.id},data:{toStatus:'REWRITTEN'}}));pass('database rejects edits to order event history');
  const raceKey=`phase111-${run}-race`;
  const race=await Promise.all([1,2].map(()=>request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':raceKey},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},customerCookie)));
  for(const response of race)await expectStatus(response,201);const raceIds=await Promise.all(race.map(async response=>(await body(response)).data.id));assert.equal(raceIds[0],raceIds[1]);assert.equal(await db.order.count({where:{guestProfileId:order.guestProfileId,idempotencyKey:raceKey}}),1);pass('concurrent retries with the same idempotency key create one order');

  const chefCookie=await staffCookie('CHEF'),managerCookie=await staffCookie('MANAGER');
  const rejectedOrigin=await request('/api/v1/customer/orders',{method:'POST',headers:{'Origin':'https://attacker.invalid','Content-Type':'application/json','Idempotency-Key':`phase111-${run}-origin`},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},customerCookie);assert.equal(rejectedOrigin.status,403);pass('cross-origin order creation is rejected');
  const priorAvailability=await db.menuAvailability.findUnique({where:{menuItemId:dish.id}});
  try{
   const pause=await request('/api/v1/staff/menu-availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({menuItemId:dish.id,available:false,reason:'Integration availability check'})},managerCookie);await expectStatus(pause,200);
   const denied=await request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`phase111-${run}-unavailable`},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},customerCookie);assert.equal(denied.status,409);
  }finally{
   const restore=await request('/api/v1/staff/menu-availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({menuItemId:dish.id,available:priorAvailability?.available??true,reason:priorAvailability?.reason??undefined})},managerCookie);await expectStatus(restore,200);
  }
  pass('checkout rejects unavailable dishes and manager availability can be restored');
  const kds=await request('/staff/kitchen?page=999999',{},chefCookie);assert.equal(kds.status,200);const kdsHtml=await kds.text();assert.match(kdsHtml,new RegExp(order.reference));assert.doesNotMatch(kdsHtml,/₹\s?\d/);
  const preparing=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'PREPARING'})},chefCookie);await expectStatus(preparing,200);
  const ready=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'READY'})},chefCookie);await expectStatus(ready,200);
  const chefPricing=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ACCEPTED'})},chefCookie);assert.equal(chefPricing.status,403);
  assert.equal((await db.order.findUnique({where:{id:order.id}}))?.status,'READY');assert.equal((await db.kitchenTicket.findFirst({where:{orderId:order.id}}))?.status,'READY');
  const tracked=await request(`/api/v1/customer/orders/${order.id}`,{},customerCookie);assert.equal(tracked.status,200);assert.equal((await body(tracked)).data.status,'READY');pass('chef can advance preparation and owner tracking reflects kitchen state');

  const secondCookie=await register(`phase111.other.${run}@example.test`);
  const forbidden=await request(`/api/v1/customer/orders/${order.id}`,{},secondCookie);assert.equal(forbidden.status,404);pass('order tracking enforces customer ownership');

  const cancelKey=`phase111-${run}-cancel`;
  const pending=await request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':cancelKey},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},customerCookie);assert.equal(pending.status,201);const pendingId=(await body(pending)).data.id;
  const cancel=await request(`/api/v1/customer/orders/${pendingId}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Plans changed for the evening.'})},customerCookie);await expectStatus(cancel,200);
  const refund=await db.refund.findFirst({where:{paymentRef:{orderId:pendingId}}});assert.equal(refund?.status,'REQUESTED');
  const review=await request(`/api/v1/staff/refunds/${refund!.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'APPROVE_DEMO'})},managerCookie);await expectStatus(review,200);assert.equal((await db.refund.findUnique({where:{id:refund!.id}}))?.status,'SIMULATED');
  pass('customer cancellation is recorded and manager refund review remains simulation-only');

  const startedKey=`phase111-${run}-started`;const started=await request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':startedKey},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},customerCookie);assert.equal(started.status,201);const startedId=(await body(started)).data.id;
  const chefAdvance=await request(`/api/v1/staff/orders/${startedId}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'PREPARING'})},chefCookie);assert.equal(chefAdvance.status,200);
  const tooLate=await request(`/api/v1/customer/orders/${startedId}/cancel`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reason:'Please cancel this.'})},customerCookie);assert.equal(tooLate.status,409);pass('customer cancellation is rejected after kitchen preparation starts');

  const managerPage=await request('/staff/orders',{},managerCookie);assert.equal(managerPage.status,200);assert.match(await managerPage.text(),/Order management/);
  const chefManagerPage=await request('/staff/orders',{redirect:'manual'},chefCookie);assert.equal(chefManagerPage.status,307);pass('chef cannot access manager order management or pricing view');
 }finally{await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
