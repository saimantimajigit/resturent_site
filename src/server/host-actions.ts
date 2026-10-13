import 'server-only';
import {db} from './db';
import {assertTransition} from './booking-policy';
import {authorizeRole} from './session';
export async function changeReservationStatus(id:string,target:'ARRIVED'|'SEATED'|'COMPLETED'|'CANCELLED'|'NO_SHOW'){
 const actor=await authorizeRole(['HOST','MANAGER','OWNER']);
 const restaurantId=process.env.RESTAURANT_ID!;
 return db.$transaction(async tx=>{
  const reservation=await tx.reservation.findFirst({where:{id,restaurantId}});
  if(!reservation)throw new Error('RESERVATION_NOT_FOUND');
  assertTransition(reservation.status,target);
  const changed=await tx.reservation.updateMany({where:{id,restaurantId,status:reservation.status},data:{status:target}});
  if(changed.count!==1)throw new Error('STATE_CONFLICT');
  if(target==='CANCELLED'||target==='COMPLETED'||target==='NO_SHOW'){
   const assignments=await tx.reservationTable.findMany({where:{reservationId:id},select:{id:true}});
   await tx.tableOccupancy.updateMany({where:{reservationTableId:{in:assignments.map(a=>a.id)}},data:{active:false}});
  }
  await tx.reservationEvent.create({data:{reservationId:id,actorUserId:actor.id,fromStatus:reservation.status,toStatus:target}});
  return {id,status:target};
 });
}
