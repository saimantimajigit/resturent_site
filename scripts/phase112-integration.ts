import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {hash} from 'bcryptjs';
import {Prisma,PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE112_BASE_URL||'http://localhost:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE112_BASE_URL must be a plain loopback HTTP URL.');
const base=target.origin,origin=base,restaurantId=process.env.RESTAURANT_ID!,run=randomUUID().replaceAll('-','').slice(0,14),integrationIp=`192.0.2.${1+randomBytes(1)[0]%254}`;
const baseHeaders=(cookie?:string)=>({Origin:origin,'X-Real-IP':integrationIp,...(cookie?{Cookie:cookie}:{})});
function pass(label:string){console.log(`PASS ${label}`)}
function cookie(response:Response){const value=response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie');assert.ok(value,'Expected a session cookie');return value.split(';',1)[0]}
async function staffCookie(roleCode:'WAITER'|'CHEF'|'MANAGER'){
  const user=await db.user.create({data:{email:`phase112.${roleCode.toLowerCase()}.${run}@example.test`,name:`Phase 11.2 ${roleCode}`,passwordHash:await hash(randomBytes(24).toString('hex'),10)}});
  const role=await db.role.upsert({where:{code:roleCode},create:{code:roleCode,name:roleCode},update:{}});
  const membership=await db.staffMembership.create({data:{userId:user.id,restaurantId}});
  await db.staffRole.create({data:{staffMembershipId:membership.id,roleId:role.id}});
  const token=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+3600_000)}});
  return {cookie:`savore_session=${token}`,membershipId:membership.id};
}
async function request(path:string,init:RequestInit={},session?:string){return fetch(`${base}${path}`,{...init,headers:{...baseHeaders(session),...(init.headers||{})}})}
async function data(response:Response){return response.json() as Promise<any>}
async function expectStatus(response:Response,expected:number){if(response.status!==expected)throw new Error(`Expected ${expected}, got ${response.status}: ${await response.text()}`)}
function dateInKolkata(days:number){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+days*86400000));const p=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)!.value;return `${p('year')}-${p('month')}-${p('day')}`}

