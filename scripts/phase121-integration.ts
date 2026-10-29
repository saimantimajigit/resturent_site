import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE121_BASE_URL||'http://localhost:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('PHASE121_BASE_URL must be a plain loopback HTTP URL.');
const base=target.origin,restaurantId=process.env.RESTAURANT_ID!,run=randomUUID().replaceAll('-','').slice(0,14),digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const users:string[]=[],memberships:string[]=[];
function pass(label:string){console.log(`PASS ${label}`)}
async function request(path:string,init:RequestInit={},cookie?:string){return fetch(`${base}${path}`,{...init,headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(init.headers||{})}})}
async function json(r:Response){return r.json() as Promise<any>}
async function fixture(roleCode:'OWNER'|'MANAGER'|'HOST'){
 const user=await db.user.create({data:{email:`phase121.${roleCode.toLowerCase()}.${run}@example.test`,name:`Phase 12.1 ${roleCode}`,passwordHash:randomBytes(32).toString('hex')}});users.push(user.id);
 const role=await db.role.upsert({where:{code:roleCode},create:{code:roleCode,name:roleCode},update:{}}),membership=await db.staffMembership.create({data:{userId:user.id,restaurantId}});memberships.push(membership.id);
 await db.staffRole.create({data:{staffMembershipId:membership.id,roleId:role.id}});const raw=randomBytes(32).toString('hex');await db.session.create({data:{userId:user.id,tokenHash:digest(raw),expiresAt:new Date(Date.now()+3600000)}});
 return {id:user.id,membershipId:membership.id,cookie:`savore_session=${raw}`};
}
async function main(){
 assert.ok(restaurantId,'RESTAURANT_ID must be configured');let owner:any,manager:any,host:any;
 try{
  owner=await fixture('OWNER');manager=await fixture('MANAGER');host=await fixture('HOST');
  assert.equal((await request('/api/v1/staff/admin/dashboard',{},manager.cookie)).status,200);assert.equal((await request('/api/v1/staff/admin/dashboard',{},owner.cookie)).status,200);pass('owner and manager sessions access management dashboard');
  const changed=await request(`/api/v1/staff/admin/team/${manager.membershipId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({roleCodes:['HOST']})},owner.cookie);assert.equal(changed.status,200,await changed.text());
  const roles=await db.staffRole.findMany({where:{staffMembershipId:manager.membershipId},include:{roleRef:{select:{code:true}}}});assert.deepEqual(roles.map(x=>x.roleRef.code),['HOST']);assert.equal(await db.session.count({where:{userId:manager.id}}),1);assert.equal((await request('/api/v1/staff/admin/dashboard',{},manager.cookie)).status,403);assert.equal((await request('/api/v1/staff/admin/dashboard',{},owner.cookie)).status,200);pass('role changes take effect on an existing session without revoking the session');
  const suspended=await request(`/api/v1/staff/admin/team/${manager.membershipId}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'SUSPENDED'})},owner.cookie);assert.equal(suspended.status,200,await suspended.text());assert.equal((await request('/api/v1/staff/admin/dashboard',{},manager.cookie)).status,403);pass('membership suspension immediately blocks an existing session');
  const audit=await db.auditLog.findFirst({where:{actorUserId:owner.id,resource:'StaffMembership',resourceId:manager.membershipId,action:'STAFF_MEMBERSHIP_UPDATED'}});assert.ok(audit);pass('role and membership changes produce an attributable audit record');
  const otherSuitable=await db.diningTable.findMany({where:{restaurantId,active:true,minCapacity:{lte:12},maxCapacity:{gte:12},diningZoneRef:{active:true}},select:{id:true}}),blockedReservations:string[]=[],blockedGuests:string[]=[],blockedAssignments:string[]=[];
  const policy=await db.bookingPolicy.findUniqueOrThrow({where:{restaurantId}}),blockStart=new Date(),blockEnd=new Date(blockStart.getTime()+(policy.durationMinutes+policy.turnoverMinutes)*60_000);
  for(const candidate of otherSuitable){const occupied=await db.tableOccupancy.findFirst({where:{restaurantId,diningTableId:candidate.id,active:true,startsAt:{lt:blockEnd},endsAt:{gt:blockStart}},select:{id:true}});if(occupied)continue;
   const blocked=await db.$transaction(async tx=>{const guest=await tx.guestProfile.create({data:{name:`Phase 12.1 table blocker ${run}`}}),reservation=await tx.reservation.create({data:{restaurantId,guestProfileId:guest.id,reference:`P121-${run}-${blockedReservations.length}`,partySize:12,startsAt:blockStart,endsAt:blockEnd,status:'SEATED',notes:`Phase 12.1 isolated concurrency fixture ${run}`}}),assignment=await tx.reservationTable.create({data:{restaurantId,reservationId:reservation.id,diningTableId:candidate.id,startsAt:blockStart,endsAt:blockEnd}});await tx.tableOccupancy.create({data:{restaurantId,reservationTableId:assignment.id,diningTableId:candidate.id,startsAt:blockStart,endsAt:blockEnd,active:true}});return {guestId:guest.id,reservationId:reservation.id,assignmentId:assignment.id}});
   blockedGuests.push(blocked.guestId);blockedReservations.push(blocked.reservationId);blockedAssignments.push(blocked.assignmentId);
  }
  const zone=await db.diningZone.create({data:{restaurantId,name:`Phase 12.1 race zone ${run}`}}),table=await db.diningTable.create({data:{restaurantId,diningZoneId:zone.id,label:`R${run.slice(0,8)}`,minCapacity:12,maxCapacity:12}});
  let reservationId:string|undefined,waitlistId:string|undefined;
  try{
   const attempts=await Promise.all([1,2].map(i=>request('/api/v1/staff/walk-ins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Race guest ${run} ${i}`,partySize:12})},host.cookie)));
   assert.deepEqual(attempts.map(x=>x.status),[201,201]);const results=await Promise.all(attempts.map(json));assert.deepEqual(results.map(x=>x.data.kind).sort(),['SEATED','WAITLISTED']);reservationId=results.find(x=>x.data.kind==='SEATED').data.id;waitlistId=results.find(x=>x.data.kind==='WAITLISTED').data.id;
   assert.equal(await db.tableOccupancy.count({where:{diningTableId:table.id,active:true}}),1);assert.equal(await db.reservationTable.count({where:{diningTableId:table.id}}),1);assert.equal(await db.waitlistEntry.count({where:{id:waitlistId,status:'WAITING'}}),1);pass('simultaneous walk-ins for the isolated last table create one seating and one waitlist entry');
  }finally{
   await db.$transaction(async tx=>{
    const assignments=reservationId?await tx.reservationTable.findMany({where:{reservationId},select:{id:true}}):[],guestIds:string[]=[];if(reservationId){const row=await tx.reservation.findUnique({where:{id:reservationId},select:{guestProfileId:true}});if(row)guestIds.push(row.guestProfileId)}if(waitlistId){const row=await tx.waitlistEntry.findUnique({where:{id:waitlistId},select:{guestProfileId:true}});if(row)guestIds.push(row.guestProfileId)}
    if(waitlistId)await tx.waitlistEvent.deleteMany({where:{waitlistEntryId:waitlistId}});if(waitlistId)await tx.waitlistEntry.delete({where:{id:waitlistId}});
    const allReservationIds=[...blockedReservations,...(reservationId?[reservationId]:[])],allAssignmentIds=[...blockedAssignments,...assignments.map(x=>x.id)];if(allAssignmentIds.length)await tx.tableOccupancy.deleteMany({where:{reservationTableId:{in:allAssignmentIds}}});if(allReservationIds.length)await tx.reservationTable.deleteMany({where:{reservationId:{in:allReservationIds}}});
    if(allReservationIds.length)await tx.reservationEvent.deleteMany({where:{reservationId:{in:allReservationIds}}});if(allReservationIds.length)await tx.reservation.deleteMany({where:{id:{in:allReservationIds}}});const allGuestIds=[...new Set([...blockedGuests,...guestIds])];if(allGuestIds.length)await tx.guestProfile.deleteMany({where:{id:{in:allGuestIds}}});
    await tx.diningTable.delete({where:{id:table.id}});await tx.diningZone.delete({where:{id:zone.id}});
   });
  }
 }finally{
  await db.$transaction(async tx=>{
   if(owner&&manager)await tx.auditLog.deleteMany({where:{actorUserId:owner.id,resource:'StaffMembership',resourceId:manager.membershipId}});
   if(users.length)await tx.session.deleteMany({where:{userId:{in:users}}});
   if(memberships.length)await tx.staffRole.deleteMany({where:{staffMembershipId:{in:memberships}}});
   if(memberships.length)await tx.staffMembership.deleteMany({where:{id:{in:memberships}}});
   if(users.length)await tx.user.deleteMany({where:{id:{in:users}}});
  });await db.$disconnect();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
