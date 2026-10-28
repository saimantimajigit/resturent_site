import 'server-only';
import {randomUUID} from 'node:crypto';
import {db} from './db';
import {assertBookingAllowed,BookingRuleError} from './booking-policy';

export class FloorOperationError extends Error {
  constructor(readonly code:string,message:string){super(message)}
}

type WalkInInput={name:string;partySize:number;email?:string;phone?:string;notes?:string;waiterMembershipId?:string};
type ReservationEdit={date?:string;time?:string;partySize?:number;notes?:string|null};

async function availableTable(tx:any,restaurantId:string,partySize:number,startsAt:Date,endsAt:Date,preferredId?:string,excludedAssignmentIds:string[]=[]){
  const where={restaurantId,active:true,minCapacity:{lte:partySize},maxCapacity:{gte:partySize},diningZoneRef:{active:true},...(preferredId?{id:preferredId}:{})};
  const candidates=await tx.diningTable.findMany({where,orderBy:[{maxCapacity:'asc'},{label:'asc'}]});
  if(preferredId&&candidates.length===0)throw new FloorOperationError('TABLE_UNSUITABLE','That table is inactive or does not fit this party.');
  for(const table of candidates){
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${table.id}::text))`;
    const conflict=await tx.tableOccupancy.findFirst({where:{restaurantId,diningTableId:table.id,active:true,startsAt:{lt:endsAt},endsAt:{gt:startsAt},...(excludedAssignmentIds.length?{reservationTableId:{notIn:excludedAssignmentIds}}:{})},select:{id:true}});
    if(!conflict)return table;
  }
  return null;
}

async function assertWaiter(tx:any,restaurantId:string,waiterMembershipId?:string){
  if(!waiterMembershipId)return null;
  const membership=await tx.staffMembership.findFirst({where:{id:waiterMembershipId,restaurantId,status:'ACTIVE',StaffRole_staffMembershipId:{some:{roleRef:{code:'WAITER'}}}},select:{id:true}});
  if(!membership)throw new FloorOperationError('WAITER_INVALID','Select an active waiter for this restaurant.');
  return membership.id;
}

async function estimateWaitMinutes(tx:any,restaurantId:string,partySize:number,durationMinutes:number){
  const [ahead,suitableTables]=await Promise.all([
    tx.waitlistEntry.count({where:{restaurantId,status:{in:['WAITING','NOTIFIED']}}}),
    tx.diningTable.count({where:{restaurantId,active:true,minCapacity:{lte:partySize},maxCapacity:{gte:partySize},diningZoneRef:{active:true}}})
  ]);
  if(!suitableTables)return null;
  return Math.max(5,Math.ceil((ahead+1)*durationMinutes/suitableTables));
}

async function assignInTransaction(tx:any,args:{restaurantId:string;reservationId:string;table:any;waiterMembershipId?:string|null;actorUserId:string;event:'TABLE_ASSIGNED'|'TABLE_CHANGED'}){
  const {restaurantId,reservationId,table,actorUserId,event}=args;
  const reservation=await tx.reservation.findFirst({where:{id:reservationId,restaurantId}});
  if(!reservation)throw new FloorOperationError('RESERVATION_NOT_FOUND','Reservation not found.');
  if(['COMPLETED','CANCELLED','NO_SHOW','EXPIRED'].includes(reservation.status))throw new FloorOperationError('RESERVATION_CLOSED','Closed reservations cannot be assigned.');
  if(table.maxCapacity<reservation.partySize||table.minCapacity>reservation.partySize)throw new FloorOperationError('TABLE_UNSUITABLE','That table does not fit this party.');
  const waiterMembershipId=await assertWaiter(tx,restaurantId,args.waiterMembershipId??undefined);
  const previous=await tx.reservationTable.findMany({where:{reservationId,restaurantId},select:{id:true,diningTableId:true}});
  for(const tableId of [...new Set([...previous.map((row:any)=>row.diningTableId),table.id])].sort())await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tableId}::text))`;
  if(previous.length)await tx.tableOccupancy.updateMany({where:{reservationTableId:{in:previous.map((row:any)=>row.id)},active:true},data:{active:false}});
  const conflict=await tx.tableOccupancy.findFirst({where:{restaurantId,diningTableId:table.id,active:true,startsAt:{lt:reservation.endsAt},endsAt:{gt:reservation.startsAt}},select:{id:true}});
  if(conflict)throw new FloorOperationError('TABLE_UNAVAILABLE','That table has an overlapping reservation or active seating.');
  const assignment=await tx.reservationTable.create({data:{restaurantId,reservationId,diningTableId:table.id,waiterMembershipId,startsAt:reservation.startsAt,endsAt:reservation.endsAt}});
  await tx.tableOccupancy.create({data:{restaurantId,reservationTableId:assignment.id,diningTableId:table.id,startsAt:reservation.startsAt,endsAt:reservation.endsAt,active:true}});
  await tx.reservationEvent.create({data:{reservationId,actorUserId,fromStatus:reservation.status,toStatus:reservation.status,metadata:{action:event,tableId:table.id,tableLabel:table.label,waiterMembershipId}}});
  return {assignmentId:assignment.id,tableId:table.id,label:table.label,waiterMembershipId};
}

