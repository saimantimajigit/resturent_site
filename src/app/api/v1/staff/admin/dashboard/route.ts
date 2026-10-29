import {NextResponse} from 'next/server';
import {z} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {managementDashboard} from '@/server/admin-analytics';
import {parseAdminRange} from '@/server/admin-format';

const date=z.iso.date();
export async function GET(request:Request){
  try{
    const context=await managerContext();
    const restaurant=await db.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{timezone:true}});
    const url=new URL(request.url),today=new Intl.DateTimeFormat('en-CA',{timeZone:restaurant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const fromDate=date.parse(url.searchParams.get('from')||today),toDate=date.parse(url.searchParams.get('to')||today);
    const range=parseAdminRange(fromDate,toDate,restaurant.timezone);
    return NextResponse.json({data:await managementDashboard(context.restaurantId,range)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return adminError(error,'Dashboard data is temporarily unavailable.')}
}
