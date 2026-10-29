import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {db} from '@/server/db';
import {currentCustomer} from '@/server/customer';
import AccountNavigation from '@/components/account-navigation';
import FavoriteButton from '@/components/favorite-button';
import ResilientImage from '@/components/resilient-image';
export const metadata:Metadata={title:'My favorites'};
export const dynamic='force-dynamic';
export default async function Favorites(){
 const customer=await currentCustomer();if(!customer)redirect('/login');
 const preferences=await db.guestPreference.findMany({where:{guestProfileId:customer.guest.id,kind:'FAVORITE_MENU_ITEM'},select:{value:true}});
 const ids=preferences.map(item=>item.value);
 const dishes=ids.length?await db.menuItem.findMany({where:{id:{in:ids},status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},include:{menuCategoryRef:true}}):[];
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Kept close</p><h1>My favorites</h1><p>Little things you’ve loved, saved for another evening.</p></div></section><main className="content-width"><div className="account-layout"><AccountNavigation active="/account/favorites"/><div>{dishes.length?<div className="dish-grid">{dishes.map(dish=><article className="dish-card" key={dish.id}><div className="dish-image"><ResilientImage className="favorite-dish-image" src={dish.imageUrl||''} alt={`A plated serving of ${dish.name}`}/></div><div className="dish-card-body"><span className="dish-category">{dish.menuCategoryRef.name}</span><h2 className="dish-title"><a href={`/menu/${dish.slug}`}>{dish.name}</a></h2><FavoriteButton dishId={dish.id} initiallySaved/></div></article>)}</div>:<div className="empty-state"><h2>A little room for something lovely.</h2><p>Save a dish from our menu and it will be waiting here.</p><a className="button button-forest" href="/menu">Explore the menu</a></div>}</div></div></main></>;
}
