import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {getQrGuestContext,QR_GUEST_COOKIE,QrDiningError,qrMenu} from '@/server/qr-dining';

export const dynamic='force-dynamic';
export async function GET(){
  try{
    const raw=(await cookies()).get(QR_GUEST_COOKIE)?.value;const access=await getQrGuestContext(raw);
    return NextResponse.json({data:{restaurant:access.restaurant,table:access.table,items:await qrMenu(access.session.restaurantId)}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof QrDiningError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    console.error('QR menu load failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not load the table menu.'}},{status:500});
  }
}
