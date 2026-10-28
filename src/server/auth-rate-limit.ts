import {createHash} from 'node:crypto';
import {db} from './db';

const WINDOW_MINUTES=15;
const EMAIL_LIMIT=5;
const IP_LIMIT=30;

function digest(value:string){return createHash('sha256').update(value).digest('hex')}

function address(request:Request){
 return request.headers.get('x-real-ip')?.trim()||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
}

export function loginRateLimitKeys(request:Request,email:string){
 return {emailKey:digest(`login:email:${email.trim().toLowerCase()}`),ipKey:digest(`login:ip:${address(request)}`)};
}

async function consume(key:string,limit:number){
 const rows=await db.$queryRaw<Array<{attempts:number}>>`
  INSERT INTO "AuthRateLimit" ("key","windowStartedAt","attempts","updatedAt")
  VALUES (${key},NOW(),1,NOW())
  ON CONFLICT ("key") DO UPDATE SET
   "attempts"=CASE WHEN "AuthRateLimit"."windowStartedAt"<=NOW()-(${WINDOW_MINUTES} * INTERVAL '1 minute') THEN 1 ELSE "AuthRateLimit"."attempts"+1 END,
   "windowStartedAt"=CASE WHEN "AuthRateLimit"."windowStartedAt"<=NOW()-(${WINDOW_MINUTES} * INTERVAL '1 minute') THEN NOW() ELSE "AuthRateLimit"."windowStartedAt" END,
   "updatedAt"=NOW()
  RETURNING "attempts"
 `;
 return rows[0]?.attempts<=limit;
}

export async function allowLoginAttempt(request:Request,email:string){
 const keys=loginRateLimitKeys(request,email);
 const [emailAllowed,ipAllowed]=await Promise.all([consume(keys.emailKey,EMAIL_LIMIT),consume(keys.ipKey,IP_LIMIT)]);
 if(Math.random()<0.01)await db.authRateLimit.deleteMany({where:{updatedAt:{lt:new Date(Date.now()-24*60*60_000)}}});
 return {allowed:emailAllowed&&ipAllowed,emailKey:keys.emailKey};
}

export async function clearLoginFailures(emailKey:string){
 await db.authRateLimit.deleteMany({where:{key:emailKey}});
}

export async function allowRegistrationAttempt(request:Request){
 const key=digest(`register:ip:${address(request)}`);
 return consume(key,5);
}

export function rateLimitedResponse(){
 return Response.json({error:{code:'RATE_LIMITED',message:'Too many attempts. Try again in 15 minutes.'}},{status:429,headers:{'Retry-After':String(WINDOW_MINUTES*60)}});
}
