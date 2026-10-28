import {notFound,redirect} from 'next/navigation';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import OrderTracker from '@/components/order-tracker';
export const dynamic='force-dynamic';
export default async function OrderConfirmation({params}:{params:Promise<{id:string}>}){
 const customer=await currentCustomer();if(!customer)redirect('/login');const {id}=await params;
 const order=await db.order.findFirst({where:{id,guestProfileId:customer.guest.id,restaurantId:process.env.RESTAURANT_ID},include:{OrderItem_orderId:{select:{id:true,nameSnapshot:true,quantity:true,notes:true,allergenSnapshot:true}},OrderEvent_orderId:{orderBy:{createdAt:'asc'},select:{fromStatus:true,toStatus:true,createdAt:true}}}});if(!order)notFound();
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Thank you</p><h1>Order received.</h1><p>Your order is with the SAVORÉ kitchen. You can follow its progress here.</p></div></section><main className="content-width"><OrderTracker initial={{...order,totalMinor:order.totalMinor.toString(),currency:order.currency,createdAt:order.createdAt.toISOString(),OrderEvent_orderId:order.OrderEvent_orderId.map(event=>({...event,createdAt:event.createdAt.toISOString()}))}}/></main></>;
}
