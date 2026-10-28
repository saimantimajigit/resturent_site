import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {db} from '@/server/db';
import {currentCustomer} from '@/server/customer';
import AccountNavigation from '@/components/account-navigation';
export const metadata:Metadata={title:'My reservations'};
export const dynamic='force-dynamic';
export default async function MyReservations(){
 const customer=await currentCustomer();if(!customer)redirect('/login');
 const rows=await db.reservation.findMany({where:{guestProfileId:customer.guest.id,restaurantId:process.env.RESTAURANT_ID},orderBy:{startsAt:'desc'},take:50});
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Your visits</p><h1>My reservations</h1><p>Every detail of an evening, all in one place.</p></div></section><main className="content-width"><div className="account-layout"><AccountNavigation active="/account/reservations"/><div><h2>Reservation history</h2>{rows.length?<div className="account-card">{rows.map(row=><div className="reservation-row" key={row.id}><div><strong>{row.startsAt.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})}</strong><p className="muted">{row.partySize} guests · {row.reference}</p></div><div><span className="status-pill">{row.status.toLowerCase().replaceAll('_',' ')}</span><br/><a className="link-arrow" href={`/account/reservations/${row.id}`}>Details <span>→</span></a></div></div>)}</div>:<div className="empty-state"><h3>No reservations yet.</h3><p>Your next memorable evening is only a date away.</p><a className="button button-forest" href="/reservations">Reserve a table</a></div>}</div></div></main></>;
}
