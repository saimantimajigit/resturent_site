import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getQrGuestContext,getQrOrder,QR_GUEST_COOKIE,QrDiningError} from '@/server/qr-dining';

export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const raw=(await cookies()).get(QR_GUEST_COOKIE)?.value;const access=await getQrGuestContext(raw);const {id}=await params;
    return NextResponse.json({data:await getQrOrder({orderId:id,sessionId:access.session.id,restaurantId:access.session.restaurantId})},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof QrDiningError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    console.error('QR order tracking failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not load this table order.'}},{status:500});
  }
}
