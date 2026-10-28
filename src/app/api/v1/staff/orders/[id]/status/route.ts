import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {authorizeRole,AuthenticationError,AuthorizationError} from '@/server/session';
import {db} from '@/server/db';
import {changeOrderStatus,OrderTransitionError,OrderUnavailableError} from '@/server/orders';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({status:z.enum(['ACCEPTED','PREPARING','READY','SERVED','COLLECTED','DELIVERED','CANCELLED','REJECTED'])});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 try{
  const actor=await authorizeRole(['CHEF','MANAGER','OWNER']);const {id}=await params;const {status}=input.parse(await request.json());
  const membership=await db.staffMembership.findFirst({where:{userId:actor.id,restaurantId:process.env.RESTAURANT_ID,status:'ACTIVE'},include:{StaffRole_staffMembershipId:{include:{roleRef:true}}}});
  const roles=membership?.StaffRole_staffMembershipId.map(row=>row.roleRef.code)??[];
  if(roles.includes('CHEF')&&!roles.some(role=>role==='MANAGER'||role==='OWNER')&&!['PREPARING','READY'].includes(status))return NextResponse.json({error:{message:'Kitchen staff may only update preparation status.'}},{status:403});
  return NextResponse.json({data:await changeOrderStatus(id,process.env.RESTAURANT_ID!,actor.id,status)});
 }catch(error){if(error instanceof AuthenticationError)return NextResponse.json({error:{message:'Sign in required.'}},{status:401});if(error instanceof AuthorizationError)return NextResponse.json({error:{message:'You do not have access to order management.'}},{status:403});if(error instanceof ZodError)return NextResponse.json({error:{message:'Invalid order status.'}},{status:400});if(error instanceof OrderTransitionError||error instanceof OrderUnavailableError)return NextResponse.json({error:{message:error.message}},{status:error instanceof OrderUnavailableError?404:409});console.error('staff order status update failed',error);return NextResponse.json({error:{message:'Could not update order status.'}},{status:500});}
}
