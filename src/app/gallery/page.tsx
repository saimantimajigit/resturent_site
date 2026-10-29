import type {Metadata} from 'next';
import {db} from '@/server/db';
import ResilientImage from '@/components/resilient-image';
export const metadata:Metadata={title:'The room & the table',description:'A glimpse of the SAVORÉ dining room and the details around the table.'};
export const dynamic='force-dynamic';
type GalleryImage={src:string;alt:string;caption:string;illustration?:boolean};
const sampleImages:GalleryImage[]=[
 {src:'/images/savore-dining-room.png',alt:'Candlelight across linen tables in the SAVORÉ demonstration dining room',caption:'Demonstration dining room'},
 {src:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',alt:'A warmly lit restaurant dining room',caption:'A warmly lit dining room'},
 {src:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85',alt:'A fine dining table prepared for dinner',caption:'A table prepared for dinner'},
 {src:'/images/seasonal-ingredients.svg',alt:'Illustration of seasonal greens, squash, carrots, beets and herbs arranged for the kitchen',caption:'Illustration · seasonal ingredients',illustration:true},
 {src:'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=85',alt:'A seasonal fish dish served at the table',caption:'A seasonal fish dish'},
 {src:'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1200&q=85',alt:'A thoughtfully composed seasonal plate',caption:'A seasonal plate'},
];
export default async function Gallery(){
 let galleryImages=sampleImages;
 try{
  const items=await db.galleryItem.findMany({where:{restaurantId:process.env.RESTAURANT_ID},include:{mediaAssetRef:true},orderBy:{sortOrder:'asc'},take:12});
  const stored:GalleryImage[]=items.map(item=>({src:item.mediaAssetRef.storageKey,alt:item.mediaAssetRef.altText,caption:item.mediaAssetRef.altText})).filter(item=>item.src.startsWith('/')||/^https?:\/\//i.test(item.src));
  if(stored.length){
   const seasonal=sampleImages.find(image=>image.illustration)!;
   galleryImages=[...stored.filter(image=>image.src!==seasonal.src).slice(0,11),seasonal];
  }
 }catch(error){if(!(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001')))throw error;}
 return <><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">A little atmosphere</p><h1>The room &<br/>the table.</h1><p>Considered details, candlelight and the quiet pleasure of a place prepared just for you.</p></div></section><main className="content-width"><p className="sample-note">Demonstration imagery includes illustrative photography and artwork; it does not depict verified SAVORÉ restaurant scenes. The seasonal ingredients card is an illustration.</p><div className="gallery-grid">{galleryImages.map((image,index)=><figure key={`${image.src}-${index}`} className={image.illustration?'gallery-illustration':undefined}><ResilientImage className="gallery-image" src={image.src} alt={image.alt}/><figcaption>{image.caption}</figcaption></figure>)}</div></main><section className="cta-panel"><p className="eyebrow">See you around the table</p><h2>Make the room part of your evening.</h2><a className="button" href="/reservations">Reserve a table</a></section></>;
}
