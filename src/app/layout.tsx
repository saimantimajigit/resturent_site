import type { Metadata } from 'next';
import './globals.css';
import SiteHeader from '@/components/site-header';
import SiteFooter from '@/components/site-footer';

export const metadata:Metadata={
 metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000'),
 title:{default:'SAVORÉ — An evening beyond the ordinary',template:'%s | SAVORÉ'},
 description:'A thoughtful fine dining experience, shaped by the season and served with care.',
 openGraph:{title:'SAVORÉ — An evening beyond the ordinary',description:'A thoughtful fine dining experience, shaped by the season and served with care.',type:'website',locale:'en_IN',siteName:'SAVORÉ',images:[{url:'/images/savore-dining-room.png',width:1536,height:1024,alt:'Warm candlelight in the SAVORÉ dining room'}]},
};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader/><div id="main-content">{children}</div><SiteFooter/></body></html>;
}
