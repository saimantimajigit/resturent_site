import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';

const itemInput=z.object({categoryId:z.uuid(),name:z.string().trim().min(2).max(100),description:z.string().trim().max(1000).nullable().optional(),priceMinor:z.string().regex(/^\d{1,9}$/),status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']).default('DRAFT'),vegetarian:z.boolean().default(false),dietaryLabels:z.array(z.string().trim().min(1).max(32)).max(12).default([]),allergenCodes:z.array(z.string().regex(/^[A-Z0-9_]{2,32}$/)).max(24).default([]),imageUrl:z.string().url().max(500).nullable().optional()});
const slugify=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)||'dish';

export async function GET(){
  try{
    const context=await managerContext();
    const [categories,allergens]=await Promise.all([
      db.menuCategory.findMany({where:{menuRef:{restaurantId:context.restaurantId}},include:{menuRef:{select:{id:true,name:true,published:true}},MenuItem_menuCategoryId:{orderBy:{name:'asc'},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuAvailability_menuItemId:true,MenuItemAllergen_menuItemId:{include:{allergenRef:{select:{code:true,name:true}}}}}}},orderBy:[{menuRef:{sortOrder:'asc'}},{sortOrder:'asc'},{name:'asc'}]}),
      db.allergen.findMany({orderBy:{name:'asc'},select:{code:true,name:true}})
    ]);
    const serialized=categories.map(category=>({...category,MenuItem_menuCategoryId:category.MenuItem_menuCategoryId.map(item=>({...item,MenuItemPrice_menuItemId:item.MenuItemPrice_menuItemId.map(price=>({...price,amountMinor:price.amountMinor.toString()}))}))}));
    return NextResponse.json({data:{categories:serialized,allergens}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return adminError(error,'Menu data is temporarily unavailable.')}
}

export async function POST(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await managerContext(),body=itemInput.parse(await request.json()),price=BigInt(body.priceMinor);
    const created=await db.$transaction(async tx=>{
      const category=await tx.menuCategory.findFirst({where:{id:body.categoryId,menuRef:{restaurantId:context.restaurantId}},select:{id:true}});
      if(!category)throw new Error('ADMIN_NOT_FOUND:Menu category not found.');
      const allergenCodes=[...new Set(body.allergenCodes)],validAllergens=await tx.allergen.findMany({where:{code:{in:allergenCodes}},select:{id:true,code:true}});
      if(validAllergens.length!==allergenCodes.length)throw new Error('ADMIN_CONFLICT:One or more allergen codes are invalid.');
      const slug=`${slugify(body.name)}-${randomUUID().slice(0,8)}`;
      const item=await tx.menuItem.create({data:{menuCategoryId:category.id,name:body.name,slug,description:body.description??null,status:body.status,vegetarian:body.vegetarian,dietaryLabels:[...new Set(body.dietaryLabels)],imageUrl:body.imageUrl??null,MenuItemPrice_menuItemId:{create:{amountMinor:price,currency:(await tx.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{currency:true}})).currency}},MenuItemAllergen_menuItemId:{create:validAllergens.map(allergen=>({allergenId:allergen.id}))}}});
      await tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:'MENU_ITEM_CREATED',resource:'MenuItem',resourceId:item.id,after:{name:item.name,status:item.status,categoryId:category.id,priceMinor:price.toString(),dietaryLabels:item.dietaryLabels,allergenCodes:validAllergens.map(a=>a.code)},requestId:randomUUID()}});
      return item;
    },{isolationLevel:'Serializable'});
    return NextResponse.json({data:created},{status:201});
  }catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not create the menu item.')}
}
