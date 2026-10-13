import 'server-only';import {cookies} from 'next/headers';import {createHash} from 'node:crypto';import {redirect} from 'next/navigation';import {db} from './db';
export async function currentUser(){const token=(await cookies()).get('savore_session')?.value;if(!token)return null;const hash=createHash('sha256').update(token).digest('hex');const session=await db.session.findUnique({where:{tokenHash:hash}});if(!session||session.expiresAt<new Date()||session.revokedAt)return null;const user=await db.user.findUnique({where:{id:session.userId}});return user?.status==='ACTIVE'?user:null}
export class AuthenticationError extends Error { constructor(){super('UNAUTHENTICATED')} }
export class AuthorizationError extends Error { constructor(){super('FORBIDDEN')} }
export async function authorizeRole(codes:string[]){
 const user=await currentUser();
 if(!user)throw new AuthenticationError();
 const membership=await db.staffMembership.findFirst({where:{userId:user.id,status:'ACTIVE',restaurantId:process.env.RESTAURANT_ID},include:{StaffRole_staffMembershipId:{include:{roleRef:true}}}});
 if(!membership||!membership.StaffRole_staffMembershipId.some(x=>codes.includes(x.roleRef.code)))throw new AuthorizationError();
 return user;
}
export async function requireRole(codes:string[]){
 try{return await authorizeRole(codes)}
 catch(e){if(e instanceof AuthenticationError||e instanceof AuthorizationError)redirect('/demo');throw e}
}