async function createSeatedReservation(tx:any,args:{restaurantId:string;guestProfileId:string;partySize:number;name:string;notes?:string;actorUserId:string;waiterMembershipId?:string;table:any;waitlistEntryId?:string}){
  const policy=await tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId:args.restaurantId}});
  const startsAt=new Date();
  const endsAt=new Date(startsAt.getTime()+(policy.durationMinutes+policy.turnoverMinutes)*60_000);
  const reservation=await tx.reservation.create({data:{restaurantId:args.restaurantId,guestProfileId:args.guestProfileId,reference:`SV-${randomUUID().slice(0,12).toUpperCase()}`,partySize:args.partySize,startsAt,endsAt,status:'SEATED',notes:args.notes??null}});
  await tx.reservationEvent.createMany({data:[
    {reservationId:reservation.id,actorUserId:args.actorUserId,toStatus:'CONFIRMED',metadata:{source:args.waitlistEntryId?'WAITLIST':'WALK_IN'}},
    {reservationId:reservation.id,actorUserId:args.actorUserId,fromStatus:'CONFIRMED',toStatus:'ARRIVED'},
    {reservationId:reservation.id,actorUserId:args.actorUserId,fromStatus:'ARRIVED',toStatus:'SEATED'}
  ]});
  const waiterMembershipId=await assertWaiter(tx,args.restaurantId,args.waiterMembershipId);
  const assignment=await tx.reservationTable.create({data:{restaurantId:args.restaurantId,reservationId:reservation.id,diningTableId:args.table.id,waiterMembershipId,startsAt,endsAt}});
  await tx.tableOccupancy.create({data:{restaurantId:args.restaurantId,reservationTableId:assignment.id,diningTableId:args.table.id,startsAt,endsAt,active:true}});
  return reservation;
}

async function runSerializable<T>(action:(tx:any)=>Promise<T>,attempt=0):Promise<T>{
  try{return await db.$transaction(action,{isolationLevel:'Serializable',maxWait:8000,timeout:15000})}
  catch(error){
    if(error&&typeof error==='object'&&'code'in error){
      const value=error as {code:string;meta?:{code?:string;message?:string;database_error?:string}};
      if(value.code==='P2034'&&attempt<3){await new Promise(resolve=>setTimeout(resolve,30*(attempt+1)));return runSerializable(action,attempt+1)}
      const databaseError=`${value.meta?.code??''} ${value.meta?.message??''} ${value.meta?.database_error??''}`;
      if(value.code==='P2010'&&databaseError.includes('23P01')||value.code==='P2004'&&databaseError.includes('occupancy_no_overlap'))throw new FloorOperationError('TABLE_UNAVAILABLE','That table was just allocated; refresh and choose another table.');
    }
    throw error;
  }
}

