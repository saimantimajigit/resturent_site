import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import AccountNavigation from '@/components/account-navigation';
export const metadata:Metadata={title:'Reservation details'};
export const dynamic='force-dynamic';
export default async function ReservationDetails({params}:{params:Promise<{id:string}>}){
 const customer=await currentCustomer();if(!customer)redirect('/login');
 const {id}=await params;
 const reservation=await db.reservation.findFirst({where:{id,guestProfileId:customer.guest.id,restaurantId:process.env.RESTAURANT_ID}});
 if(!reservation)notFound();
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Your visit</p><h1>Reservation details</h1><p>Reference {reservation.reference}</p></div></section><main className="content-width"><div className="account-layout"><AccountNavigation active="/account/reservations"/><article className="account-card reservation-detail"><p className="eyebrow">Looking forward to welcoming you</p><h2>{reservation.startsAt.toLocaleDateString('en-IN',{dateStyle:'full',timeZone:'Asia/Kolkata'})}</h2><div className="summary-grid"><div className="summary-item"><span>Time</span><strong>{reservation.startsAt.toLocaleTimeString('en-IN',{timeStyle:'short',timeZone:'Asia/Kolkata'})}</strong></div><div className="summary-item"><span>Guests</span><strong>{reservation.partySize}</strong></div><div className="summary-item"><span>Status</span><strong>{reservation.status.toLowerCase().replaceAll('_',' ')}</strong></div></div><p><span className="muted">Reference</span><br/><strong>{reservation.reference}</strong></p>{reservation.notes?<p><span className="muted">Your note</span><br/>{reservation.notes}</p>:null}<p className="muted">For changes to this reservation, please contact our team directly. Cancellation and modification are handled by the restaurant.</p><a className="link-arrow" href="/contact">Contact SAVORÉ <span>→</span></a></article></div></main></>;
}
