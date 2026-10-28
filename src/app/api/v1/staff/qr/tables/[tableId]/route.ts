import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {AuthenticationError,AuthorizationError} from '@/server/session';
import {staffContext} from '@/server/staff-context';
import {activateTableQrSession,closeTableQrSession,QrDiningError,revokeTableQr,rotateTableQr} from '@/server/qr-dining';

const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('PROVISION_QR')}),
  z.object({action:z.literal('ROTATE_QR')}),
  z.object({action:z.literal('ACTIVATE_SESSION')}),
  z.object({action:z.literal('END_SESSION'),sessionId:z.uuid()}),
  z.object({action:z.literal('REVOKE_QR')})
]);

export async function POST(request:Request,{params}:{params:Promise<{tableId:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await staffContext(['HOST','MANAGER','OWNER']);const {tableId}=await params;const body=input.parse(await request.json());
    const data=body.action==='PROVISION_QR'||body.action==='ROTATE_QR'
      ?await rotateTableQr({restaurantId:context.restaurantId,tableId,actorUserId:context.user.id,rotate:body.action==='ROTATE_QR'})
      :body.action==='ACTIVATE_SESSION'
        ?await activateTableQrSession({restaurantId:context.restaurantId,tableId,actorUserId:context.user.id})
        :body.action==='END_SESSION'
          ?await closeTableQrSession({restaurantId:context.restaurantId,sessionId:body.sessionId,actorUserId:context.user.id})
          :await revokeTableQr({restaurantId:context.restaurantId,tableId,actorUserId:context.user.id});
    return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof AuthenticationError)return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Sign in required.'}},{status:401});
    if(error instanceof AuthorizationError)return NextResponse.json({error:{code:'FORBIDDEN',message:'Host access required.'}},{status:403});
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid QR table action.'}},{status:400});
    if(error instanceof QrDiningError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});
    console.error('QR table action failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not update QR access.'}},{status:500});
  }
}