export async function createWalkIn(input:WalkInInput,restaurantId:string,actorUserId:string){
  return runSerializable(async tx=>{
    const policy=await tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId}});
    const startsAt=new Date(),endsAt=new Date(startsAt.getTime()+(policy.durationMinutes+policy.turnoverMinutes)*60_000);
    const table=await availableTable(tx,restaurantId,input.partySize,startsAt,endsAt);
    const guest=await tx.guestProfile.create({data:{name:input.name,email:input.email||null,phone:input.phone||null}});
    if(!table){
      const quotedMinutes=await estimateWaitMinutes(tx,restaurantId,input.partySize,policy.durationMinutes+policy.turnoverMinutes);
      const entry=await tx.waitlistEntry.create({data:{restaurantId,guestProfileId:guest.id,partySize:input.partySize,status:'WAITING',quotedMinutes}});
      await tx.waitlistEvent.create({data:{waitlistEntryId:entry.id,actorUserId,status:'WAITING',metadata:{source:'WALK_IN'}}});
      return {kind:'WAITLISTED' as const,id:entry.id,guestName:guest.name,partySize:entry.partySize,quotedMinutes:null};
    }
    const reservation=await createSeatedReservation(tx,{restaurantId,guestProfileId:guest.id,partySize:input.partySize,name:input.name,notes:input.notes,actorUserId,waiterMembershipId:input.waiterMembershipId,table});
    return {kind:'SEATED' as const,id:reservation.id,reference:reservation.reference,guestName:guest.name,partySize:input.partySize,table:{id:table.id,label:table.label}};
  });
}

export async function assignReservationTable(args:{restaurantId:string;reservationId:string;tableId:string;actorUserId:string;waiterMembershipId?:string|null}){
  return runSerializable(async tx=>{
    const reservation=await tx.reservation.findFirst({where:{id:args.reservationId,restaurantId:args.restaurantId}});
    if(!reservation)throw new FloorOperationError('RESERVATION_NOT_FOUND','Reservation not found.');
    if(reservation.status==='SEATED'){
      const active=await tx.reservationTable.findFirst({where:{reservationId:reservation.id,restaurantId:args.restaurantId,tableOccupancyRef:{is:{active:true}}},select:{diningTableId:true}});
      if(active&&active.diningTableId!==args.tableId)throw new FloorOperationError('RESERVATION_ALREADY_SEATED','A seated guest cannot be moved through reservation assignment.');
    }
    const current=await tx.reservationTable.findFirst({where:{reservationId:reservation.id,restaurantId:args.restaurantId},orderBy:{startsAt:'desc'},include:{diningTableRef:true}});
    const table=await tx.diningTable.findFirst({where:{id:args.tableId,restaurantId:args.restaurantId,active:true,diningZoneRef:{active:true}}});
    if(!table)throw new FloorOperationError('TABLE_UNSUITABLE','That table is inactive or belongs to another restaurant.');
    const waiterMembershipId=args.waiterMembershipId===undefined?current?.waiterMembershipId:args.waiterMembershipId;
    return assignInTransaction(tx,{restaurantId:args.restaurantId,reservationId:reservation.id,table,waiterMembershipId,actorUserId:args.actorUserId,event:current?'TABLE_CHANGED':'TABLE_ASSIGNED'});
  });
}

