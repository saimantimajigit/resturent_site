import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {allowQrRequest,rateLimitedResponse} from '@/server/auth-rate-limit';
import {createCustomerOrder,OrderInputError,OrderUnavailableError} from '@/server/orders';
import {getQrGuestContext,QR_GUEST_COOKIE,QrDiningError} from '@/server/qr-dining';

const input=z.object({items:z.array(z.object({menuItemId:z.uuid(),quantity:z.number().int().min(1).max(20),notes:z.string().trim().max(240).optional()}).strict()).min(1).max(20)}).strict();
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const raw=(await cookies()).get(QR_GUEST_COOKIE)?.value;const access=await getQrGuestContext(raw);
    if(!await allowQrRequest(request,'order',access.guestTokenId,30,12))return rateLimitedResponse();
    const key=request.headers.get('idempotency-key')?.trim();if(!key||key.length<16||key.length>128)return NextResponse.json({error:{code:'IDEMPOTENCY_KEY_REQUIRED',message:'Refresh the page and try again.'}},{status:400});
    const body=input.parse(await request.json());
    const order=await createCustomerOrder(access.guestProfileId,access.session.restaurantId,key,body.items,{reservationId:access.session.reservationId,diningSessionId:access.session.id});
    return NextResponse.json({data:{id:order.id,reference:order.reference,status:order.status}},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof ZodError||error instanceof OrderInputError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Check the dishes and quantities.'}},{status:400});
    if(error instanceof QrDiningError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    if(error instanceof OrderUnavailableError)return NextResponse.json({error:{code:'ORDER_UNAVAILABLE',message:error.message}},{status:409});
    console.error('QR order submission failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'The order could not be placed.'}},{status:500});
  }
}
