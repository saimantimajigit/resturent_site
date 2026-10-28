import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {db} from '@/server/db';
import {currentCustomer} from '@/server/customer';
import AccountNavigation from '@/components/account-navigation';
export const metadata:Metadata={title:'Your account'};
export const dynamic='force-dynamic';

export default async function Account(){
 const customer=await currentCustomer();if(!customer)redirect('/login');
 const now=new Date();
 const restaurantId=process.env.RESTAURANT_ID;
 const [upcoming,historyCount,favorites,recentOrders]=await Promise.all([
  db.reservation.findFirst({where:{guestProfileId:customer.guest.id,restaurantId,startsAt:{gte:now},status:{in:['CONFIRMED','ARRIVED','SEATED']}},orderBy:{startsAt:'asc'}}),
  db.reservation.count({where:{guestProfileId:customer.guest.id,restaurantId,OR:[{startsAt:{lt:now}},{status:{in:['COMPLETED','CANCELLED','NO_SHOW']}}]}}),
  db.guestPreference.count({where:{guestProfileId:customer.guest.id,kind:'FAVORITE_MENU_ITEM'}}),
  db.order.findMany({where:{guestProfileId:customer.guest.id,restaurantId},select:{id:true,reference:true,status:true,type:true,createdAt:true,totalMinor:true},orderBy:{createdAt:'desc'},take:3})
 ]);
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Your SAVORÉ table</p><h1>Good to see you,<br/>{customer.guest.name.split(' ')[0]}.</h1><p>A place for your next evening, and the ones you’ve already enjoyed.</p></div></section><main className="content-width"><div className="account-layout"><AccountNavigation active="/account"/><div><section className="account-card"><p className="eyebrow">Next at SAVORÉ</p><h2>{upcoming?'Your table is waiting.':'An evening to look forward to.'}</h2>{upcoming?<><p>{upcoming.startsAt.toLocaleString('en-IN',{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Kolkata'})}</p><p>{upcoming.partySize} guests · Reference {upcoming.reference}</p><a className="link-arrow" href={`/account/reservations/${upcoming.id}`}>View reservation <span>→</span></a></>:<><p className="muted">There’s nothing on the calendar just yet. We’ll save you a place.</p><a className="button button-forest" href="/reservations">Find a table</a></>}</section><div className="account-stats"><a className="account-card stat-card" href="/account/reservations"><strong>{historyCount}</strong><span>Past reservations</span></a><a className="account-card stat-card" href="/account/favorites"><strong>{favorites}</strong><span>Saved dishes</span></a><a className="account-card stat-card" href="/account/profile"><strong>↗</strong><span>Dining preferences</span></a></div>{recentOrders.length?<section className="account-card"><p className="eyebrow">Order activity</p><h3>Your recent orders</h3>{recentOrders.map(order=><div className="reservation-row" key={order.id}><div><strong>{order.reference}</strong><p className="muted">{order.createdAt.toLocaleDateString('en-IN',{dateStyle:'medium',timeZone:'Asia/Kolkata'})} · {order.type.toLowerCase().replaceAll('_',' ')}</p></div><span className="status-pill">{order.status.toLowerCase()}</span></div>)}</section>:null}<section className="account-card"><p className="eyebrow">A note from us</p><h3>Good evenings begin with good company.</h3><p>Explore a seasonal plate, linger over the tasting menu, or let us know what would make your next visit feel like yours.</p><a href="/experiences/chef-tasting" className="link-arrow">Discover the tasting experience <span>→</span></a></section></div></div></main></>;
}
