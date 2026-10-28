import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {staffContext,hasOperationsAccess} from '@/server/staff-context';
import {FloorOperationError,setAssistanceStatus} from '@/server/floor-operations';

const input=z.object({status:z.enum(['ACKNOWLEDGED','COMPLETED','CANCELLED'])});
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await staffContext(['WAITER','HOST','MANAGER','OWNER']);const {id}=await params;const body=input.parse(await request.json());
    const waiterScope=context.roles.includes('WAITER')&&!hasOperationsAccess(context.roles)?context.membership.id:undefined;
    return NextResponse.json({data:await setAssistanceStatus({restaurantId:context.restaurantId,requestId:id,actorUserId:context.user.id,target:body.status,waiterMembershipId:waiterScope})});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Waiter access required.'}},{status:403});
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid service request action.'}},{status:400});
    if(error instanceof FloorOperationError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.code==='ASSISTANCE_NOT_FOUND'?404:409});
    console.error('service request update failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not update this service request.'}},{status:500});
  }
}
