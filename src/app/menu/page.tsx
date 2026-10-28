import type {Metadata} from 'next';
import {db} from '@/server/db';
import MenuBrowser,{type MenuDish} from '@/components/menu-browser';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'The menu',description:'A seasonal menu of considered plates, prepared with care.'};

export default async function Menu(){
 try{
  const restaurantId=process.env.RESTAURANT_ID;
  if(!restaurantId)throw new Error('RESTAURANT_ID is not configured');
  const [rows,categories]=await Promise.all([
   db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{menuCategoryRef:true,MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuItemAllergen_menuItemId:{include:{allergenRef:true}},MenuAvailability_menuItemId:true},orderBy:{name:'asc'},take:100}),
   db.menuCategory.findMany({where:{menuRef:{restaurantId,published:true}},orderBy:{sortOrder:'asc'}})
  ]);
  const dishes:MenuDish[]=rows.map(item=>({id:item.id,slug:item.slug,name:item.name,description:item.description,category:item.menuCategoryRef.name,price:item.MenuItemPrice_menuItemId[0]?Number(item.MenuItemPrice_menuItemId[0].amountMinor):null,currency:item.MenuItemPrice_menuItemId[0]?.currency??'INR',vegetarian:item.vegetarian,available:item.MenuAvailability_menuItemId[0]?.available??true,allergens:item.MenuItemAllergen_menuItemId.map(link=>link.allergenRef.name),image:item.imageUrl}));
  return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">The kitchen, in season</p><h1>Our menu</h1><p>Thoughtful plates that follow the market, prepared for the pleasure of sharing a table.</p></div></section><main className="content-width"><MenuBrowser dishes={dishes} categories={categories.map(item=>({id:item.id,name:item.name}))}/></main></>;
 }catch(error){
  if(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001'))return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">The kitchen, in season</p><h1>Our menu</h1></div></section><main className="content-width"><div className="error-state" role="status"><h2>The menu is taking a moment.</h2><p>Our menu service is temporarily unavailable. Please try again shortly or call us for today’s selection.</p><a className="link-arrow" href="/contact">Contact the restaurant <span>→</span></a></div></main></>;
  throw error;
 }
}
