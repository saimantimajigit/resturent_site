import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({menuId:z.uuid(),name:z.string().trim().min(2).max(80),sortOrder:z.number().int().min(0).max(1000).default(0)});
export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{const context=await managerContext(),body=input.parse(await request.json());return await db.$transaction(async tx=>{const menu=await tx.menu.findFirst({where:{id:body.menuId,restaurantId:context.restaurantId},select:{id:true}});if(!menu)throw new Error('ADMIN_NOT_FOUND:Menu not found.');const category=await tx.menuCategory.create({data:{menuId:menu.id,name:body.name,sortOrder:body.sortOrder}});await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'MENU_CATEGORY_CREATED',resource:'MenuCategory',resourceId:category.id,after:{name:category.name,menuId:menu.id,sortOrder:category.sortOrder},requestId:randomUUID()}});return NextResponse.json({data:category},{status:201})},{isolationLevel:'Serializable'})}
  catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not create the menu category.')}
}
