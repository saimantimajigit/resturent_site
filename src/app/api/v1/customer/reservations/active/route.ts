import {NextResponse} from 'next/server';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';

export const dynamic='force-dynamic';
export async function GET(){
  const customer=await currentCustomer();
  if(!customer)return NextResponse.json({error:{message:'Sign in to view your table.'}},{status:401});
  const now=new Date();
  const activeAssignment={tableOccupancyRef:{is:{active:true,startsAt:{lte:now},endsAt:{gt:now}}}};
  const reservations=await db.reservation.findMany({
    where:{restaurantId:process.env.RESTAURANT_ID,guestProfileId:customer.guest.id,status:'SEATED',ReservationTable_reservationId:{some:activeAssignment}},
    include:{ReservationTable_reservationId:{where:activeAssignment,include:{diningTableRef:{select:{label:true}}}}},
    orderBy:{startsAt:'desc'},take:10
  });
  return NextResponse.json({data:reservations.map(reservation=>({id:reservation.id,reference:reservation.reference,table:reservation.ReservationTable_reservationId.map(row=>row.diningTableRef.label).join(', ')}))},{headers:{'Cache-Control':'no-store'}});
}
