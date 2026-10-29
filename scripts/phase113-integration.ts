import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE113_BASE_URL||'http://localhost:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE113_BASE_URL must be a plain loopback HTTP URL.');
const base=target.origin,restaurantId=process.env.RESTAURANT_ID!,run=randomUUID().replaceAll('-','').slice(0,14),ip=`198.51.100.${1+randomBytes(1)[0]%254}`;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const headers=(cookie?:string,origin=base)=>({Origin:origin,'X-Real-IP':ip,...(cookie?{Cookie:cookie}:{})});
async function request(path:string,init:RequestInit={},cookie?:string){return fetch(`${base}${path}`,{...init,headers:{...headers(cookie),...(init.headers||{})}})}
async function json(response:Response){
 const contentType=response.headers.get('content-type')||'(missing content-type)';
 const body=await response.text();
 try{return JSON.parse(body)}catch{
  const kind=/^\s*<!doctype html|^\s*<html/i.test(body)?'HTML document':body?'non-JSON text':'empty body';
  const location=response.headers.get('location');
  const finalPath=response.redirected?new URL(response.url).pathname:undefined;
  throw new Error(`Expected JSON but received HTTP ${response.status} (${contentType}), ${kind}${location?`, redirect=${location}`:''}${finalPath?`, followed redirect to ${finalPath}`:''}. Target=${base}`);
 }
}
async function status(response:Response,expected:number){if(response.status!==expected){const body=await response.text(),contentType=response.headers.get('content-type')||'(missing content-type)',kind=/^\s*<!doctype html|^\s*<html/i.test(body)?'HTML document':body?'non-JSON text':'empty body',location=response.headers.get('location'),finalPath=response.redirected?new URL(response.url).pathname:undefined;throw new Error(`Expected HTTP ${expected}; got ${response.status} (${contentType}), ${kind}${location?`, redirect=${location}`:''}${finalPath?`, followed redirect to ${finalPath}`:''}. Target=${base}`)}}
function pass(label:string){console.log(`PASS ${label}`)}
function cookie(response:Response,name:string){const value=response.headers.getSetCookie?.().find(item=>item.startsWith(`${name}=`))||'';assert.ok(value,`Expected ${name} cookie`);return value.split(';',1)[0]}
async function staffCookie(roleCode:'HOST'|'WAITER'|'CHEF'|'MANAGER'){
 const user=await db.user.create({data:{email:`phase113.${roleCode.toLowerCase()}.${run}@example.test`,name:`Phase 11.3 ${roleCode}`,passwordHash:await hash(randomBytes(24).toString('hex'),10)}});
 const role=await db.role.upsert({where:{code:roleCode},create:{code:roleCode,name:roleCode},update:{}});
 const membership=await db.staffMembership.create({data:{userId:user.id,restaurantId}});
 await db.staffRole.create({data:{staffMembershipId:membership.id,roleId:role.id}});
 const raw=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:digest(raw),expiresAt:new Date(Date.now()+3600_000)}});
 return {cookie:`savore_session=${raw}`,membershipId:membership.id};
}
async function staffAction(host:string,tableId:string,action:string,sessionId?:string){const response=await request(`/api/v1/staff/qr/tables/${tableId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(sessionId?{sessionId}:{})})},host);const data=await json(response);if(!response.ok)throw new Error(`QR staff action ${action} failed with HTTP ${response.status}: ${data.error?.message||'unknown error'}`);return {response,data}}

async function main(){
 assert.ok(restaurantId,'RESTAURANT_ID must be configured');
 try{
  const table=await db.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='DiningSession_one_active_table_idx') AS present`;
  const rateLimit=await db.$queryRaw<Array<{present:boolean}>>`SELECT to_regclass('"public"."AuthRateLimit"') IS NOT NULL AS present`;
  assert.equal(table[0].present,true);assert.equal(rateLimit[0].present,true);pass('QR session index and shared authentication rate-limit table exist');
  const host=await staffCookie('HOST'),waiter=await staffCookie('WAITER'),chef=await staffCookie('CHEF'),manager=await staffCookie('MANAGER');
  const walkIns=[] as Array<{id:string;tableId:string;assignmentId:string;label:string}>;
  for(let i=0;i<2;i++){
   const response=await request('/api/v1/staff/walk-ins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`QR Guest ${run} ${i+1}`,partySize:1,phone:'9999999999',notes:`Phase 11.3 QR test run ${run}`})},host.cookie);
   await status(response,201);const data=(await json(response)).data;assert.equal(data.kind,'SEATED');
   const assignment=await db.reservationTable.findFirstOrThrow({where:{reservationId:data.id,tableOccupancyRef:{is:{active:true}}},include:{diningTableRef:true}});
   walkIns.push({id:data.id,tableId:assignment.diningTableId,assignmentId:assignment.id,label:assignment.diningTableRef.label});
  }
  assert.equal(new Set(walkIns.map(item=>item.tableId)).size,2,'each QR fixture must occupy its own table');
  await db.reservationTable.update({where:{id:walkIns[0].assignmentId},data:{waiterMembershipId:waiter.membershipId}});
  pass('host walk-ins produce two independent occupied tables for QR session tests');

  const provision=await staffAction(host.cookie,walkIns[0].tableId,'ROTATE_QR');await status(provision.response,200);
  const code=String(provision.data.data.url).split('/').pop()!;assert.match(code,/^[a-f0-9]{64}$/i);
  const inactive=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(inactive,409);
  const noAccess=await request('/api/v1/qr/menu');await status(noAccess,401);pass('static QR identity alone cannot authorize a guest or reveal the menu');

  const activate=await staffAction(host.cookie,walkIns[0].tableId,'ACTIVATE_SESSION');await status(activate.response,200);
  const blockedWaiter=await request(`/api/v1/staff/qr/tables/${walkIns[1].tableId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'PROVISION_QR'})},waiter.cookie);await status(blockedWaiter,403);
  const blockedChef=await request(`/api/v1/staff/qr/tables/${walkIns[1].tableId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'PROVISION_QR'})},chef.cookie);await status(blockedChef,403);
  pass('only host, manager, or owner can control QR access; waiter and chef mutations are denied');

  const claimed=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(claimed,200);
  const guest=cookie(claimed,'savore_qr_access'),guestRaw=guest.slice('savore_qr_access='.length),guestHash=digest(guestRaw);
  const tokenRow=await db.diningGuestToken.findUniqueOrThrow({where:{tokenHash:guestHash},include:{diningSessionRef:true}});
  const menuResponse=await request('/api/v1/qr/menu',{},guest);await status(menuResponse,200);const menu=(await json(menuResponse)).data.items;assert.ok(menu.length>0);pass('guest token is hash-stored and returns the published restaurant menu');
  const entryPage=await request(`/qr/${code}`);await status(entryPage,200);assert.match(await entryPage.text(),/Your table/);
  const menuPage=await request(`/qr/${code}/menu`);await status(menuPage,200);pass('QR welcome and responsive menu pages render over HTTP');

  const publicItems=await db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuAvailability_menuItemId:true,MenuItemAllergen_menuItemId:{include:{allergenRef:true}}}});
  const dish=publicItems.find(item=>item.MenuItemPrice_menuItemId[0]&&item.MenuAvailability_menuItemId[0]?.available!==false);assert.ok(dish,'A currently available priced demo menu item is required');
  const price=dish.MenuItemPrice_menuItemId[0].amountMinor;
  const unavailable=publicItems.find(item=>item.MenuItemPrice_menuItemId[0]&&item.MenuAvailability_menuItemId[0]?.available!==false&&item.id!==dish.id);
  if(unavailable){
   await db.menuAvailability.update({where:{menuItemId:unavailable.id},data:{available:false}});
   try{const soldOut=await request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`phase113-${run}-soldout`},body:JSON.stringify({items:[{menuItemId:unavailable.id,quantity:1}]})},guest);await status(soldOut,409)}
   finally{await db.menuAvailability.update({where:{menuItemId:unavailable.id},data:{available:true}})}
   pass('sold-out items are rejected using current server-side availability');
  }
  const body=JSON.stringify({items:[{menuItemId:dish.id,quantity:2,notes:'No garnish, please'}]}),key=`phase113-${run}-order`;
  const orderResponse=await request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body},guest);await status(orderResponse,201);const order=(await json(orderResponse)).data;
  const duplicate=await request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body},guest);await status(duplicate,201);assert.equal((await json(duplicate)).data.id,order.id);
  const concurrentKey=`phase113-${run}-concurrent`,concurrentBody=JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]});
  const concurrentResponses=await Promise.all([1,2].map(()=>request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':concurrentKey},body:concurrentBody},guest)));
  assert.deepEqual(concurrentResponses.map(response=>response.status),[201,201]);const concurrentOrders=await Promise.all(concurrentResponses.map(json));
  assert.equal(concurrentOrders[0].data.id,concurrentOrders[1].data.id);assert.equal(await db.order.count({where:{restaurantId,guestProfileId:order.guestProfileId,idempotencyKey:concurrentKey}}),1);assert.equal(await db.kitchenTicket.count({where:{orderId:concurrentOrders[0].data.id}}),1);
  pass('simultaneous QR checkout retries create one order and one kitchen ticket');
  for(const [statusValue,actor] of [['ACCEPTED',manager.cookie],['PREPARING',chef.cookie],['READY',chef.cookie],['SERVED',manager.cookie]] as const){const progressed=await request(`/api/v1/staff/orders/${concurrentOrders[0].data.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:statusValue})},actor);await status(progressed,200)}
  const persisted=await db.order.findUniqueOrThrow({where:{id:order.id},include:{OrderItem_orderId:true,KitchenTicket_orderId:{include:{KitchenTicketItem_kitchenTicketId:true}}}});
  assert.equal(persisted.diningSessionId,tokenRow.diningSessionId);assert.equal(persisted.totalMinor,price*2n);assert.equal(persisted.OrderItem_orderId[0].unitPriceMinor,price);assert.equal(persisted.OrderItem_orderId[0].notes,'No garnish, please');
  assert.equal(persisted.KitchenTicket_orderId.length,1);assert.equal(persisted.KitchenTicket_orderId[0].KitchenTicketItem_kitchenTicketId.length,1);
  assert.equal(await db.order.count({where:{guestProfileId:persisted.guestProfileId,idempotencyKey:key}}),1);pass('server-authoritative price snapshots, idempotency, and one transactional kitchen ticket are verified');

  const secondProvision=await staffAction(host.cookie,walkIns[1].tableId,'ROTATE_QR');await status(secondProvision.response,200);const secondCode=String(secondProvision.data.data.url).split('/').pop()!;
  const secondActivate=await staffAction(host.cookie,walkIns[1].tableId,'ACTIVATE_SESSION');await status(secondActivate.response,200);
  const secondClaim=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:secondCode})});await status(secondClaim,200);const otherGuest=cookie(secondClaim,'savore_qr_access');
  const crossTable=await request(`/api/v1/qr/orders/${order.id}`,{},otherGuest);await status(crossTable,404);pass('a different table guest cannot read this session’s order');
  const demoEnvironment=await db.demoEnvironment.findFirstOrThrow();
  const foreignRestaurant=await db.restaurant.create({data:{demoEnvironmentId:demoEnvironment.id,name:`QR Isolation ${run}`,slug:`qr-isolation-${run}`}});
  const foreignOrder=await db.order.create({data:{restaurantId:foreignRestaurant.id,guestProfileId:persisted.guestProfileId,reference:`QRI-${run}`,type:'PICKUP',subtotalMinor:1n,totalMinor:1n}});
  try{const crossRestaurant=await request(`/api/v1/qr/orders/${foreignOrder.id}`,{},guest);await status(crossRestaurant,404)}
  finally{await db.order.delete({where:{id:foreignOrder.id}});await db.restaurant.delete({where:{id:foreignRestaurant.id}})}
  pass('a table guest cannot read an order belonging to another restaurant');

  const badOrigin=await fetch(`${base}/api/v1/qr/assistance`,{method:'POST',headers:{...headers(guest,'https://attacker.invalid'),'Content-Type':'application/json'},body:JSON.stringify({type:'WAITER'})});await status(badOrigin,403);
  const strictBody=await request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`phase113-${run}-strict`},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}],tableId:walkIns[1].tableId})},guest);await status(strictBody,400);
  pass('cross-origin mutations and guest-supplied table/session identifiers are rejected');

  const assistanceToken=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(assistanceToken,200);const assistGuest=cookie(assistanceToken,'savore_qr_access');
  const firstAssist=await request('/api/v1/qr/assistance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'WATER'})},assistGuest);await status(firstAssist,201);
  const requestRow=(await json(firstAssist)).data;
  const serviceBoard=await request('/staff/service',{},waiter.cookie);await status(serviceBoard,200);assert.match(await serviceBoard.text(),new RegExp(walkIns[0].label));
  const assistance=await db.assistanceRequest.findUniqueOrThrow({where:{id:requestRow.id}});assert.equal(assistance.diningSessionId,tokenRow.diningSessionId);assert.equal((assistance.metadata as any)?.requestType,'WATER');
  const unknownOrder=await request(`/api/v1/qr/orders/${order.id}`,{},assistGuest);await status(unknownOrder,200);
  pass('waiter service board receives a session-scoped guest water request');

  const rawAssistGuest=assistGuest.slice('savore_qr_access='.length),assistTokenRow=await db.diningGuestToken.findUniqueOrThrow({where:{tokenHash:digest(rawAssistGuest)},select:{id:true}});
  const assistanceDuplicate=await request('/api/v1/qr/assistance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'WATER'})},assistGuest);await status(assistanceDuplicate,409);
  const openWaterCount=await db.assistanceRequest.count({where:{diningGuestTokenId:assistTokenRow.id,type:'WATER',status:'OPEN'}});assert.equal(openWaterCount,1);
  const duplicateLimit=await db.authRateLimit.findUniqueOrThrow({where:{key:digest(`qr:assistance:identity:${assistTokenRow.id}`)}});assert.equal(duplicateLimit.attempts,2);
  pass('duplicate open assistance returns HTTP 409, is counted, and leaves one active request');

  // Isolate rate limiting from duplicate suppression: each invalid-body attempt must
  // consume the authenticated guest-token bucket before schema validation. Varying
  // client-supplied table IDs must not select a different bucket.
  const rateIp=`203.0.113.${1+randomBytes(1)[0]%254}`;
  const rateClaim=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(rateClaim,200);
  const rateGuest=cookie(rateClaim,'savore_qr_access');
  for(let i=0;i<8;i++){
   const invalid=await fetch(`${base}/api/v1/qr/assistance`,{method:'POST',headers:{...headers(rateGuest),'X-Real-IP':rateIp,'Content-Type':'application/json'},body:JSON.stringify({type:'WATER',tableId:walkIns[i%walkIns.length].tableId})});
   await status(invalid,400);
  }
  const limited=await fetch(`${base}/api/v1/qr/assistance`,{method:'POST',headers:{...headers(rateGuest),'X-Real-IP':rateIp,'Content-Type':'application/json'},body:JSON.stringify({type:'WATER'})});await status(limited,429);
  const rawRateGuest=rateGuest.slice('savore_qr_access='.length),rateGuestRow=await db.diningGuestToken.findUniqueOrThrow({where:{tokenHash:digest(rawRateGuest)},select:{id:true}});
  const rateCounter=await db.authRateLimit.findUniqueOrThrow({where:{key:digest(`qr:assistance:identity:${rateGuestRow.id}`)}});assert.equal(rateCounter.attempts,9);
  pass('live QR assistance rate limit counts rejected requests by authenticated guest and returns HTTP 429 on attempt nine');

  const accepted=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ACCEPTED'})},manager.cookie);await status(accepted,200);
  for(const next of ['PREPARING','READY']){const update=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})},chef.cookie);await status(update,200)}
  const served=await request(`/api/v1/staff/orders/${order.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'SERVED'})},manager.cookie);await status(served,200);
  const tracking=await request(`/api/v1/qr/orders/${order.id}`,{},guest);await status(tracking,200);const tracked=(await json(tracking)).data;assert.equal(tracked.status,'SERVED');assert.equal(tracked.kitchen,'READY');
  const trackingPage=await request(`/qr/orders/${order.id}`,{},guest);await status(trackingPage,200);pass('chef and manager updates flow through existing order/kitchen state and guest tracking');

  const expiredClaim=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(expiredClaim,200);const expiredCookie=cookie(expiredClaim,'savore_qr_access');
  const expiredHash=digest(expiredCookie.slice('savore_qr_access='.length));await db.diningGuestToken.update({where:{tokenHash:expiredHash},data:{issuedAt:new Date(Date.now()-120_000),expiresAt:new Date(Date.now()-1000)}});
  const expiredMenu=await request('/api/v1/qr/menu',{},expiredCookie);await status(expiredMenu,401);pass('expired guest tokens cannot access the QR menu');
  const revokedClaim=await request('/api/v1/qr/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});await status(revokedClaim,200);const revokedCookie=cookie(revokedClaim,'savore_qr_access');
  const revokedHash=digest(revokedCookie.slice('savore_qr_access='.length));await db.diningGuestToken.update({where:{tokenHash:revokedHash},data:{revokedAt:new Date()}});
  const revokedMenu=await request('/api/v1/qr/menu',{},revokedCookie);await status(revokedMenu,401);pass('revoked guest tokens cannot access the QR menu');

  const resolvedAssistance=await request(`/api/v1/staff/service/assistance/${requestRow.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host.cookie);await status(resolvedAssistance,200);
  assert.equal((await db.assistanceRequest.findUniqueOrThrow({where:{id:requestRow.id}})).status,'COMPLETED');

  const ended=await staffAction(host.cookie,walkIns[0].tableId,'END_SESSION',activate.data.data.id);await status(ended.response,200);
  const closedMenu=await request('/api/v1/qr/menu',{},guest);await status(closedMenu,401);
  const closedOrder=await request('/api/v1/qr/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`phase113-${run}-closed`},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}]})},guest);await status(closedOrder,401);
  const session=await db.diningSession.findUniqueOrThrow({where:{id:tokenRow.diningSessionId}});assert.equal(session.status,'CLOSED');
  pass('ending QR access revokes guest ordering and tracking while preserving existing orders');

  const staffPage=await request('/staff/qr',{},host.cookie);await status(staffPage,200);assert.match(await staffPage.text(),/QR table ordering/);
  const waiterStaffPage=await request('/staff/qr',{redirect:'manual'},waiter.cookie);assert.equal(waiterStaffPage.status,307);
  pass('authorized host QR management page renders and waiter access is denied');
  const endSecond=await staffAction(host.cookie,walkIns[1].tableId,'END_SESSION',secondActivate.data.data.id);await status(endSecond.response,200);
  for(const reservation of walkIns){const completed=await request(`/api/v1/staff/reservations/${reservation.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host.cookie);await status(completed,200)}
 }finally{await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
