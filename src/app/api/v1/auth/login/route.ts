import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {db} from '@/server/db';
import {compare} from 'bcryptjs';
import {randomBytes,createHash} from 'node:crypto';
import {allowLoginAttempt,clearLoginFailures,rateLimitedResponse} from '@/server/auth-rate-limit';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({email:z.email().max(254).transform(value=>value.trim().toLowerCase()),password:z.string().min(1).max(200)});
const MAX_LOGIN_BODY_BYTES=8192;

async function readLoginForm(request:Request):Promise<URLSearchParams|null>{
  const mediaType=request.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
  if(mediaType!=='application/x-www-form-urlencoded'||!request.body)return null;
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_LOGIN_BODY_BYTES){await reader.cancel();return null;}
      chunks.push(value);
    }
    const body=new Uint8Array(size);
    let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    return new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(body));
  }catch{return null;}
  finally{reader.releaseLock();}
}

export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const contentLength=request.headers.get('content-length');
    if(contentLength!==null&&(!/^\d+$/.test(contentLength)||Number(contentLength)>MAX_LOGIN_BODY_BYTES))return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Enter a valid email and password.'}},{status:400});
    const form=await readLoginForm(request);
    if(!form||form.getAll('email').length!==1||form.getAll('password').length!==1)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Enter a valid email and password.'}},{status:400});
    const parsed=input.safeParse({email:form.get('email'),password:form.get('password')});
    if(!parsed.success)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Enter a valid email and password.'}},{status:400});
    const {email,password}=parsed.data;
    const limit=await allowLoginAttempt(request,email);if(!limit.allowed)return rateLimitedResponse();
    const user=await db.user.findUnique({where:{email}});
    if(!user?.passwordHash||user.status!=='ACTIVE'||!await compare(password,user.passwordHash))return NextResponse.json({error:{code:'UNAUTHENTICATED',message:'Invalid credentials'}},{status:401});
    await clearLoginFailures(limit.emailKey);
    const token=randomBytes(32).toString('hex');
    await db.session.create({data:{userId:user.id,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+8*3600_000)}});
    const response=NextResponse.redirect(new URL('/staff/host',request.url),303);
    response.cookies.set('savore_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:8*3600});
    return response;
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'Enter a valid email and password.'}},{status:400});
    console.error('staff login failed');
    return NextResponse.json({error:{code:'INTERNAL_ERROR',message:'Sign in is unavailable right now.'}},{status:500});
  }
}
