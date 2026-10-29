import {NextResponse} from 'next/server';
import {z} from 'zod';
import {slots} from '@/server/reservations';

export async function GET(request:Request){
  const url=new URL(request.url),date=url.searchParams.get('date'),partySize=Number(url.searchParams.get('partySize')??2);
  if(!date||!z.iso.date().safeParse(date).success||!Number.isInteger(partySize)||partySize<1||partySize>12)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid date or party size'}},{status:400,headers:{'Cache-Control':'private, no-store, max-age=0'}});
  try{
    return NextResponse.json({data:{date,partySize,slots:await slots(date,partySize)}},{headers:{'Cache-Control':'private, no-store, max-age=0'}});
  }catch{
    return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Availability unavailable'}},{status:500,headers:{'Cache-Control':'private, no-store, max-age=0'}});
  }
}
