import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {staffContext} from '@/server/staff-context';
import {createWalkIn,FloorOperationError} from '@/server/floor-operations';

const input=z.object({name:z.string().trim().min(2).max(100),partySize:z.number().int().min(1).max(12),email:z.email().optional().or(z.literal('')),phone:z.string().trim().max(40).optional(),notes:z.string().trim().max(500).optional(),waiterMembershipId:z.uuid().optional()});
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await staffContext(['HOST','MANAGER','OWNER']);const body=input.parse(await request.json());
    const result=await createWalkIn(body,context.restaurantId,context.user.id);
    return NextResponse.json({data:result},{status:201});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Host access required.'}},{status:403});
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Check the walk-in guest details.'}},{status:400});
    if(error instanceof FloorOperationError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.code==='TABLE_UNAVAILABLE'?409:400});
    console.error('walk-in creation failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not register this walk-in.'}},{status:500});
  }
}
