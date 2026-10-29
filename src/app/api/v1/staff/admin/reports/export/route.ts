import {NextResponse} from 'next/server';
import {z} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {managementReport} from '@/server/admin-analytics';
import {csvCell,parseAdminRange} from '@/server/admin-format';

const date=z.iso.date(),typeSchema=z.enum(['reservations','orders','kitchen']);
export async function GET(request:Request){
  try{
    const context=await managerContext(),restaurant=await db.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{timezone:true}}),url=new URL(request.url);
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:restaurant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const range=parseAdminRange(date.parse(url.searchParams.get('from')||today),date.parse(url.searchParams.get('to')||today),restaurant.timezone);
    const type=typeSchema.parse(url.searchParams.get('type')||'reservations');
    const report=await managementReport(context.restaurantId,range,type,1,5000),rows=report.rows as Record<string,unknown>[];
    if(report.total>5000)return NextResponse.json({error:{code:'RANGE_TOO_LARGE',message:'Narrow the date range to export 5,000 rows or fewer.'}},{status:413});
    const columns=type==='reservations'?['reference','partySize','startsAt','endsAt','status']:type==='orders'?['reference','type','status','totalMinor','currency','createdAt']:['orderReference','status','createdAt','startedAt','completedAt','preparationMinutes'];
    const lines=[columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\r\n');
    return new NextResponse(`\uFEFF${lines}`,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="savore-${type}-${range.fromDate}-${range.toDate}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return adminError(error,'CSV export is temporarily unavailable.')}
}
