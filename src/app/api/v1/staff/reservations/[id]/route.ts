import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {staffContext} from '@/server/staff-context';
import {assignReservationTable,FloorOperationError,modifyReservation} from '@/server/floor-operations';
import {BookingRuleError} from '@/server/booking-policy';

const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('ASSIGN_TABLE'),tableId:z.uuid(),waiterMembershipId:z.uuid().nullable().optional()}),
  z.object({action:z.literal('MODIFY'),date:z.iso.date().optional(),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),partySize:z.number().int().min(1).max(12).optional(),notes:z.string().trim().max(500).nullable().optional()}).refine(value=>Object.keys(value).some(key=>key!=='action'),{message:'Provide at least one reservation change.'})
]);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await staffContext(['HOST','MANAGER','OWNER']);const {id}=await params;const body=input.parse(await request.json());
    const data=body.action==='ASSIGN_TABLE'
      ?await assignReservationTable({restaurantId:context.restaurantId,reservationId:id,tableId:body.tableId,waiterMembershipId:body.waiterMembershipId,actorUserId:context.user.id})
      :await modifyReservation({restaurantId:context.restaurantId,reservationId:id,actorUserId:context.user.id,edit:{date:body.date,time:body.time,partySize:body.partySize,notes:body.notes}});
    return NextResponse.json({data});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Host access required.'}},{status:403});
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Check the reservation changes.'}},{status:400});
    if(error instanceof FloorOperationError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.code==='TABLE_UNAVAILABLE'?409:error.code==='RESERVATION_NOT_FOUND'?404:409});
    if(error instanceof BookingRuleError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:400});
    console.error('reservation update failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not update this reservation.'}},{status:500});
  }
}
