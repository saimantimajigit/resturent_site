import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {authorizeRole,AuthenticationError,AuthorizationError} from '@/server/session';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({decision:z.enum(['APPROVE_DEMO','REJECT'])});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 try{await authorizeRole(['MANAGER','OWNER']);const {id}=await params;const body=input.parse(await request.json());const refund=await db.refund.findFirst({where:{id,paymentRef:{orderRef:{restaurantId:process.env.RESTAURANT_ID}}}});if(!refund)return NextResponse.json({error:{message:'Refund request not found.'}},{status:404});if(refund.status!=='REQUESTED')return NextResponse.json({error:{message:'This refund request was already reviewed.'}},{status:409});const updated=await db.refund.updateMany({where:{id,status:'REQUESTED'},data:{status:body.decision==='APPROVE_DEMO'?'SIMULATED':'REJECTED'}});if(!updated.count)return NextResponse.json({error:{message:'This refund request was already reviewed.'}},{status:409});return NextResponse.json({data:{reviewed:true,status:body.decision==='APPROVE_DEMO'?'SIMULATED':'REJECTED'}});}catch(error){if(error instanceof AuthenticationError)return NextResponse.json({error:{message:'Sign in required.'}},{status:401});if(error instanceof AuthorizationError)return NextResponse.json({error:{message:'Manager access required.'}},{status:403});if(error instanceof ZodError)return NextResponse.json({error:{message:'Invalid refund decision.'}},{status:400});console.error('refund review failed',error);return NextResponse.json({error:{message:'Could not review this refund request.'}},{status:500});}
}
