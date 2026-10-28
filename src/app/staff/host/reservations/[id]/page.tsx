import {notFound} from 'next/navigation';
import {db} from '@/server/db';
import {staffContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import {ReservationEditForm,ReservationStatusActions} from '@/components/floor-actions';

export const dynamic='force-dynamic';
export default async function ReservationManagement({params}:{params:Promise<{id:string}>}){
  const context=await staffContext(['HOST','MANAGER','OWNER']);const {id}=await params;
  const reservation=await db.reservation.findFirst({where:{id,restaurantId:context.restaurantId},include:{guestProfileRef:true,ReservationTable_reservationId:{include:{diningTableRef:true}}}});
  if(!reservation)notFound();
  const board=await getFloorBoard(context.restaurantId);
  const row=board.reservations.find(item=>item.id===id);
  return <main className="layout"><p className="eyebrow">Reservation management</p><h1>{reservation.guestProfileRef.name}</h1><p className="muted">{reservation.reference} · party of {reservation.partySize} · {reservation.status.toLowerCase().replaceAll('_',' ')}</p><section className="card"><p>{reservation.guestProfileRef.email??'No email'} · {reservation.guestProfileRef.phone??'No phone'}</p><p>{reservation.startsAt.toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</p><p>Current table: {reservation.ReservationTable_reservationId.map(item=>item.diningTableRef.label).join(', ')||'Unassigned'}</p><ReservationStatusActions id={reservation.id} status={reservation.status}/></section>{reservation.status==='CONFIRMED'?<section><h2>Modify booking</h2><ReservationEditForm reservation={{id:reservation.id,startsAt:reservation.startsAt.toISOString(),partySize:reservation.partySize,notes:reservation.notes,tables:reservation.ReservationTable_reservationId.map(item=>({id:item.diningTableId,label:item.diningTableRef.label,waiterMembershipId:item.waiterMembershipId}))}} tables={board.tables} waiters={board.waiters}/></section>:null}{row?.notes?<p className="card">Guest notes: {row.notes}</p>:null}</main>;
}