async function main(){
 try{
  assert.ok(restaurantId,'RESTAURANT_ID must be configured');
  const required=['occupancy_no_overlap','TableOccupancy_reservationTableId_fkey','waitlist_party_and_quote_check'];
  const constraints=await db.$queryRaw<Array<{conname:string}>>`SELECT conname::text AS conname FROM pg_constraint WHERE conname IN ('occupancy_no_overlap','TableOccupancy_reservationTableId_fkey','WaitlistEntry_reservationId_key','waitlist_party_and_quote_check')`;
  assert.deepEqual(new Set(constraints.map(row=>row.conname)),new Set(required));
  const uniqueIndex=await db.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='WaitlistEntry_reservationId_key') AS present`;
  assert.equal(uniqueIndex[0].present,true);
  const extension=await db.$queryRaw<Array<{present:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='btree_gist') AS present`;
  assert.equal(extension[0].present,true);pass('reservation exclusion, floor constraints, and btree_gist are installed');

  const hostLogin=await request('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'host@savore.example.test',password:process.env.DEMO_HOST_PASSWORD??''}),redirect:'manual'});
  assert.equal(hostLogin.status,303,'Demo host login failed');const host=cookie(hostLogin);
  const initialBoard=await request('/api/v1/staff/floor/board',{},host);assert.equal(initialBoard.status,200);assert.ok((await data(initialBoard)).data.tables.length);pass('host floor board loads tables from PostgreSQL');

  const waiter=await staffCookie('WAITER'),chef=await staffCookie('CHEF'),manager=await staffCookie('MANAGER');
  const forbidden=await request('/api/v1/staff/floor/board',{},chef.cookie);assert.equal(forbidden.status,403);pass('chef role cannot access reception or floor operations');

  const fixtureZone=await db.diningZone.create({data:{restaurantId,name:`Phase 11.2 ${run}`}});
  const fixtureTable=await db.diningTable.create({data:{restaurantId,diningZoneId:fixtureZone.id,label:`F${run.slice(0,8)}`,minCapacity:1,maxCapacity:4}});
  const alternateFixtureTable=await db.diningTable.create({data:{restaurantId,diningZoneId:fixtureZone.id,label:`A${run.slice(0,8)}`,minCapacity:1,maxCapacity:4}});
  const customerEmail=`phase112.customer.${run}@example.test`,password=randomBytes(20).toString('hex');
  const registration=await request('/api/v1/customer/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Floor Workflow Guest',email:customerEmail,password})});await expectStatus(registration,201);const customer=cookie(registration);
  const reservationResponse=await request('/api/v1/reservations',{method:'POST',headers:{'Content-Type':'application/json',Cookie:customer},body:JSON.stringify({date:dateInKolkata(4),time:'19:00',partySize:2,name:'Floor Workflow Guest',email:customerEmail,notes:'Phase 11.2 workflow fixture'})});await expectStatus(reservationResponse,201);const reservation=(await data(reservationResponse)).data;
  const edit=await request(`/api/v1/staff/reservations/${reservation.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'MODIFY',time:'19:30',partySize:3})},host);await expectStatus(edit,200);
  const edited=await db.reservation.findUniqueOrThrow({where:{id:reservation.id},include:{ReservationTable_reservationId:{include:{tableOccupancyRef:true}}}});assert.equal(edited.partySize,3);assert.equal(edited.ReservationTable_reservationId.filter(item=>item.tableOccupancyRef?.active).length,1);pass('host modification rechecks capacity and transactionally assigns an available table');
  const assignment=edited.ReservationTable_reservationId.find(item=>item.tableOccupancyRef?.active)!;
  const reassign=await request(`/api/v1/staff/reservations/${reservation.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ASSIGN_TABLE',tableId:fixtureTable.id,waiterMembershipId:waiter.membershipId})},host);await expectStatus(reassign,200);
  const currentAssignment=await db.reservationTable.findFirstOrThrow({where:{reservationId:reservation.id,tableOccupancyRef:{is:{active:true}}}});
  const arrived=await request(`/api/v1/staff/reservations/${reservation.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'ARRIVED'})},host);await expectStatus(arrived,200);
  const seated=await request(`/api/v1/staff/reservations/${reservation.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'SEATED'})},host);await expectStatus(seated,200);
  const persisted=await db.reservation.findUniqueOrThrow({where:{id:reservation.id}});assert.equal(persisted.status,'SEATED');assert.equal(await db.tableOccupancy.count({where:{reservationTableId:currentAssignment.id,active:true}}),1);pass('arrival and check-in persist with an active occupied table');
  const moveSeated=await request(`/api/v1/staff/reservations/${reservation.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'ASSIGN_TABLE',tableId:alternateFixtureTable.id})},host);assert.equal(moveSeated.status,409);assert.equal((await data(moveSeated)).error.code,'RESERVATION_ALREADY_SEATED');assert.equal(await db.tableOccupancy.count({where:{reservationTableId:currentAssignment.id,active:true}}),1);pass('seated guests cannot be moved in a way that releases their occupied table');

  const waiterBoard=await request('/api/v1/staff/floor/board',{},waiter.cookie);assert.equal(waiterBoard.status,200);const waiterData=(await data(waiterBoard)).data;assert.ok(waiterData.reservations.some((row:any)=>row.id===reservation.id),JSON.stringify({membership:waiter.membershipId,activeWaiter:currentAssignment.waiterMembershipId,boardIds:waiterData.reservations.map((row:any)=>row.id),activeTables:waiterData.tables.length}));assert.ok(waiterData.tables.every((row:any)=>row.status!=='AVAILABLE'));pass('waiter sees assigned service work only');
  const activeTable=await request('/api/v1/customer/reservations/active',{},customer);assert.equal(activeTable.status,200);assert.match((await data(activeTable)).data[0].table,new RegExp(fixtureTable.label));
  const dish=await db.menuItem.findFirstOrThrow({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1}}});
  const order=await request('/api/v1/customer/orders',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':`phase112-${run}-dine-in`},body:JSON.stringify({items:[{menuItemId:dish.id,quantity:1}],reservationId:reservation.id})},customer);await expectStatus(order,201);const orderData=(await data(order)).data;
  const linked=await db.order.findUniqueOrThrow({where:{id:orderData.id},include:{KitchenTicket_orderId:true}});assert.equal(linked.reservationId,reservation.id);assert.equal(linked.type,'DINE_IN');assert.equal(linked.KitchenTicket_orderId.length,1);
  const service=await request('/staff/service',{},waiter.cookie);assert.equal(service.status,200);assert.match(await service.text(),new RegExp(orderData.reference));pass('customer dine-in checkout links to seated booking and kitchen ticket appears on waiter service board');
  const tracking=await request(`/api/v1/customer/orders/${orderData.id}`,{},customer);assert.equal(tracking.status,200);assert.equal((await data(tracking)).data.status,'PLACED');
  const prematureCompletion=await request(`/api/v1/staff/reservations/${reservation.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host);assert.equal(prematureCompletion.status,409);assert.equal((await data(prematureCompletion)).error.code,'ACTIVE_DINE_IN_ORDER');assert.equal(await db.tableOccupancy.count({where:{reservationTableId:currentAssignment.id,active:true}}),1);pass('reservation completion is blocked while its dine-in session has an open order');
  const kitchenWhere:Prisma.KitchenTicketWhereInput={status:{in:['NEW','PREPARING','READY']},orderRef:{restaurantId,status:{in:['PLACED','ACCEPTED','PREPARING','READY']}}};
  const expectedKitchen=await db.kitchenTicket.findMany({where:kitchenWhere,select:{id:true},orderBy:[{createdAt:'asc'},{id:'asc'}]});assert.ok(expectedKitchen.length>100,'realistic-load pagination test requires more than one page of active tickets');
  const renderedKitchen:string[]=[];for(let page=1;page<=Math.ceil(expectedKitchen.length/100);page++){const response=await request(`/staff/kitchen?page=${page}`,{},chef.cookie);assert.equal(response.status,200);const html=await response.text();renderedKitchen.push(...[...html.matchAll(/href="\/staff\/kitchen\/([a-f0-9-]+)"/g)].map(match=>match[1]))}
  assert.deepEqual(renderedKitchen,expectedKitchen.map(ticket=>ticket.id));const lastKitchen=await request('/staff/kitchen?page=999999',{},chef.cookie);assert.equal(lastKitchen.status,200);assert.match(await lastKitchen.text(),new RegExp(orderData.reference));pass('FIFO kitchen pages expose new tickets beyond 100 and contain every stable-dataset ticket exactly once');
  for(const status of ['ACCEPTED','PREPARING','READY','SERVED']){const response=await request(`/api/v1/staff/orders/${orderData.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})},manager.cookie);await expectStatus(response,200)}
  const afterServe=await request('/staff/kitchen?page=999999',{},chef.cookie);await expectStatus(afterServe,200);assert.doesNotMatch(await afterServe.text(),new RegExp(orderData.reference));

  const completed=await request(`/api/v1/staff/reservations/${reservation.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host);assert.equal(completed.status,200);assert.equal(await db.tableOccupancy.count({where:{reservationTableId:currentAssignment.id,active:true}}),0);pass('completed service releases database-derived occupancy');

  const guests=await Promise.all([1,2].map(i=>db.guestProfile.create({data:{name:`Waitlist ${run} ${i}`,email:`waitlist.${run}.${i}@example.test`}})));
  const entries=await Promise.all(guests.map(guest=>db.waitlistEntry.create({data:{restaurantId,guestProfileId:guest.id,partySize:2,status:'WAITING'}})));
  const seatedRace=await Promise.all(entries.map(entry=>request(`/api/v1/staff/waitlist/${entry.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'SEATED',tableId:fixtureTable.id})},host)));
  assert.deepEqual(seatedRace.map(response=>response.status).sort(),[200,409]);
  assert.equal(await db.tableOccupancy.count({where:{diningTableId:fixtureTable.id,active:true}}),1);assert.equal(await db.waitlistEntry.count({where:{id:{in:entries.map(entry=>entry.id)},status:'SEATED'}}),1);pass('concurrent last-table waitlist seating yields one winner and prevents double-booking');
  const winningResponse=seatedRace.find(response=>response.status===200)!;const winningEntry=(await data(winningResponse)).data;const releaseWaitlistSeat=await request(`/api/v1/staff/reservations/${winningEntry.reservationId}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host);await expectStatus(releaseWaitlistSeat,200);
  const notifyGuest=await db.guestProfile.create({data:{name:`Notify ${run}`,email:`notify.${run}@example.test`}});const notifyEntry=await db.waitlistEntry.create({data:{restaurantId,guestProfileId:notifyGuest.id,partySize:2,status:'WAITING'}});
  const notified=await request(`/api/v1/staff/waitlist/${notifyEntry.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'NOTIFIED'})},host);assert.equal(notified.status,200);assert.ok((await db.waitlistEntry.findUniqueOrThrow({where:{id:notifyEntry.id}})).calledAt);
  const cancelled=await request(`/api/v1/staff/waitlist/${notifyEntry.id}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'CANCELLED'})},host);assert.equal(cancelled.status,200);assert.equal((await db.waitlistEntry.findUniqueOrThrow({where:{id:notifyEntry.id}})).status,'CANCELLED');pass('waitlist call and cancellation transitions persist with simulated notification timestamp');

  const walkIn=await request('/api/v1/staff/walk-ins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Walk In ${run}`,partySize:2,phone:'9999999999'})},host);await expectStatus(walkIn,201);const walkInResult=(await data(walkIn)).data;assert.equal(walkInResult.kind,'SEATED');
  const walkInReservation=await db.reservation.findUniqueOrThrow({where:{id:walkInResult.id},include:{ReservationTable_reservationId:{include:{tableOccupancyRef:true}}}});assert.equal(walkInReservation.status,'SEATED');assert.ok(walkInReservation.ReservationTable_reservationId[0].tableOccupancyRef?.active);pass('walk-in registration creates an immediately seated reservation with persisted table occupancy');
  const completeWalkIn=await request(`/api/v1/staff/reservations/${walkInResult.id}/status`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'COMPLETED'})},host);await expectStatus(completeWalkIn,200);
  const noFitWalkIn=await request('/api/v1/staff/walk-ins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Waitlisted ${run}`,partySize:12})},host);await expectStatus(noFitWalkIn,201);const queued=(await data(noFitWalkIn)).data;assert.equal(queued.kind,'WAITLISTED');assert.equal((await db.waitlistEntry.findUniqueOrThrow({where:{id:queued.id}})).status,'WAITING');pass('walk-in with no suitable table is added to the waitlist');
  const crossOrigin=await request('/api/v1/staff/walk-ins',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'Cross origin',partySize:2})},host);assert.equal(crossOrigin.status,403);pass('cross-origin floor mutations are rejected');

  const hostPage=await request('/staff/host',{},host);assert.equal(hostPage.status,200);assert.match(await hostPage.text(),/Host dashboard/);
  const floorPage=await request('/staff/floor',{},host);assert.equal(floorPage.status,200);assert.match(await floorPage.text(),/Floor plan/);
  const calendar=await request(`/staff/host/calendar?date=${dateInKolkata(4)}&view=week&endDate=${dateInKolkata(10)}`,{},host);assert.equal(calendar.status,200);assert.match(await calendar.text(),/Reservation calendar/);
  for(const [path,heading] of [['/staff/host/walk-ins','Walk-in registration'],['/staff/waitlist','Waitlist'],['/staff/check-in','Guest check-in'],[`/staff/host/reservations/${reservation.id}`,'Reservation management']] as const){const page=await request(path,{},host);assert.equal(page.status,200,`${path} failed`);assert.match(await page.text(),new RegExp(heading));}
  pass('host dashboard, weekly calendar, reservation detail, walk-ins, waitlist, check-in, and floor plan render over HTTP');

  // Clean only the unique fixtures created in this run; never sweep operational data by name or date.
  const losingEntry=entries[seatedRace.findIndex(response=>response.status!==200)];
  for(const entryId of [losingEntry.id,queued.id]){const cancelledFixture=await request(`/api/v1/staff/waitlist/${entryId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'CANCELLED'})},host);await expectStatus(cancelledFixture,200)}
  await db.diningZone.update({where:{id:fixtureZone.id},data:{active:false}});
  pass('this run\'s waitlist fixtures were cancelled and only its dedicated integration zone was hidden');
 }finally{await db.$disconnect()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
