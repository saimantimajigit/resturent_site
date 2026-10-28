import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {rejectCrossOrigin} from '@/server/request-security';
import {claimQrGuestAccess,QR_GUEST_COOKIE,QrDiningError} from '@/server/qr-dining';
import {rateLimitedResponse} from '@/server/auth-rate-limit';

const input=z.object({code:z.string().regex(/^[a-f0-9]{64}$/i)}).strict();
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const body=input.parse(await request.json());const access=await claimQrGuestAccess({request,code:body.code});
    const expiresIn=Math.max(1,Math.floor((access.expiresAt.getTime()-Date.now())/1000));
    const response=NextResponse.json({data:{table:access.table,expiresAt:access.expiresAt.toISOString()}},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(QR_GUEST_COOKIE,access.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/v1/qr',maxAge:expiresIn});
    return response;
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Invalid table QR code.'}},{status:400});
    if(error instanceof QrDiningError){if(error.status===429)return rateLimitedResponse();return NextResponse.json({error:{code:error.code,message:error.message}},{status:error.status});}
    console.error('QR guest claim failed',error);return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Could not start table ordering.'}},{status:500});
  }
}
