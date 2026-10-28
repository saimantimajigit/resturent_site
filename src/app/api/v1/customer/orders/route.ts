import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import {createCustomerOrder,OrderInputError,OrderUnavailableError} from '@/server/orders';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({items:z.array(z.object({menuItemId:z.uuid(),quantity:z.number().int().min(1).max(20),notes:z.string().trim().max(240).optional()})).min(1).max(20),reservationId:z.uuid().optional()});
export async function GET(){
 const customer=await currentCustomer();if(!customer)return NextResponse.json({error:{message:'Sign in to view your orders.'}},{status:401});
 const orders=await db.order.findMany({where:{guestProfileId:customer.guest.id,restaurantId:process.env.RESTAURANT_ID},orderBy:{createdAt:'desc'},take:50,select:{id:true,reference:true,status:true,type:true,totalMinor:true,currency:true,createdAt:true}});
 return NextResponse.json({data:orders.map(order=>({...order,totalMinor:order.totalMinor.toString()}))});
}
export async function POST(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 const customer=await currentCustomer();if(!customer)return NextResponse.json({error:{message:'Sign in before placing an order.'}},{status:401});
 const key=request.headers.get('idempotency-key')?.trim();if(!key||key.length<16||key.length>128)return NextResponse.json({error:{message:'A valid Idempotency-Key is required.'}},{status:400});
 try{const body=input.parse(await request.json());const order=await createCustomerOrder(customer.guest.id,process.env.RESTAURANT_ID!,key,body.items,body.reservationId);return NextResponse.json({data:{id:order.id,reference:order.reference,status:order.status,type:order.type}},{status:201});}
 catch(error){if(error instanceof ZodError||error instanceof OrderInputError)return NextResponse.json({error:{message:'Please review the order details.'}},{status:400});if(error instanceof OrderUnavailableError)return NextResponse.json({error:{message:error.message}},{status:409});console.error('customer order creation failed',error);return NextResponse.json({error:{message:'The order could not be placed.'}},{status:500});}
}
