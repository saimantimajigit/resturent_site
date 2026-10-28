import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import AccountNavigation from '@/components/account-navigation';
import ProfileForm from '@/components/profile-form';
export const metadata:Metadata={title:'Profile & preferences'};
export const dynamic='force-dynamic';
export default async function Profile(){
 const customer=await currentCustomer();if(!customer)redirect('/login');
 const preferences=await db.guestPreference.findMany({where:{guestProfileId:customer.guest.id,kind:'DIETARY'},select:{value:true}});
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Your details</p><h1>Profile & preferences</h1><p>A few details help us make your evening feel more like yours.</p></div></section><main className="content-width"><div className="account-layout"><AccountNavigation active="/account/profile"/><section className="account-card"><p><span className="muted">Email</span><br/><strong>{customer.user.email}</strong></p><ProfileForm name={customer.guest.name} phone={customer.guest.phone||''} preferences={preferences.map(item=>item.value)}/></section></div></main></>;
}
