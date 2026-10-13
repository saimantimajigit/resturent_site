import {NextResponse} from 'next/server';
import {z} from 'zod';
import {changeReservationStatus} from '@/server/host-actions';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {ZodError} from 'zod';
const input=z.object({status:z.enum(['ARRIVED','SEATED','COMPLETED','CANCELLED','NO_SHOW'])});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==new URL(req.url).host)return NextResponse.json({error:{code:'ORIGIN_REJECTED'}},{status:403});
 try{const {id}=await params;const {status}=input.parse(await req.json());return NextResponse.json({data:await changeReservationStatus(id,status)})}
 catch(e){
  if(e instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required'}},{status:401});
  if(e instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Insufficient permissions'}},{status:403});
  if(e instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid status'}},{status:400});
  const msg=e instanceof Error?e.message:'UNKNOWN';
  const code=msg==='RESERVATION_NOT_FOUND'?'NOT_FOUND':msg==='STATE_CONFLICT'||msg.startsWith('Cannot transition')?'STATE_CONFLICT':'INTERNAL_ERROR';
  const status=code==='NOT_FOUND'?404:code==='STATE_CONFLICT'?409:500;
  if(status===500)console.error('host status failed',e);
  return NextResponse.json({error:{code,message:status===500?'Unable to process request':'Unable to change reservation status'}},{status});
 }
}
