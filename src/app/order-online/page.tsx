import {db} from '@/server/db';
import OrderMenu from '@/components/order-menu';
import type {MenuDish} from '@/components/menu-browser';
export const dynamic='force-dynamic';
export default async function OrderOnline(){
 const restaurantId=process.env.RESTAURANT_ID!;
 const rows=await db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{menuCategoryRef:true,MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuAvailability_menuItemId:true,MenuItemAllergen_menuItemId:{include:{allergenRef:true}}},orderBy:{name:'asc'},take:100});
 const dishes:MenuDish[]=rows.map(item=>({id:item.id,slug:item.slug,name:item.name,description:item.description,category:item.menuCategoryRef.name,price:item.MenuItemPrice_menuItemId[0]?Number(item.MenuItemPrice_menuItemId[0].amountMinor):null,currency:item.MenuItemPrice_menuItemId[0]?.currency??'INR',vegetarian:item.vegetarian,available:item.MenuAvailability_menuItemId[0]?.available??true,allergens:item.MenuItemAllergen_menuItemId.map(link=>link.allergenRef.name),image:item.imageUrl}));
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">At your pace</p><h1>Order online</h1><p>Choose a few things from our seasonal kitchen. Payment is simulated for this demonstration.</p></div></section><main className="content-width"><OrderMenu dishes={dishes}/></main></>;
}
