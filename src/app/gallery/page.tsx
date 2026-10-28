import type {Metadata} from 'next';
import {db} from '@/server/db';
export const metadata:Metadata={title:'The room & the table',description:'A glimpse of the SAVORÉ dining room and the details around the table.'};
export const dynamic='force-dynamic';
const sampleImages=[
 {src:'/images/savore-dining-room.png',alt:'Candlelight across linen tables in the SAVORÉ demonstration dining room'},
 {src:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',alt:'A warmly lit restaurant dining room'},
 {src:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85',alt:'A fine dining table prepared for dinner'},
 {src:'https://images.unsplash.com/photo-1515003197210-e0cd7184f8b5?auto=format&fit=crop&w=1200&q=85',alt:'Seasonal ingredients arranged for the kitchen'},
 {src:'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=85',alt:'A seasonal fish dish served at the table'},
 {src:'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1200&q=85',alt:'A thoughtfully composed seasonal plate'},
];
export default async function Gallery(){
 let galleryImages=sampleImages;
 try{
  const items=await db.galleryItem.findMany({where:{restaurantId:process.env.RESTAURANT_ID},include:{mediaAssetRef:true},orderBy:{sortOrder:'asc'},take:12});
  const stored=items.map(item=>({src:item.mediaAssetRef.storageKey,alt:item.mediaAssetRef.altText})).filter(item=>item.src.startsWith('/')||/^https?:\/\//i.test(item.src));
  if(stored.length)galleryImages=stored;
 }catch(error){if(!(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001')))throw error;}
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">A little atmosphere</p><h1>The room &<br/>the table.</h1><p>Considered details, candlelight and the quiet pleasure of a place prepared just for you.</p></div></section><main className="content-width"><p className="sample-note">Illustrative photography for the fictional SAVORÉ demonstration restaurant.</p><div className="gallery-grid">{galleryImages.map((image,index)=><figure key={`${image.src}-${index}`}><img src={image.src} alt={image.alt} loading="lazy"/><figcaption>{image.alt}</figcaption></figure>)}</div></main><section className="cta-panel"><p className="eyebrow">See you around the table</p><h2>Make the room part of your evening.</h2><a className="button" href="/reservations">Reserve a table</a></section></>;
}
