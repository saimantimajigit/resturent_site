import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({name:z.string().trim().min(2).max(80).optional(),sortOrder:z.number().int().min(0).max(1000).optional()}).refine(value=>Object.keys(value).length>0);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{const context=await managerContext(),{id:rawId}=await params,id=z.uuid().parse(rawId),body=input.parse(await request.json());return await db.$transaction(async tx=>{const before=await tx.menuCategory.findFirst({where:{id,menuRef:{restaurantId:context.restaurantId}},select:{id:true,name:true,sortOrder:true}});if(!before)throw new Error('ADMIN_NOT_FOUND:Menu category not found.');const category=await tx.menuCategory.update({where:{id},data:body});await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'MENU_CATEGORY_UPDATED',resource:'MenuCategory',resourceId:id,before:{name:before.name,sortOrder:before.sortOrder},after:{name:category.name,sortOrder:category.sortOrder},requestId:randomUUID()}});return NextResponse.json({data:category})},{isolationLevel:'Serializable'})}
  catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not update the menu category.')}
}
