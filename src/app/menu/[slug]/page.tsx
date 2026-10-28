import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {db} from '@/server/db';
import {currentCustomer} from '@/server/customer';
import FavoriteButton from '@/components/favorite-button';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
 const {slug}=await params;
 try{
  const dish=await db.menuItem.findFirst({where:{slug,status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},select:{name:true,description:true}});
  return {title:dish?.name||'From the menu',description:dish?.description||'Discover a seasonal plate from the SAVORÉ kitchen.'};
 }catch(error){if(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001'))return {title:'From the menu',description:'Discover a seasonal plate from the SAVORÉ kitchen.'};throw error;}
}

export default async function DishDetails({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 try{
  const restaurantId=process.env.RESTAURANT_ID;
  const dish=await db.menuItem.findFirst({where:{slug,status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{menuCategoryRef:true,MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuItemAllergen_menuItemId:{include:{allergenRef:true}},MenuAvailability_menuItemId:true}});
  if(!dish)notFound();
  const [related,customer]=await Promise.all([
   db.menuItem.findMany({where:{id:{not:dish.id},status:'PUBLISHED',menuCategoryId:dish.menuCategoryId},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1}},take:3}),
   currentCustomer()
  ]);
  const favorite=customer?await db.guestPreference.findFirst({where:{guestProfileId:customer.guest.id,kind:'FAVORITE_MENU_ITEM',value:dish.id}}):null;
  const price=dish.MenuItemPrice_menuItemId[0];
  return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">{dish.menuCategoryRef.name}</p><h1>{dish.name}</h1><p>{dish.description}</p></div></section><main className="content-width"><div className="dish-detail-grid"><img className="dish-detail-image" src={dish.imageUrl||'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1400&q=90'} alt={`${dish.name}, prepared at SAVORÉ`}/><article className="dish-detail-copy"><p className="eyebrow">From our seasonal menu</p><h2>{dish.name}</h2><p>{dish.description||'A considered plate, made with the best of the season.'}</p><p className="detail-price">{price?`₹${(Number(price.amountMinor)/100).toLocaleString('en-IN',{minimumFractionDigits:2})}`:'Price on request'} <span>{price?.currency||'INR'}</span></p><div className="dietary-badges">{dish.vegetarian?<span className="badge">Vegetarian</span>:null}{dish.MenuAvailability_menuItemId[0]?.available===false?<span className="badge unavailable">Currently unavailable</span>:<span className="badge">Available today</span>}</div><div className="detail-section"><h3>A note from the kitchen</h3><p>{dish.description||'Prepared with seasonal ingredients and served at its best.'}</p></div><div className="detail-section"><h3>Allergen information</h3>{dish.MenuItemAllergen_menuItemId.length?<p className="allergen-list">Contains {dish.MenuItemAllergen_menuItemId.map(item=>item.allergenRef.name).join(', ')}.</p>:<p className="allergen-list">No allergens have been listed. Please speak with our team about any dietary requirements.</p>}</div><FavoriteButton dishId={dish.id} initiallySaved={Boolean(favorite)}/><a className="button button-forest" href="/reservations">Reserve a table</a></article></div>{related.length?<section className="related-dishes"><p className="eyebrow">More from the menu</p><h2>Another plate to discover.</h2><div className="related-grid">{related.map(item=><article className="account-card" key={item.id}><h3><a href={`/menu/${item.slug}`}>{item.name}</a></h3><p className="muted">{item.MenuItemPrice_menuItemId[0]?`₹${(Number(item.MenuItemPrice_menuItemId[0].amountMinor)/100).toLocaleString('en-IN',{minimumFractionDigits:2})}`:'Price on request'}</p></article>)}</div></section>:null}</main></>;
 }catch(error){
  if(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001'))return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">The kitchen, in season</p><h1>Dish details</h1></div></section><main className="content-width"><div className="error-state" role="status"><h2>Dish details are temporarily unavailable.</h2><p>Our menu service is taking a moment. Please try again shortly.</p><a className="button button-forest" href="/menu">Return to the menu</a></div></main></>;
  throw error;
 }
}
