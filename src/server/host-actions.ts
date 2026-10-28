import 'server-only';
import {db} from './db';
import {assertTransition} from './booking-policy';
import {authorizeRole} from './session';
export async function changeReservationStatus(id:string,target:'ARRIVED'|'SEATED'|'COMPLETED'|'CANCELLED'|'NO_SHOW'){
 const actor=await authorizeRole(['HOST','MANAGER','OWNER']);
 const restaurantId=process.env.RESTAURANT_ID!;
 return db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id=${id}::uuid AND "restaurantId"=${restaurantId}::uuid FOR UPDATE`;
  const reservation=await tx.reservation.findFirst({where:{id,restaurantId}});
  if(!reservation)throw new Error('RESERVATION_NOT_FOUND');
  assertTransition(reservation.status,target);
  if(target==='COMPLETED'){
   const openDineInOrder=await tx.order.findFirst({where:{restaurantId,reservationId:id,type:'DINE_IN',status:{in:['PLACED','ACCEPTED','PREPARING','READY']}},select:{id:true}});
   if(openDineInOrder)throw new Error('ACTIVE_DINE_IN_ORDER');
  }
  if(target==='SEATED'){
   const assignments=await tx.reservationTable.findMany({where:{reservationId:id,restaurantId},include:{diningTableRef:true}});
   const activeIds=assignments.map(a=>a.id);
   const occupancy=activeIds.length?await tx.tableOccupancy.findFirst({where:{restaurantId,reservationTableId:{in:activeIds},active:true,endsAt:{gt:new Date()}},select:{id:true,startsAt:true,endsAt:true,diningTableId:true,reservationTableId:true}}):null;
   if(!occupancy)throw new Error('TABLE_ASSIGNMENT_REQUIRED');
   const assignedTable=assignments.find(a=>a.id===occupancy.reservationTableId)!.diningTableRef;
   if(assignedTable.maxCapacity<reservation.partySize||assignedTable.minCapacity>reservation.partySize)throw new Error('TABLE_UNSUITABLE');
   if(occupancy.startsAt>new Date()){
    const seatedAt=new Date();
    const duration=occupancy.endsAt.getTime()-occupancy.startsAt.getTime();
    const seatedEndsAt=new Date(seatedAt.getTime()+duration);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occupancy.diningTableId}::text))`;
    const overlap=await tx.tableOccupancy.findFirst({where:{restaurantId,diningTableId:occupancy.diningTableId,reservationTableId:{not:occupancy.reservationTableId},active:true,startsAt:{lt:seatedEndsAt},endsAt:{gt:seatedAt}},select:{id:true}});
    if(overlap)throw new Error('TABLE_UNAVAILABLE');
    await tx.tableOccupancy.update({where:{id:occupancy.id},data:{startsAt:seatedAt,endsAt:seatedEndsAt}});
    await tx.reservationTable.update({where:{id:occupancy.reservationTableId},data:{startsAt:seatedAt,endsAt:seatedEndsAt}});
    await tx.reservation.update({where:{id},data:{startsAt:seatedAt,endsAt:seatedEndsAt}});
   }
  }
  const changed=await tx.reservation.updateMany({where:{id,restaurantId,status:reservation.status},data:{status:target}});
  if(changed.count!==1)throw new Error('STATE_CONFLICT');
  let releasedTableIds:string[]=[];
  if(target==='CANCELLED'||target==='COMPLETED'||target==='NO_SHOW'){
   const qrSessions=await tx.diningSession.findMany({where:{restaurantId,reservationId:id,status:'ACTIVE'},select:{id:true}});
   for(const session of qrSessions){
    await tx.diningSession.update({where:{id:session.id},data:{status:'CLOSED',closedAt:new Date()}});
    await tx.diningGuestToken.updateMany({where:{diningSessionId:session.id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.diningSessionEvent.create({data:{diningSessionId:session.id,actorUserId:actor.id,event:'QR_SESSION_CLOSED_WITH_RESERVATION',metadata:{reservationStatus:target}}});
   }
   const assignments=await tx.reservationTable.findMany({where:{reservationId:id,restaurantId},select:{id:true,diningTableId:true}});
   await tx.tableOccupancy.updateMany({where:{reservationTableId:{in:assignments.map(a=>a.id)}},data:{active:false}});
   releasedTableIds=assignments.map(a=>a.diningTableId);
  }
  await tx.reservationEvent.create({data:{reservationId:id,actorUserId:actor.id,fromStatus:reservation.status,toStatus:target,metadata:releasedTableIds.length?{action:'TABLES_RELEASED',tableIds:releasedTableIds}:undefined}});
  return {id,status:target};
 });
}
