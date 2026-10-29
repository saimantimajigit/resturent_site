import {NextResponse} from 'next/server';
import {z} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {managementAudit} from '@/server/admin-analytics';

export async function GET(request:Request){
  try{const context=await managerContext(),url=new URL(request.url),page=z.coerce.number().int().min(1).max(10000).parse(url.searchParams.get('page')||'1');return NextResponse.json({data:await managementAudit(context.restaurantId,page)},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return adminError(error,'Audit history is temporarily unavailable.')}
}
