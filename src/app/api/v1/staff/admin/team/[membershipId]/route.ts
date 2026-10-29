import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const role=z.enum(['HOST','WAITER','CHEF','MANAGER','OWNER']);
const input=z.object({status:z.enum(['ACTIVE','SUSPENDED']).optional(),roleCodes:z.array(role).min(1).max(4).optional()}).refine(value=>Object.keys(value).length>0);
export async function PATCH(request:Request,{params}:{params:Promise<{membershipId:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await managerContext(),{membershipId:rawId}=await params,membershipId=z.uuid().parse(rawId),body=input.parse(await request.json()),owner=context.roles.includes('OWNER');
    const result=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${context.restaurantId}::uuid FOR UPDATE`;
      const before=await tx.staffMembership.findFirst({where:{id:membershipId,restaurantId:context.restaurantId},include:{userRef:{select:{id:true,status:true}},StaffRole_staffMembershipId:{include:{roleRef:{select:{code:true,id:true}}}}}});
      if(!before)throw new Error('ADMIN_NOT_FOUND:Staff membership not found.');
      const beforeRoles=before.StaffRole_staffMembershipId.map(link=>link.roleRef.code),targetPrivileged=beforeRoles.some(code=>code==='MANAGER'||code==='OWNER');
      if(!owner&&(targetPrivileged||body.roleCodes?.some(code=>code==='MANAGER'||code==='OWNER')))throw new Error('ADMIN_CONFLICT:Only an owner may manage management-role memberships.');
      if(before.userId===context.user.id&&body.status==='SUSPENDED')throw new Error('ADMIN_CONFLICT:You cannot suspend your own active membership.');
      const nextRoles=body.roleCodes?[...new Set(body.roleCodes)]:beforeRoles;
      if(before.userId===context.user.id&&beforeRoles.includes('OWNER')&&!nextRoles.includes('OWNER'))throw new Error('ADMIN_CONFLICT:An owner cannot remove their own owner role.');
      const finalStatus=body.status??before.status;
      if(beforeRoles.includes('OWNER')&&(finalStatus!=='ACTIVE'||!nextRoles.includes('OWNER'))){
        const otherOwners=await tx.staffMembership.count({where:{restaurantId:context.restaurantId,status:'ACTIVE',id:{not:membershipId},StaffRole_staffMembershipId:{some:{roleRef:{code:'OWNER'}}}}});
        if(otherOwners===0)throw new Error('ADMIN_CONFLICT:The restaurant must retain at least one active owner.');
      }
      if(body.roleCodes){
        await tx.staffRole.deleteMany({where:{staffMembershipId:membershipId}});
        for(const code of nextRoles){const row=await tx.role.findUniqueOrThrow({where:{code},select:{id:true}});await tx.staffRole.create({data:{staffMembershipId:membershipId,roleId:row.id}})}
      }
      const membership=await tx.staffMembership.update({where:{id:membershipId},data:{status:finalStatus}});
      await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'STAFF_MEMBERSHIP_UPDATED',resource:'StaffMembership',resourceId:membershipId,before:{userId:before.userId,status:before.status,accountStatus:before.userRef.status,roles:beforeRoles},after:{userId:before.userId,status:membership.status,roles:nextRoles},requestId:randomUUID()}});
      return membership;
    },{isolationLevel:'Serializable',timeout:15000});
    return NextResponse.json({data:result});
  }catch(error){if(error instanceof ZodError)return adminError(error);if(error instanceof Error&&error.message.startsWith('ADMIN_CONFLICT:')&&error.message.includes('Only an owner'))return NextResponse.json({error:{code:'FORBIDDEN',message:error.message.slice(15)}},{status:403});return adminError(error,'Could not update staff access.')}
}
