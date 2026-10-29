import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const role=z.enum(['HOST','WAITER','CHEF','MANAGER','OWNER']);
const createInput=z.object({email:z.email().trim().toLowerCase(),roleCodes:z.array(role).min(1).max(4)});
export async function GET(){
  try{const context=await managerContext(),members=await db.staffMembership.findMany({where:{restaurantId:context.restaurantId},include:{userRef:{select:{id:true,name:true,email:true,status:true,createdAt:true}},StaffRole_staffMembershipId:{include:{roleRef:{select:{code:true,name:true}}}}},orderBy:[{status:'asc'},{createdAt:'asc'}]});return NextResponse.json({data:{members:members.map(member=>({id:member.id,userId:member.userId,name:member.userRef.name,email:member.userRef.email,accountStatus:member.userRef.status,membershipStatus:member.status,roles:member.StaffRole_staffMembershipId.map(link=>link.roleRef.code),createdAt:member.createdAt})),canManageManagers:context.roles.includes('OWNER')}},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return adminError(error,'Staff list is temporarily unavailable.')}
}
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await managerContext(),body=createInput.parse(await request.json()),owner=context.roles.includes('OWNER');
    if(!owner&&body.roleCodes.some(code=>code==='MANAGER'||code==='OWNER'))return NextResponse.json({error:{code:'FORBIDDEN',message:'Only an owner may assign management roles.'}},{status:403});
    const unique=[...new Set(body.roleCodes)];
    const created=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${context.restaurantId}::uuid FOR UPDATE`;
      const user=await tx.user.findFirst({where:{email:body.email,status:'ACTIVE'},select:{id:true}});
      if(!user)throw new Error('ADMIN_NOT_FOUND:An active SAVORÉ account with that email is required before assigning staff access.');
      const existing=await tx.staffMembership.findUnique({where:{userId_restaurantId:{userId:user.id,restaurantId:context.restaurantId}},select:{id:true}});
      if(existing)throw new Error('ADMIN_CONFLICT:This person already has a restaurant membership. Edit their existing membership.');
      const membership=await tx.staffMembership.create({data:{userId:user.id,restaurantId:context.restaurantId,status:'ACTIVE'}});
      for(const code of unique){const roleRow=await tx.role.findUniqueOrThrow({where:{code},select:{id:true}});await tx.staffRole.create({data:{staffMembershipId:membership.id,roleId:roleRow.id}})}
      await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'STAFF_MEMBERSHIP_CREATED',resource:'StaffMembership',resourceId:membership.id,after:{userId:user.id,status:'ACTIVE',roles:unique},requestId:randomUUID()}});
      return membership;
    },{isolationLevel:'Serializable'});
    return NextResponse.json({data:created},{status:201});
  }catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not assign restaurant staff access.')}
}
