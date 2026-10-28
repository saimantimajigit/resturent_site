import 'server-only';
import {authorizeRole} from './session';
import {db} from './db';
import {AuthorizationError} from './session';

export async function staffContext(allowed:string[]){
  const user=await authorizeRole(allowed);
  const membership=await db.staffMembership.findFirst({where:{userId:user.id,restaurantId:process.env.RESTAURANT_ID,status:'ACTIVE'},include:{StaffRole_staffMembershipId:{include:{roleRef:true}}}});
  if(!membership)throw new AuthorizationError();
  const roles=membership.StaffRole_staffMembershipId.map(item=>item.roleRef.code);
  return {user,membership,roles,restaurantId:process.env.RESTAURANT_ID!};
}

export function hasOperationsAccess(roles:string[]){return roles.some(role=>role==='HOST'||role==='MANAGER'||role==='OWNER')}
