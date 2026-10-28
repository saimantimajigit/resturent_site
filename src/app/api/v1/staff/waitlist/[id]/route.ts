import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {staffContext} from '@/server/staff-context';
import {FloorOperationError,transitionWaitlist} from '@/server/floor-operations';

const input=z.object({status:z.enum(['NOTIFIED','SEATED','CANCELLED','EXPIRED']),tableId:z.uuid().optional(),waiterMembershipId:z.uuid().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await staffContext(['HOST','MANAGER','OWNER']);const {id}=await params;const body=input.parse(await request.json());
    return NextResponse.json({data:await transitionWaitlist({restaurantId:context.restaurantId,entryId:id,actorUserId:context.user.id,target:body.status,tableId:body.tableId,waiterMembershipId:body.waiterMembershipId})});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Host access required.'}},{status:403});
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid waitlist action.'}},{status:400});
    if(error instanceof FloorOperationError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.code==='WAITLIST_NOT_FOUND'?404:409});
    console.error('waitlist action failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not update this waitlist entry.'}},{status:500});
  }
}
