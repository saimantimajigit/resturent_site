import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {hash} from 'bcryptjs';
import {createHash,randomBytes} from 'node:crypto';
import {db} from '@/server/db';
import {allowRegistrationAttempt,rateLimitedResponse} from '@/server/auth-rate-limit';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({name:z.string().trim().min(2).max(100),email:z.email().max(254).transform(value=>value.trim().toLowerCase()),phone:z.string().trim().max(30).optional(),password:z.string().min(12).max(200)});
export async function POST(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 try{
  const body=input.parse(await request.json());
  if(!await allowRegistrationAttempt(request))return rateLimitedResponse();
  const passwordHash=await hash(body.password,12);
  const token=randomBytes(32).toString('hex');
  const user=await db.$transaction(async tx=>{
   const created=await tx.user.create({data:{email:body.email,name:body.name,passwordHash}});
   await tx.guestProfile.create({data:{userId:created.id,name:body.name,email:body.email,phone:body.phone||null}});
   await tx.session.create({data:{userId:created.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+8*3600_000)}});
   return created;
  });
  const response=NextResponse.json({data:{name:user.name}},{status:201});
  response.cookies.set('savore_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*3600});
  return response;
 }catch(error){
  if(error instanceof ZodError)return NextResponse.json({error:{message:'Please check the details and use a password of at least 12 characters.'}},{status:400});
  if(error&&typeof error==='object'&&'code'in error&&error.code==='P2002')return NextResponse.json({error:{message:'An account already exists for this email.'}},{status:409});
  console.error('customer registration failed',error);return NextResponse.json({error:{message:'Account could not be created right now.'}},{status:500});
 }
}
