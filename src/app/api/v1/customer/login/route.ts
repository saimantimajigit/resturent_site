import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {compare} from 'bcryptjs';
import {createHash,randomBytes} from 'node:crypto';
import {db} from '@/server/db';
import {allowLoginAttempt,clearLoginFailures,rateLimitedResponse} from '@/server/auth-rate-limit';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({email:z.email().transform(value=>value.trim().toLowerCase()),password:z.string().min(1)});

export async function POST(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 try{
  const body=input.parse(await request.json());
  const limit=await allowLoginAttempt(request,body.email);if(!limit.allowed)return rateLimitedResponse();
  const user=await db.user.findUnique({where:{email:body.email}});
  if(!user||user.status!=='ACTIVE'||!user.passwordHash||!await compare(body.password,user.passwordHash)||!await db.guestProfile.findUnique({where:{userId:user.id}}))return NextResponse.json({error:{message:'Email or password is incorrect.'}},{status:401});
  await clearLoginFailures(limit.emailKey);
  const token=randomBytes(32).toString('hex');
  await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+8*3600_000)}});
  const response=NextResponse.json({data:{name:user.name}});
  response.cookies.set('savore_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*3600});
  return response;
 }catch(error){if(error instanceof ZodError)return NextResponse.json({error:{message:'Enter a valid email and password.'}},{status:400});console.error('customer login failed',error);return NextResponse.json({error:{message:'Sign in is unavailable right now.'}},{status:500});}
}
