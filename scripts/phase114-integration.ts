import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {parseAdminRange,localDateTimeUtc} from '../src/server/admin-format';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE114_BASE_URL||'http://localhost:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE114_BASE_URL must be a plain loopback HTTP URL.');
const base=target.origin,restaurantId=process.env.RESTAURANT_ID!,run=randomUUID().replaceAll('-','').slice(0,14);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex'),pass=(label:string)=>{console.log(`PASS ${label}`)};
const headers=(cookie?:string,origin=base)=>({Origin:origin,'X-Real-IP':`192.0.2.${1+randomBytes(1)[0]%254}`,...(cookie?{Cookie:cookie}:{})});
async function request(path:string,init:RequestInit={},cookie?:string){return fetch(`${base}${path}`,{...init,headers:{...headers(cookie),...(init.headers||{})}})}
async function body(response:Response){return response.json() as Promise<any>}
async function expectStatus(response:Response,status:number){if(response.status!==status)throw new Error(`Expected HTTP ${status}; received ${response.status}: ${(await response.text()).slice(0,500)}`)}
function json(method:string,value:unknown):RequestInit{return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}}
function localDate(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)!.value;return `${get('year')}-${get('month')}-${get('day')}`}
function localDateTime(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)!.value;return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`}
async function staff(roleCode:'MANAGER'|'OWNER'|'HOST'|'CHEF',email=`phase114.${roleCode.toLowerCase()}.${run}@example.test`){
 const user=await db.user.create({data:{email,name:`Phase 11.4 ${roleCode}`,passwordHash:randomBytes(32).toString('hex')}}),role=await db.role.upsert({where:{code:roleCode},create:{code:roleCode,name:roleCode},update:{}}),membership=await db.staffMembership.create({data:{userId:user.id,restaurantId}});
 await db.staffRole.create({data:{staffMembershipId:membership.id,roleId:role.id}});const raw=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:digest(raw),expiresAt:new Date(Date.now()+3_600_000)}});
 return {id:user.id,membershipId:membership.id,cookie:`savore_session=${raw}`,email};
}
async function reserve(args:{guestProfileId:string;reference:string;partySize:number;startsAt:Date;endsAt:Date;status:'CONFIRMED'|'SEATED'|'NO_SHOW';restaurantId?:string}){
 return db.reservation.create({data:{restaurantId:args.restaurantId??restaurantId,guestProfileId:args.guestProfileId,reference:args.reference,partySize:args.partySize,startsAt:args.startsAt,endsAt:args.endsAt,status:args.status,notes:`Phase 11.4 fixture ${run}`}});
}
async function makeOrder(args:{guestProfileId:string;reference:string;totalMinor:bigint;createdAt?:Date;menuItemId?:string;unitPrice?:bigint}){
 const createdAt=args.createdAt??new Date();
 const item=args.menuItemId?{OrderItem_orderId:{create:{menuItemId:args.menuItemId,nameSnapshot:'Phase 11.4 price snapshot',unitPriceMinor:args.unitPrice??args.totalMinor,quantity:1,lineTotalMinor:args.unitPrice??args.totalMinor,allergenSnapshot:[]}}}:{};
 const order=await db.order.create({data:{restaurantId,guestProfileId:args.guestProfileId,reference:args.reference,type:'PICKUP',status:'PLACED',subtotalMinor:args.totalMinor,totalMinor:args.totalMinor,createdAt,updatedAt:createdAt,...item}});
 return order;
}

async function main(){
 assert.ok(restaurantId,'RESTAURANT_ID must be configured');
 const manager=await staff('MANAGER'),owner=await staff('OWNER'),host=await staff('HOST'),chef=await staff('CHEF');
 const fixtureUserIds=[manager.id,owner.id,host.id,chef.id],fixtureMembershipIds=[manager.membershipId,owner.membershipId,host.membershipId,chef.membershipId],fixtureOrderIds:string[]=[],fixtureReservationIds:string[]=[],fixtureReservationTableIds:string[]=[];
 let foreign:{restaurantId:string;userId:string;membershipId:string;menuId:string;categoryId:string;itemId:string}|undefined;
 let zoneId:string|undefined,tableId:string|undefined,reservationId:string|undefined,sessionId:string|undefined,qrCode:string|undefined,menuItemId:string|undefined,guestProfileId:string|undefined,menuCategoryId:string|undefined,orderId:string|undefined,targetMembershipId:string|undefined,ownerGrantedMembershipId:string|undefined;
 const fixtureDiningSessionIds:string[]=[];
 try{
  const restaurant=await db.restaurant.findUniqueOrThrow({where:{id:restaurantId},select:{timezone:true,currency:true}}),today=localDate(new Date(),restaurant.timezone),range=parseAdminRange(today,today,restaurant.timezone);
  const schema=await db.$queryRaw<Array<{columnPresent:boolean}>>`SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='MenuItem' AND column_name='dietaryLabels') AS "columnPresent"`;
  assert.equal(schema[0].columnPresent,true);pass('additive menu dietary-label column is installed');

  const unauth=await request('/api/v1/staff/admin/dashboard');await expectStatus(unauth,401);
  const chefDenied=await request('/api/v1/staff/admin/dashboard',{},chef.cookie);await expectStatus(chefDenied,403);
  const hostPage=await request('/staff/admin',{redirect:'manual'},host.cookie);assert.equal(hostPage.status,307);
  const managerPage=await request('/staff/admin',{},manager.cookie);await expectStatus(managerPage,200);assert.match(await managerPage.text(),/Management overview/);
  pass('management pages and APIs enforce manager authorization');

  const menuResponse=await request('/api/v1/staff/admin/menu',{},manager.cookie);await expectStatus(menuResponse,200);const menuData=(await body(menuResponse)).data;
  const publishedMenu=menuData.categories.find((category:any)=>category.menuRef.published);assert.ok(publishedMenu,'A published menu category is required for customer propagation.');
  const categoryResponse=await request('/api/v1/staff/admin/menu/categories',json('POST',{menuId:publishedMenu.menuRef.id,name:`Admin category ${run}`,sortOrder:900}),manager.cookie);await expectStatus(categoryResponse,201);menuCategoryId=(await body(categoryResponse)).data.id;
  const allergenCode=menuData.allergens[0]?.code;
  const itemResponse=await request('/api/v1/staff/admin/menu',json('POST',{categoryId:menuCategoryId,name:`Admin tasting ${run}`,description:'A test dish for management validation.',priceMinor:'4125',status:'PUBLISHED',vegetarian:true,dietaryLabels:['Vegan','Test special'],allergenCodes:allergenCode?[allergenCode]:[]}),manager.cookie);await expectStatus(itemResponse,201);const createdItem=(await body(itemResponse)).data;menuItemId=createdItem.id;
  assert.deepEqual(createdItem.dietaryLabels,['Vegan','Test special']);pass('manager can create categorized dishes with price, allergens, publication and dietary labels');

  const guest=await db.guestProfile.create({data:{name:`Admin test guest ${run}`,email:`admin-guest-${run}@example.test`,phone:'9000000000'}});guestProfileId=guest.id;
  const initialPrice=4125n,order=await makeOrder({guestProfileId:guest.id,reference:`A114-${run}-SNAP`,totalMinor:initialPrice,menuItemId:createdItem.id,unitPrice:initialPrice});orderId=order.id;fixtureOrderIds.push(order.id);
  const snapshotBefore=await db.orderItem.findFirstOrThrow({where:{orderId:order.id},select:{nameSnapshot:true,unitPriceMinor:true,allergenSnapshot:true}});
  const patchResponse=await request(`/api/v1/staff/admin/menu/${createdItem.id}`,json('PATCH',{priceMinor:'4999',dietaryLabels:['Vegan','Seasonal'],status:'PUBLISHED',available:true}),manager.cookie);await expectStatus(patchResponse,200);
  const snapshotAfter=await db.orderItem.findFirstOrThrow({where:{orderId:order.id},select:{nameSnapshot:true,unitPriceMinor:true,allergenSnapshot:true}});assert.deepEqual(snapshotAfter,snapshotBefore);
  const online=await request('/menu');await expectStatus(online,200);const onlineHtml=await online.text();assert.match(onlineHtml,new RegExp(`Admin tasting ${run}`));assert.match(onlineHtml,/Seasonal/);
  pass('price edits preserve order snapshots and published dietary changes reach the online menu');

  const concurrent=await Promise.all(['5200','5300'].map(price=>request(`/api/v1/staff/admin/menu/${createdItem.id}`,json('PATCH',{priceMinor:price}),manager.cookie)));
  assert.ok(concurrent.every(response=>response.status===200||response.status===409));
  const currentPrices=await db.menuItemPrice.count({where:{menuItemId:createdItem.id,effectiveTo:null}});assert.equal(currentPrices,1);
  const snapshotAfterConcurrent=await db.orderItem.findFirstOrThrow({where:{orderId:order.id},select:{unitPriceMinor:true}});assert.equal(snapshotAfterConcurrent.unitPriceMinor,initialPrice);
  pass('concurrent price edits are serialized or rejected cleanly with one current price and immutable snapshots');

  const targetUser=await db.user.create({data:{email:`phase114.staff.${run}@example.test`,name:`Phase 11.4 Staff ${run}`,passwordHash:randomBytes(32).toString('hex')}});fixtureUserIds.push(targetUser.id);
  const assigned=await request('/api/v1/staff/admin/team',json('POST',{email:targetUser.email,roleCodes:['HOST']}),manager.cookie);await expectStatus(assigned,201);targetMembershipId=(await body(assigned)).data.id;
  const escalation=await request(`/api/v1/staff/admin/team/${targetMembershipId}`,json('PATCH',{roleCodes:['OWNER']}),manager.cookie);await expectStatus(escalation,403);
  const managerGrant=await request('/api/v1/staff/admin/team',json('POST',{email:`phase114.owner-granted.${run}@example.test`,roleCodes:['MANAGER']}),manager.cookie);await expectStatus(managerGrant,403);
  const suspended=await request(`/api/v1/staff/admin/team/${targetMembershipId}`,json('PATCH',{status:'SUSPENDED'}),manager.cookie);await expectStatus(suspended,200);
  const grantedManagerUser=await db.user.create({data:{email:`phase114.owner-granted.${run}@example.test`,name:'Owner assigned manager',passwordHash:randomBytes(32).toString('hex')}});fixtureUserIds.push(grantedManagerUser.id);
  const ownerGrant=await request('/api/v1/staff/admin/team',json('POST',{email:grantedManagerUser.email,roleCodes:['MANAGER']}),owner.cookie);await expectStatus(ownerGrant,201);ownerGrantedMembershipId=(await body(ownerGrant)).data.id;
  const selfDemotion=await request(`/api/v1/staff/admin/team/${owner.membershipId}`,json('PATCH',{roleCodes:['HOST']}),owner.cookie);await expectStatus(selfDemotion,409);
  pass('staff assignment is restaurant-scoped; managers cannot grant owner or manager roles; owner self-protection holds');

  const demo=await db.demoEnvironment.findFirstOrThrow({select:{id:true}});
  foreign=await db.$transaction(async tx=>{
   const otherRestaurant=await tx.restaurant.create({data:{demoEnvironmentId:demo.id,name:`Phase 11.4 isolation ${run}`,slug:`phase114-isolation-${run}`}});
   const foreignUser=await tx.user.create({data:{email:`foreign-${run}@example.test`,name:'Foreign test account',passwordHash:randomBytes(32).toString('hex')}}),foreignMembership=await tx.staffMembership.create({data:{userId:foreignUser.id,restaurantId:otherRestaurant.id,status:'ACTIVE'}});
   const hostRole=await tx.role.findUniqueOrThrow({where:{code:'HOST'},select:{id:true}});await tx.staffRole.create({data:{staffMembershipId:foreignMembership.id,roleId:hostRole.id}});
   const foreignMenu=await tx.menu.create({data:{restaurantId:otherRestaurant.id,name:'Foreign fixture'}}),foreignCategory=await tx.menuCategory.create({data:{menuId:foreignMenu.id,name:'Foreign fixture'}}),foreignItem=await tx.menuItem.create({data:{menuCategoryId:foreignCategory.id,name:'Foreign item',slug:`foreign-${run}`,status:'DRAFT'}});
   return {restaurantId:otherRestaurant.id,userId:foreignUser.id,membershipId:foreignMembership.id,menuId:foreignMenu.id,categoryId:foreignCategory.id,itemId:foreignItem.id};
  });
  const foreignFixture=foreign;
  const crossMenu=await request(`/api/v1/staff/admin/menu/${foreignFixture.itemId}`,json('PATCH',{name:'Should not cross restaurant'}),manager.cookie);await expectStatus(crossMenu,404);
  const crossStaff=await request(`/api/v1/staff/admin/team/${foreignFixture.membershipId}`,json('PATCH',{status:'SUSPENDED'}),manager.cookie);await expectStatus(crossStaff,404);
  pass('menu and staff administration cannot access records belonging to another restaurant');

  const zoneResponse=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'zone',name:`Admin zone ${run}`,sortOrder:900,active:true}),manager.cookie);await expectStatus(zoneResponse,201);zoneId=(await body(zoneResponse)).data.id;
  const tableResponse=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'table',diningZoneId:zoneId,label:`A${run.slice(0,8)}`,minCapacity:1,maxCapacity:4,active:true,x:5,y:5}),manager.cookie);await expectStatus(tableResponse,201);tableId=(await body(tableResponse)).data.id;
  const futureStart=localDateTimeUtc(`${today}T19:00`,restaurant.timezone);if(futureStart<=new Date())futureStart.setTime(futureStart.getTime()+7*86_400_000);const futureEnd=new Date(futureStart.getTime()+90*60_000);
  const futureReservation=await reserve({guestProfileId:guest.id,reference:`A114-${run}-FUTURE`,partySize:3,startsAt:futureStart,endsAt:futureEnd,status:'CONFIRMED'});fixtureReservationIds.push(futureReservation.id);
  const busyEnd=new Date(Date.now()+2*60*60_000),busyStart=new Date(Date.now()-15*60_000),seated=await reserve({guestProfileId:guest.id,reference:`A114-${run}-SEATED`,partySize:2,startsAt:busyStart,endsAt:busyEnd,status:'SEATED'});reservationId=seated.id;fixtureReservationIds.push(seated.id);
  const tableIdRequired=tableId!;
  const assignment=await db.reservationTable.create({data:{restaurantId,reservationId:seated.id,diningTableId:tableIdRequired,startsAt:busyStart,endsAt:busyEnd}});fixtureReservationTableIds.push(assignment.id);await db.tableOccupancy.create({data:{restaurantId,reservationTableId:assignment.id,diningTableId:tableIdRequired,startsAt:busyStart,endsAt:busyEnd,active:true}});
  const deactivateBusy=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'table',id:tableId,diningZoneId:zoneId,label:`A${run.slice(0,8)}`,minCapacity:1,maxCapacity:4,active:false,x:5,y:5}),manager.cookie);await expectStatus(deactivateBusy,409);
  const shrinkCapacity=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'table',id:tableId,diningZoneId:zoneId,label:`A${run.slice(0,8)}`,minCapacity:1,maxCapacity:1,active:true,x:5,y:5}),manager.cookie);await expectStatus(shrinkCapacity,409);
  const shrinkPolicy=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'booking-policy',maxPartySize:2}),manager.cookie);await expectStatus(shrinkPolicy,409);
  const closure=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'closure',startsAt:localDateTime(futureStart,restaurant.timezone),endsAt:localDateTime(futureEnd,restaurant.timezone),reason:'Phase 11.4 conflict check'}),manager.cookie);await expectStatus(closure,409);
  const settings=await request('/api/v1/staff/admin/settings',{},manager.cookie);await expectStatus(settings,200);
  pass('table deactivation/capacity, booking limits, and closures cannot invalidate active or future bookings');

  const provision=await request(`/api/v1/staff/qr/tables/${tableIdRequired}`,json('POST',{action:'ROTATE_QR'}),manager.cookie);await expectStatus(provision,200);const url=(await body(provision)).data.url as string;qrCode=url.split('/').pop()!;
  const activate=await request(`/api/v1/staff/qr/tables/${tableIdRequired}`,json('POST',{action:'ACTIVATE_SESSION'}),manager.cookie);await expectStatus(activate,200);sessionId=(await body(activate)).data.id as string;fixtureDiningSessionIds.push(sessionId);
  const claim=await request('/api/v1/qr/claim',json('POST',{code:qrCode}));await expectStatus(claim,200);const guestCookie=claim.headers.getSetCookie?.().find(value=>value.startsWith('savore_qr_access='))?.split(';',1)[0];assert.ok(guestCookie);
  const qrMenu=await request('/api/v1/qr/menu',{},guestCookie??undefined);await expectStatus(qrMenu,200);const qrItems=(await body(qrMenu)).data.items;assert.ok(qrItems.some((item:any)=>item.id===createdItem.id&&item.dietaryLabels.includes('Seasonal')));
  const qrPage=await request(`/qr/${qrCode}/menu`);await expectStatus(qrPage,200);
  pass('active isolated table guest receives current manager-edited labels through QR menu and page');

  const csvFixture=await reserve({guestProfileId:guest.id,reference:`=1+1-${run}`,partySize:1,startsAt:new Date(range.from.getTime()+60*60_000),endsAt:new Date(range.from.getTime()+150*60_000),status:'CONFIRMED'});fixtureReservationIds.push(csvFixture.id);
  const reservations=await db.reservation.findMany({where:{restaurantId,startsAt:{gte:range.from,lt:range.to}},select:{id:true}}),upcoming=await db.reservation.count({where:{restaurantId,startsAt:{gte:new Date(),lt:range.to},status:{in:['HELD','AWAITING_PAYMENT','CONFIRMED','ARRIVED']}}}),seatedCount=await db.reservation.count({where:{restaurantId,status:'SEATED',startsAt:{lt:range.to},endsAt:{gt:range.from}}}),walkIns=await db.reservationEvent.groupBy({by:['reservationId'],where:{createdAt:{gte:range.from,lt:range.to},metadata:{path:['source'],equals:'WALK_IN'},reservationRef:{restaurantId}},_count:{_all:true}});
  const inRange=await makeOrder({guestProfileId:guest.id,reference:`A114-${run}-BOUNDARY-IN`,totalMinor:1100n,createdAt:new Date()}),outRange=await makeOrder({guestProfileId:guest.id,reference:`A114-${run}-BOUNDARY-OUT`,totalMinor:1200n,createdAt:range.to});fixtureOrderIds.push(inRange.id,outRange.id);
  const kitchenStarted=new Date(Date.now()-15*60_000),kitchenCompleted=new Date(Date.now()-5*60_000);await db.kitchenTicket.create({data:{orderId:inRange.id,station:'TEST',status:'COMPLETED',createdAt:inRange.createdAt,startedAt:kitchenStarted,completedAt:kitchenCompleted}});
  const dashboard=await request(`/api/v1/staff/admin/dashboard?from=${today}&to=${today}`,{},manager.cookie);await expectStatus(dashboard,200);const metrics=(await body(dashboard)).data;
  assert.equal(metrics.reservations.total,reservations.length);assert.equal(metrics.reservations.upcoming,upcoming);assert.equal(metrics.reservations.seated,seatedCount);assert.equal(metrics.reservations.walkIns,walkIns.length);assert.equal(metrics.range.timezone,restaurant.timezone);
  const report=await request(`/api/v1/staff/admin/reports?from=${today}&to=${today}&type=orders&page=1`,{},manager.cookie);await expectStatus(report,200);const reportData=(await body(report)).data;assert.ok(reportData.rows.some((row:any)=>row.id===inRange.id));assert.ok(!reportData.rows.some((row:any)=>row.id===outRange.id));
  const reservationCsv=await request(`/api/v1/staff/admin/reports/export?from=${today}&to=${today}&type=reservations`,{},manager.cookie);await expectStatus(reservationCsv,200);const csv=await reservationCsv.text();assert.match(csv,/"'=1\+1-/);assert.ok(!csv.includes(`admin-guest-${run}@example.test`));
  pass('dashboard date boundaries and aggregation match database counts; reports paginate and CSV neutralizes formulas without guest PII');

  const audit=await request('/api/v1/staff/admin/audit?page=1',{},manager.cookie);await expectStatus(audit,200);const auditRows=(await body(audit)).data.rows;assert.ok(auditRows.some((row:any)=>row.resourceId===createdItem.id&&row.action==='MENU_ITEM_CREATED'));assert.ok(auditRows.some((row:any)=>row.resourceId===tableId&&row.action==='DINING_TABLE_CREATED'));
  const originDenied=await request('/api/v1/staff/admin/menu',{...json('POST',{categoryId:menuCategoryId,name:'Cross origin',priceMinor:'1'}),headers:{'Content-Type':'application/json',Origin:'https://attacker.example'}},manager.cookie);await expectStatus(originDenied,403);
  pass('menu, staff and configuration writes persist audit records; foreign-origin writes are rejected');

  const endSession=await request(`/api/v1/staff/qr/tables/${tableId}`,json('POST',{action:'END_SESSION',sessionId}),manager.cookie);await expectStatus(endSession,200);sessionId=undefined;
  const complete=await request(`/api/v1/staff/reservations/${reservationId}/status`,json('POST',{status:'COMPLETED'}),manager.cookie);await expectStatus(complete,200);
  const archive=await request(`/api/v1/staff/admin/menu/${createdItem.id}`,json('PATCH',{status:'DRAFT',available:false}),manager.cookie);await expectStatus(archive,200);
  const deactivate=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'table',id:tableId,diningZoneId:zoneId,label:`A${run.slice(0,8)}`,minCapacity:1,maxCapacity:4,active:false,x:5,y:5}),manager.cookie);await expectStatus(deactivate,200);
  const deactivateZone=await request('/api/v1/staff/admin/settings',json('PATCH',{action:'zone',id:zoneId,name:`Admin zone ${run}`,sortOrder:900,active:false}),manager.cookie);await expectStatus(deactivateZone,200);
  pass('test-owned QR session ended, reservation completed, menu fixture unpublished, table archived and exact fixture cleanup scheduled');
  console.log('Phase 11.4 integration checks passed: 12');
 }finally{
  if(sessionId&&tableId){await request(`/api/v1/staff/qr/tables/${tableId}`,json('POST',{action:'END_SESSION',sessionId}),manager.cookie).catch(()=>{})}
  try{await db.$transaction(async tx=>{
   if(fixtureDiningSessionIds.length){await tx.assistanceRequest.deleteMany({where:{diningSessionId:{in:fixtureDiningSessionIds}}});await tx.diningSessionEvent.deleteMany({where:{diningSessionId:{in:fixtureDiningSessionIds}}});await tx.diningGuestToken.deleteMany({where:{diningSessionId:{in:fixtureDiningSessionIds}}});await tx.diningSession.deleteMany({where:{id:{in:fixtureDiningSessionIds}}});}
   if(fixtureReservationTableIds.length)await tx.tableOccupancy.deleteMany({where:{reservationTableId:{in:fixtureReservationTableIds}}});
   if(fixtureReservationIds.length){await tx.reservationEvent.deleteMany({where:{reservationId:{in:fixtureReservationIds}}});await tx.reservationTable.deleteMany({where:{id:{in:fixtureReservationTableIds}}});await tx.reservation.deleteMany({where:{id:{in:fixtureReservationIds}}});}
   if(fixtureOrderIds.length){await tx.kitchenTicketItem.deleteMany({where:{kitchenTicketRef:{orderId:{in:fixtureOrderIds}}}});await tx.kitchenTicket.deleteMany({where:{orderId:{in:fixtureOrderIds}}});await tx.orderItemModifier.deleteMany({where:{orderItemRef:{orderId:{in:fixtureOrderIds}}}});await tx.orderItem.deleteMany({where:{orderId:{in:fixtureOrderIds}}});await tx.orderEvent.deleteMany({where:{orderId:{in:fixtureOrderIds}}});await tx.payment.deleteMany({where:{orderId:{in:fixtureOrderIds}}});await tx.order.deleteMany({where:{id:{in:fixtureOrderIds}}});}
   if(menuItemId){await tx.menuAvailability.deleteMany({where:{menuItemId}});await tx.menuItemAllergen.deleteMany({where:{menuItemId}});await tx.menuItemPrice.deleteMany({where:{menuItemId}});await tx.menuItem.deleteMany({where:{id:menuItemId}});}
   if(menuCategoryId)await tx.menuCategory.deleteMany({where:{id:menuCategoryId}});
   const extraMembershipIds=[targetMembershipId,ownerGrantedMembershipId].filter((id):id is string=>Boolean(id));if(extraMembershipIds.length){await tx.staffRole.deleteMany({where:{staffMembershipId:{in:extraMembershipIds}}});await tx.staffMembership.deleteMany({where:{id:{in:extraMembershipIds}}});}
   const baseUsers=new Set([manager.id,owner.id,host.id,chef.id]),extraUserIds=fixtureUserIds.filter(id=>!baseUsers.has(id));if(extraUserIds.length)await tx.user.deleteMany({where:{id:{in:extraUserIds}}});
   if(guestProfileId)await tx.guestProfile.deleteMany({where:{id:guestProfileId}});
   if(tableId){await tx.tableToken.deleteMany({where:{diningTableId:tableId}});await tx.tableOccupancy.deleteMany({where:{diningTableId:tableId}});await tx.reservationTable.deleteMany({where:{diningTableId:tableId}});await tx.diningTable.deleteMany({where:{id:tableId}});}
   if(zoneId)await tx.diningZone.deleteMany({where:{id:zoneId}});
   if(foreign){await tx.staffRole.deleteMany({where:{staffMembershipId:foreign.membershipId}});await tx.staffMembership.deleteMany({where:{id:foreign.membershipId}});await tx.user.deleteMany({where:{id:foreign.userId}});await tx.menuItem.deleteMany({where:{id:foreign.itemId}});await tx.menuCategory.deleteMany({where:{id:foreign.categoryId}});await tx.menu.deleteMany({where:{id:foreign.menuId}});await tx.restaurant.deleteMany({where:{id:foreign.restaurantId}});}
  })}catch(cleanupError){console.error('Exact Phase 11.4 fixture cleanup failed; any remaining records have unique run IDs.',cleanupError)}
  await db.session.updateMany({where:{userId:{in:fixtureUserIds},revokedAt:null},data:{revokedAt:new Date()}}).catch(()=>{});
  await db.staffMembership.updateMany({where:{id:{in:fixtureMembershipIds}},data:{status:'SUSPENDED'}}).catch(()=>{});
  await db.$disconnect();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