export async function modifyReservation(args:{restaurantId:string;reservationId:string;actorUserId:string;edit:ReservationEdit}){
  return runSerializable(async tx=>{
    const reservation=await tx.reservation.findFirst({where:{id:args.reservationId,restaurantId:args.restaurantId}});
    if(!reservation)throw new FloorOperationError('RESERVATION_NOT_FOUND','Reservation not found.');
    if(reservation.status!=='CONFIRMED')throw new FloorOperationError('RESERVATION_LOCKED','Only confirmed reservations can be changed.');
    const start=reservation.startsAt;
    const date=args.edit.date??start.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
    const time=args.edit.time??start.toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'});
    const partySize=args.edit.partySize??reservation.partySize;
    const [policy,periods,closures]=await Promise.all([
      tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId:args.restaurantId}}),
      tx.servicePeriod.findMany({where:{restaurantId:args.restaurantId,active:true}}),
      tx.specialClosure.findMany({where:{restaurantId:args.restaurantId}})
    ]);
    const interval=assertBookingAllowed({date,time,partySize,now:new Date(),policy,periods,closures});
    const assignments=await tx.reservationTable.findMany({where:{reservationId:reservation.id},select:{id:true,diningTableId:true,waiterMembershipId:true}});
    const oldIds=assignments.map((row:any)=>row.id);
    const candidate=await availableTable(tx,args.restaurantId,partySize,interval.start,interval.end,undefined,oldIds);
    if(!candidate)throw new FloorOperationError('TABLE_UNAVAILABLE','No suitable table is available for that change.');
    for(const tableId of [...new Set([...assignments.map((row:any)=>row.diningTableId),candidate.id])].sort())await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tableId}::text))`;
    if(oldIds.length)await tx.tableOccupancy.updateMany({where:{reservationTableId:{in:oldIds},active:true},data:{active:false}});
    const conflict=await tx.tableOccupancy.findFirst({where:{restaurantId:args.restaurantId,diningTableId:candidate.id,active:true,startsAt:{lt:interval.end},endsAt:{gt:interval.start}},select:{id:true}});
    if(conflict)throw new FloorOperationError('TABLE_UNAVAILABLE','No suitable table is available for that change.');
    const updated=await tx.reservation.update({where:{id:reservation.id},data:{partySize,startsAt:interval.start,endsAt:interval.end,notes:args.edit.notes===undefined?reservation.notes:args.edit.notes}});
    const waiterMembershipId=assignments[0]?.waiterMembershipId??null;
    const assignment=await tx.reservationTable.create({data:{restaurantId:args.restaurantId,reservationId:reservation.id,diningTableId:candidate.id,waiterMembershipId,startsAt:interval.start,endsAt:interval.end}});
    await tx.tableOccupancy.create({data:{restaurantId:args.restaurantId,reservationTableId:assignment.id,diningTableId:candidate.id,startsAt:interval.start,endsAt:interval.end,active:true}});
    await tx.reservationEvent.create({data:{reservationId:reservation.id,actorUserId:args.actorUserId,fromStatus:reservation.status,toStatus:reservation.status,metadata:{action:'RESERVATION_MODIFIED',partySize,startsAt:interval.start.toISOString(),tableId:candidate.id,tableLabel:candidate.label}}});
    return {id:updated.id,status:updated.status,startsAt:updated.startsAt,endsAt:updated.endsAt,partySize:updated.partySize,table:{id:candidate.id,label:candidate.label}};
  });
}

export async function transitionWaitlist(args:{restaurantId:string;entryId:string;actorUserId:string;target:'NOTIFIED'|'SEATED'|'CANCELLED'|'EXPIRED';tableId?:string;waiterMembershipId?:string}){
  return runSerializable(async tx=>{
    const entry=await tx.waitlistEntry.findFirst({where:{id:args.entryId,restaurantId:args.restaurantId},include:{guestProfileRef:true}});
    if(!entry)throw new FloorOperationError('WAITLIST_NOT_FOUND','Waitlist entry not found.');
    const allowed:Record<string,string[]>={WAITING:['NOTIFIED','SEATED','CANCELLED','EXPIRED'],NOTIFIED:['SEATED','CANCELLED','EXPIRED']};
    if(!allowed[entry.status]?.includes(args.target))throw new FloorOperationError('WAITLIST_TRANSITION','That waitlist action is not valid for its current status.');
    if(args.target==='NOTIFIED'){
      const changed=await tx.waitlistEntry.updateMany({where:{id:entry.id,status:entry.status},data:{status:'NOTIFIED',calledAt:new Date()}});
      if(changed.count!==1)throw new FloorOperationError('WAITLIST_CONFLICT','Waitlist entry changed; refresh and try again.');
      await tx.waitlistEvent.create({data:{waitlistEntryId:entry.id,actorUserId:args.actorUserId,status:'NOTIFIED',metadata:{notification:'SIMULATED'}}});
      return {id:entry.id,status:'NOTIFIED'};
    }
    if(args.target==='SEATED'){
      const policy=await tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId:args.restaurantId}});
      const startsAt=new Date(),endsAt=new Date(startsAt.getTime()+(policy.durationMinutes+policy.turnoverMinutes)*60_000);
      const table=await availableTable(tx,args.restaurantId,entry.partySize,startsAt,endsAt,args.tableId);
      if(!table)throw new FloorOperationError('TABLE_UNAVAILABLE','No suitable table is available to seat this party.');
      const reservation=await createSeatedReservation(tx,{restaurantId:args.restaurantId,guestProfileId:entry.guestProfileId,partySize:entry.partySize,name:entry.guestProfileRef.name,actorUserId:args.actorUserId,waiterMembershipId:args.waiterMembershipId,table,waitlistEntryId:entry.id});
      const changed=await tx.waitlistEntry.updateMany({where:{id:entry.id,status:entry.status},data:{status:'SEATED',seatedAt:new Date(),reservationId:reservation.id}});
      if(changed.count!==1)throw new FloorOperationError('WAITLIST_CONFLICT','Waitlist entry changed; refresh and try again.');
      await tx.waitlistEvent.create({data:{waitlistEntryId:entry.id,actorUserId:args.actorUserId,status:'SEATED',metadata:{reservationId:reservation.id,tableId:table.id,tableLabel:table.label}}});
      return {id:entry.id,status:'SEATED',reservationId:reservation.id,table:{id:table.id,label:table.label}};
    }
    const changed=await tx.waitlistEntry.updateMany({where:{id:entry.id,status:entry.status},data:{status:args.target}});
    if(changed.count!==1)throw new FloorOperationError('WAITLIST_CONFLICT','Waitlist entry changed; refresh and try again.');
    await tx.waitlistEvent.create({data:{waitlistEntryId:entry.id,actorUserId:args.actorUserId,status:args.target}});
    return {id:entry.id,status:args.target};
  });
}

export async function setAssistanceStatus(args:{restaurantId:string;requestId:string;actorUserId:string;target:'ACKNOWLEDGED'|'COMPLETED'|'CANCELLED';waiterMembershipId?:string}){
  return db.$transaction(async tx=>{
    const current=await tx.assistanceRequest.findFirst({where:{id:args.requestId,restaurantId:args.restaurantId},select:{status:true,diningTableId:true,diningSessionId:true,type:true}});
    if(!current)throw new FloorOperationError('ASSISTANCE_NOT_FOUND','Service request not found.');
    if(args.waiterMembershipId){
      const assignments=await tx.reservationTable.findMany({where:{restaurantId:args.restaurantId,diningTableId:current.diningTableId,waiterMembershipId:args.waiterMembershipId},select:{id:true}});
      const active=assignments.length?await tx.tableOccupancy.findFirst({where:{restaurantId:args.restaurantId,reservationTableId:{in:assignments.map(row=>row.id)},active:true,startsAt:{lte:new Date()},endsAt:{gt:new Date()}},select:{id:true}}):null;
      if(!active)throw new FloorOperationError('NOT_ASSIGNED','Waiters can only manage requests for their currently assigned tables.');
    }
    const allowed:Record<string,string[]>={OPEN:['ACKNOWLEDGED','COMPLETED','CANCELLED'],ACKNOWLEDGED:['COMPLETED','CANCELLED']};
    if(!allowed[current.status]?.includes(args.target))throw new FloorOperationError('ASSISTANCE_TRANSITION','That service request is already closed.');
    const updated=await tx.assistanceRequest.updateMany({where:{id:args.requestId,restaurantId:args.restaurantId,status:current.status},data:{status:args.target,completedAt:args.target==='COMPLETED'||args.target==='CANCELLED'?new Date():null}});
    if(updated.count!==1)throw new FloorOperationError('ASSISTANCE_TRANSITION','The service request changed; refresh and try again.');
    if(current.diningSessionId)await tx.diningSessionEvent.create({data:{diningSessionId:current.diningSessionId,actorUserId:args.actorUserId,event:'ASSISTANCE_STATUS_CHANGED',metadata:{assistanceRequestId:args.requestId,type:current.type,status:args.target}}});
    return {id:args.requestId,status:args.target};
  });
}

export function floorPolicyError(error:unknown){if(error instanceof BookingRuleError)return new FloorOperationError(error.code,error.message);return error}

function selectedRange(requestedDate?:string,requestedEndDate?:string){
  const date=requestedDate??new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new FloorOperationError('INVALID_DATE','Use a valid calendar date.');
  const start=new Date(`${date}T00:00:00+05:30`);
  if(!Number.isFinite(start.getTime())||start.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})!==date)throw new FloorOperationError('INVALID_DATE','Use a valid calendar date.');
  const endDate=requestedEndDate??date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate))throw new FloorOperationError('INVALID_DATE','Use a valid calendar date.');
  const inclusiveEnd=new Date(`${endDate}T00:00:00+05:30`);
  if(!Number.isFinite(inclusiveEnd.getTime())||inclusiveEnd.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'})!==endDate||inclusiveEnd<start||inclusiveEnd.getTime()-start.getTime()>6*86_400_000)throw new FloorOperationError('INVALID_DATE','Choose a date range of seven days or less.');
  return {date,start,end:new Date(inclusiveEnd.getTime()+86_400_000)};
}

export async function getFloorBoard(restaurantId:string,waiterMembershipId?:string,requestedDate?:string,requestedEndDate?:string){
  const now=new Date(),{date,start,end}=selectedRange(requestedDate,requestedEndDate);
  const [tables,occupancies,reservations,waitlist,assistance,orders,waiters]=await Promise.all([
    db.diningTable.findMany({where:{restaurantId,active:true,diningZoneRef:{active:true}},include:{diningZoneRef:true},orderBy:[{diningZoneRef:{sortOrder:'asc'}},{label:'asc'}]}),
    db.tableOccupancy.findMany({where:{restaurantId,active:true,startsAt:{lt:end},endsAt:{gt:start}},select:{id:true,diningTableId:true,reservationTableId:true,startsAt:true,endsAt:true}}),
    db.reservation.findMany({where:{restaurantId,startsAt:{lt:end},endsAt:{gt:start},status:{notIn:['CANCELLED','EXPIRED','NO_SHOW','COMPLETED']}},include:{guestProfileRef:{select:{name:true,email:true,phone:true,vip:true}},ReservationTable_reservationId:{include:{diningTableRef:{select:{id:true,label:true,diningZoneId:true}},waiterMembershipRef:{include:{userRef:{select:{name:true}}}}}}},orderBy:{startsAt:'asc'},take:300}),
    db.waitlistEntry.findMany({where:{restaurantId,status:{in:['WAITING','NOTIFIED']}},include:{guestProfileRef:{select:{name:true,email:true,phone:true}},WaitlistEvent_waitlistEntryId:{orderBy:{createdAt:'desc'},take:1}},orderBy:{createdAt:'asc'},take:100}),
    db.assistanceRequest.findMany({where:{restaurantId,status:{in:['OPEN','ACKNOWLEDGED']}},include:{diningTableRef:{select:{id:true,label:true}}},orderBy:{createdAt:'asc'},take:100}),
    db.order.findMany({
      where:{restaurantId,type:'DINE_IN',reservationId:{not:null},status:{in:['PLACED','ACCEPTED','PREPARING','READY']}},
      include:{
        reservationRef:{include:{ReservationTable_reservationId:{include:{diningTableRef:{select:{id:true,label:true}},waiterMembershipRef:{select:{id:true,userRef:{select:{name:true}}}}}}}},
        KitchenTicket_orderId:{select:{status:true,station:true}}
      },
      orderBy:{createdAt:'asc'},take:200
    }),
    db.staffMembership.findMany({where:{restaurantId,status:'ACTIVE',StaffRole_staffMembershipId:{some:{roleRef:{code:'WAITER'}}}},include:{userRef:{select:{name:true}}},orderBy:{userRef:{name:'asc'}}})
  ]);
  const occupancyIds=occupancies.map(row=>row.reservationTableId);
  const activeAssignmentIds=new Set(occupancyIds);
  const assignments=occupancyIds.length?await db.reservationTable.findMany({where:{id:{in:occupancyIds}},include:{reservationRef:{select:{id:true,reference:true,status:true,guestProfileRef:{select:{name:true}},partySize:true}},waiterMembershipRef:{select:{id:true,userRef:{select:{name:true}}}}}}):[];
  const assignmentById=new Map(assignments.map(row=>[row.id,row]));
  const tableRows=tables.map(table=>{
    const rows=occupancies.filter(item=>item.diningTableId===table.id).map(item=>({occupancy:item,assignment:assignmentById.get(item.reservationTableId)})).filter(row=>row.assignment);
    const visible=waiterMembershipId?rows.filter(row=>row.assignment?.waiterMembershipId===waiterMembershipId):rows;
    const active=visible.find(row=>row.occupancy.startsAt<=now&&row.occupancy.endsAt>now);
    const upcoming=visible.find(row=>row.occupancy.startsAt>now);
    const status=active?.assignment?.reservationRef.status==='SEATED'?'OCCUPIED':active?'ARRIVED':upcoming?'RESERVED':'AVAILABLE';
    return {id:table.id,label:table.label,zone:table.diningZoneRef.name,minCapacity:table.minCapacity,maxCapacity:table.maxCapacity,x:table.x,y:table.y,status,guest:active?.assignment?.reservationRef.guestProfileRef.name??upcoming?.assignment?.reservationRef.guestProfileRef.name??null,partySize:active?.assignment?.reservationRef.partySize??upcoming?.assignment?.reservationRef.partySize??null,startsAt:(active??upcoming)?.occupancy.startsAt.toISOString()??null,waiter:active?.assignment?.waiterMembershipRef?.userRef.name??upcoming?.assignment?.waiterMembershipRef?.userRef.name??null};
  }).filter(table=>!waiterMembershipId||table.status!=='AVAILABLE');
  const scopedReservations=waiterMembershipId?reservations.filter(reservation=>reservation.ReservationTable_reservationId.some(row=>row.waiterMembershipId===waiterMembershipId&&activeAssignmentIds.has(row.id))):reservations;
  const scopedAssistance=waiterMembershipId?assistance.filter(request=>tableRows.some(table=>table.id===request.diningTableId)):assistance;
  const scopedOrders=waiterMembershipId?orders.filter(order=>order.reservationRef?.ReservationTable_reservationId.some(row=>row.waiterMembershipId===waiterMembershipId&&activeAssignmentIds.has(row.id))):orders;
  return {
    date,now:now.toISOString(),tables:tableRows,
    reservations:scopedReservations.map(row=>({id:row.id,reference:row.reference,guest:row.guestProfileRef.name,email:row.guestProfileRef.email,phone:row.guestProfileRef.phone,vip:row.guestProfileRef.vip,partySize:row.partySize,status:row.status,startsAt:row.startsAt.toISOString(),endsAt:row.endsAt.toISOString(),notes:row.notes,tables:row.ReservationTable_reservationId.filter(assignment=>!waiterMembershipId||activeAssignmentIds.has(assignment.id)).map(assignment=>({id:assignment.diningTableRef.id,label:assignment.diningTableRef.label,waiterMembershipId:assignment.waiterMembershipId,waiter:assignment.waiterMembershipRef?.userRef.name??null}))})),
    waitlist:waiterMembershipId?[]:waitlist.map(row=>({id:row.id,guest:row.guestProfileRef.name,email:row.guestProfileRef.email,phone:row.guestProfileRef.phone,partySize:row.partySize,status:row.status,createdAt:row.createdAt.toISOString(),calledAt:row.calledAt?.toISOString()??null,quotedMinutes:row.quotedMinutes})),
    assistance:scopedAssistance.map(row=>({id:row.id,tableId:row.diningTableId,table:row.diningTableRef.label,type:row.type,requestType:(row.metadata as {requestType?:string}|null)?.requestType??row.type,status:row.status,createdAt:row.createdAt.toISOString()})),
    orders:scopedOrders.map(row=>({id:row.id,reference:row.reference,status:row.status,createdAt:row.createdAt.toISOString(),reservationId:row.reservationId,table:row.reservationRef?.ReservationTable_reservationId.map(assignment=>assignment.diningTableRef.label).join(', ')??'',waiter:row.reservationRef?.ReservationTable_reservationId.find(assignment=>assignment.waiterMembershipId)?.waiterMembershipRef?.userRef.name??null,kitchen:row.KitchenTicket_orderId[0]?.status??'NEW',station:row.KitchenTicket_orderId[0]?.station??'MAIN'})),
    waiters:waiterMembershipId?[]:waiters.map(row=>({id:row.id,name:row.userRef.name})),
    lateArrivals:scopedReservations.filter(row=>row.status==='CONFIRMED'&&row.startsAt.getTime()<now.getTime()-15*60_000).map(row=>({id:row.id,reference:row.reference,guest:row.guestProfileRef.name,startsAt:row.startsAt.toISOString()}))
  };
}
