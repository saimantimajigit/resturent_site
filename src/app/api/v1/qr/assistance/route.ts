import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {allowQrRequest,rateLimitedResponse} from '@/server/auth-rate-limit';
import {createQrAssistance,getQrGuestContext,QR_GUEST_COOKIE,QrDiningError} from '@/server/qr-dining';

const input=z.object({type:z.enum(['WAITER','WATER','BILL','CUTLERY'])}).strict();
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const raw=(await cookies()).get(QR_GUEST_COOKIE)?.value;const access=await getQrGuestContext(raw);
    if(!await allowQrRequest(request,'assistance',access.guestTokenId,30,8))return rateLimitedResponse();
    const body=input.parse(await request.json());const result=await createQrAssistance({guestTokenId:access.guestTokenId,sessionId:access.session.id,restaurantId:access.session.restaurantId,tableId:access.session.diningTableId,type:body.type});
    return NextResponse.json({data:result},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Choose a service request.'}},{status:400});
    if(error instanceof QrDiningError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    console.error('QR assistance request failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not send your request.'}},{status:500});
  }
}
