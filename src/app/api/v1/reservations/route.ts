import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
import {bookingInput,createBooking,BookingConflict,BookingRuleError} from '@/server/reservations';
import {rejectCrossOrigin} from '@/server/request-security';
export async function POST(req:Request){
 const rejected=rejectCrossOrigin(req);if(rejected)return rejected;
 try{const input=bookingInput.parse(await req.json());return NextResponse.json({data:await createBooking(input)},{status:201})}
 catch(e){
  if(e instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid booking details'}},{status:400});
  if(e instanceof BookingRuleError)return NextResponse.json({error:{code:e.code,message:e.message}},{status:422});
  if(e instanceof BookingConflict)return NextResponse.json({error:{code:'BOOKING_CONFLICT',message:e.message}},{status:409});
  // PostgreSQL exclusion violations can surface as P2010 with SQLSTATE 23P01;
  // serializable transaction retries surface as P2034.
  if(isBookingConflict(e))return NextResponse.json({error:{code:'BOOKING_CONFLICT',message:'Please select another slot or retry'}},{status:409});
  console.error('booking failure',e);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not complete reservation'}},{status:500});
 }
}

function isBookingConflict(error:unknown):boolean{
 if(!error||typeof error!=='object')return false;
 const value=error as {code?:unknown;meta?:{code?:unknown;message?:unknown}};
 return value.code==='P2002'||value.code==='P2034'||
  (value.code==='P2010'&&(value.meta?.code==='23P01'||String(value.meta?.message??'').includes('occupancy_no_overlap')));
}
