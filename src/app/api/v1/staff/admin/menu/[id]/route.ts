import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const input=z.object({categoryId:z.uuid().optional(),name:z.string().trim().min(2).max(100).optional(),description:z.string().trim().max(1000).nullable().optional(),priceMinor:z.string().regex(/^\d{1,9}$/).optional(),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']).optional(),vegetarian:z.boolean().optional(),dietaryLabels:z.array(z.string().trim().min(1).max(32)).max(12).optional(),allergenCodes:z.array(z.string().regex(/^[A-Z0-9_]{2,32}$/)).max(24).optional(),imageUrl:z.string().url().max(500).nullable().optional(),available:z.boolean().optional(),availabilityReason:z.string().trim().max(240).nullable().optional()}).refine(value=>Object.keys(value).length>0);
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await managerContext(),{id:rawId}=await params,id=z.uuid().parse(rawId),body=input.parse(await request.json());
    const updated=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "MenuItem" WHERE id=${id}::uuid FOR UPDATE`;
      const before=await tx.menuItem.findFirst({where:{id,menuCategoryRef:{menuRef:{restaurantId:context.restaurantId}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuItemAllergen_menuItemId:{include:{allergenRef:{select:{code:true}}}},MenuAvailability_menuItemId:true}});
      if(!before)throw new Error('ADMIN_NOT_FOUND:Menu item not found.');
      let categoryId=before.menuCategoryId;
      if(body.categoryId){const category=await tx.menuCategory.findFirst({where:{id:body.categoryId,menuRef:{restaurantId:context.restaurantId}},select:{id:true}});if(!category)throw new Error('ADMIN_NOT_FOUND:Menu category not found.');categoryId=category.id}
      let allergenIds:string[]|undefined,allergenCodes:string[]|undefined;
      if(body.allergenCodes){const links=await tx.allergen.findMany({where:{code:{in:body.allergenCodes}},select:{id:true,code:true}});if(links.length!==new Set(body.allergenCodes).size)throw new Error('ADMIN_CONFLICT:One or more allergen codes are invalid.');allergenIds=links.map(link=>link.id);allergenCodes=links.map(link=>link.code);await tx.menuItemAllergen.deleteMany({where:{menuItemId:id}});if(allergenIds.length)await tx.menuItemAllergen.createMany({data:allergenIds.map(allergenId=>({menuItemId:id,allergenId}))})}
      if(body.priceMinor!==undefined){const now=new Date();await tx.menuItemPrice.updateMany({where:{menuItemId:id,effectiveTo:null},data:{effectiveTo:now}});const restaurant=await tx.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{currency:true}});await tx.menuItemPrice.create({data:{menuItemId:id,amountMinor:BigInt(body.priceMinor),currency:restaurant.currency,effectiveFrom:now}})}
      if(body.available!==undefined)await tx.menuAvailability.upsert({where:{menuItemId:id},create:{menuItemId:id,available:body.available,reason:body.availabilityReason??null},update:{available:body.available,reason:body.availabilityReason??null}});
      const data={...(body.name!==undefined?{name:body.name}:{}),...(body.description!==undefined?{description:body.description}:{}),...(body.status!==undefined?{status:body.status}:{}),...(body.vegetarian!==undefined?{vegetarian:body.vegetarian}:{}),...(body.dietaryLabels!==undefined?{dietaryLabels:[...new Set(body.dietaryLabels)]}:{}),...(body.imageUrl!==undefined?{imageUrl:body.imageUrl}:{}),...(categoryId!==before.menuCategoryId?{menuCategoryId:categoryId}:{})};
      const item=await tx.menuItem.update({where:{id},data,include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuAvailability_menuItemId:true,MenuItemAllergen_menuItemId:{include:{allergenRef:{select:{code:true,name:true}}}}}});
      await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'MENU_ITEM_UPDATED',resource:'MenuItem',resourceId:id,before:{name:before.name,status:before.status,categoryId:before.menuCategoryId,priceMinor:before.MenuItemPrice_menuItemId[0]?.amountMinor.toString()??null,dietaryLabels:before.dietaryLabels,allergenCodes:before.MenuItemAllergen_menuItemId.map(a=>a.allergenRef.code),available:before.MenuAvailability_menuItemId[0]?.available??true},after:{name:item.name,status:item.status,categoryId:item.menuCategoryId,priceMinor:body.priceMinor??before.MenuItemPrice_menuItemId[0]?.amountMinor.toString()??null,dietaryLabels:item.dietaryLabels,allergenCodes:allergenCodes??before.MenuItemAllergen_menuItemId.map(a=>a.allergenRef.code),available:body.available??before.MenuAvailability_menuItemId[0]?.available??true},requestId:randomUUID()}});
      return item;
    },{isolationLevel:'Serializable',timeout:15000});
    const data={...updated,MenuItemPrice_menuItemId:updated.MenuItemPrice_menuItemId.map(price=>({...price,amountMinor:price.amountMinor.toString()}))};
    return NextResponse.json({data});
  }catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not update the menu item.')}
}
