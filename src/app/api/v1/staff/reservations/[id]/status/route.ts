import {NextResponse} from 'next/server';
import {z} from 'zod';
import {changeReservationStatus} from '@/server/host-actions';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({status:z.enum(['ARRIVED','SEATED','COMPLETED','CANCELLED','NO_SHOW'])});
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const rejected=rejectCrossOrigin(req);if(rejected)return rejected;
 try{const {id}=await params;const {status}=input.parse(await req.json());return NextResponse.json({data:await changeReservationStatus(id,status)})}
 catch(e){
  if(e instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required'}},{status:401});
  if(e instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Insufficient permissions'}},{status:403});
  if(e instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid status'}},{status:400});
  const msg=e instanceof Error?e.message:'UNKNOWN';
  const code=msg==='RESERVATION_NOT_FOUND'?'NOT_FOUND':msg==='STATE_CONFLICT'||msg.startsWith('Cannot transition')?'STATE_CONFLICT':msg==='ACTIVE_DINE_IN_ORDER'?'ACTIVE_DINE_IN_ORDER':msg.startsWith('TABLE_')?msg:'INTERNAL_ERROR';
  const status=code==='NOT_FOUND'?404:code==='INTERNAL_ERROR'?500:409;
  if(status===500)console.error('host status failed',e);
  const message=code==='TABLE_ASSIGNMENT_REQUIRED'?'Assign an available table before seating this guest.':code==='TABLE_UNSUITABLE'?'The assigned table does not fit this party.':code==='TABLE_UNAVAILABLE'?'The table has another active allocation; choose another table.':code==='ACTIVE_DINE_IN_ORDER'?'Close or cancel the active dine-in order before completing this reservation.':status===500?'Unable to process request':'Unable to change reservation status';
  return NextResponse.json({error:{code,message}},{status});
 }
}
