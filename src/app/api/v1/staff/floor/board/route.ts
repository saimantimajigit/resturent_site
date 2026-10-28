import {NextResponse} from 'next/server';
import {FloorOperationError,getFloorBoard} from '@/server/floor-operations';
import {staffContext,hasOperationsAccess} from '@/server/staff-context';
import {AuthenticationError,AuthorizationError} from '@/server/session';

export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const context=await staffContext(['HOST','WAITER','MANAGER','OWNER']);
    const waiterScope=context.roles.includes('WAITER')&&!hasOperationsAccess(context.roles)?context.membership.id:undefined;
    const url=new URL(request.url);
    return NextResponse.json({data:await getFloorBoard(context.restaurantId,waiterScope,url.searchParams.get('date')??undefined,url.searchParams.get('endDate')??undefined)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Floor operations access required.'}},{status:403});
    if(error instanceof FloorOperationError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:400});
    console.error('floor board load failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not load the floor board.'}},{status:500});
  }
}
