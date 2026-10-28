import {NextResponse} from 'next/server';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const customer=await currentCustomer();if(!customer)return NextResponse.json({error:{message:'Sign in to track this order.'}},{status:401});
 const {id}=await params;const order=await db.order.findFirst({where:{id,guestProfileId:customer.guest.id,restaurantId:process.env.RESTAURANT_ID},include:{OrderItem_orderId:{select:{id:true,nameSnapshot:true,quantity:true,notes:true,allergenSnapshot:true}},OrderEvent_orderId:{orderBy:{createdAt:'asc'},select:{fromStatus:true,toStatus:true,createdAt:true}}}});
 if(!order)return NextResponse.json({error:{message:'Order not found.'}},{status:404});
 return NextResponse.json({data:{...order,totalMinor:order.totalMinor.toString(),subtotalMinor:order.subtotalMinor.toString(),taxMinor:order.taxMinor.toString(),OrderEvent_orderId:order.OrderEvent_orderId.map(event=>({...event,createdAt:event.createdAt.toISOString()}))}});
}
