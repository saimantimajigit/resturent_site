import {NextResponse} from 'next/server';
import {z} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {managementReport} from '@/server/admin-analytics';
import {parseAdminRange} from '@/server/admin-format';

const date=z.iso.date(),typeSchema=z.enum(['reservations','orders','kitchen']);
export async function GET(request:Request){
  try{
    const context=await managerContext(),restaurant=await db.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{timezone:true}}),url=new URL(request.url);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:restaurant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const range=parseAdminRange(date.parse(url.searchParams.get('from')||today),date.parse(url.searchParams.get('to')||today),restaurant.timezone);
    const type=typeSchema.parse(url.searchParams.get('type')||'reservations'),page=z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get('page')||'1');
    return NextResponse.json({data:await managementReport(context.restaurantId,range,type,page)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return adminError(error,'Report data is temporarily unavailable.')}
}
