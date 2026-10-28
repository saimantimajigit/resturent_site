import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/server/db';
const uuid=z.uuid();
export async function GET(request:Request){
 const ids=[...new Set(new URL(request.url).searchParams.get('ids')?.split(',')??[])];
 if(!ids.length||ids.length>20||ids.some(id=>!uuid.safeParse(id).success))return NextResponse.json({error:{message:'Invalid cart items.'}},{status:400});
 const items=await db.menuItem.findMany({where:{id:{in:ids},status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},select:{id:true,name:true,MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1,select:{amountMinor:true,currency:true}},MenuAvailability_menuItemId:{select:{available:true}}}});
 return NextResponse.json({data:items.map(item=>({id:item.id,name:item.name,priceMinor:item.MenuItemPrice_menuItemId[0]?.amountMinor.toString()??null,currency:item.MenuItemPrice_menuItemId[0]?.currency??'INR',available:item.MenuAvailability_menuItemId[0]?.available??true}))},{headers:{'Cache-Control':'no-store'}});
}
