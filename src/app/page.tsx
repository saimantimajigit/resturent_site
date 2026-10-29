import type {Metadata} from 'next';
import {db} from '@/server/db';
import ResilientImage from '@/components/resilient-image';

export const metadata:Metadata={title:'An evening beyond the ordinary',description:'Seasonal cooking, considered wines and gracious hospitality in an intimate dining room.'};
export const dynamic='force-dynamic';

const dishPhotos=[
 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=1000&q=85',
 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1000&q=85',
 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=85',
];

export default async function Home(){
 let dishes:{id:string;slug:string;name:string;description:string|null;category:string;price:number;image:string}[]=[];
 let menuUnavailable=false;
 try{
  const rows=await db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},include:{menuCategoryRef:true,MenuItemPrice_menuItemId:{orderBy:{effectiveFrom:'desc'},take:1}},take:3});
  dishes=rows.map((item,index)=>({id:item.id,slug:item.slug,name:item.name,description:item.description,category:item.menuCategoryRef.name,price:Number(item.MenuItemPrice_menuItemId[0]?.amountMinor??0),image:item.imageUrl||dishPhotos[index%dishPhotos.length]}));
 }catch(error){if(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001'))menuUnavailable=true;else throw error;}

 return <>
  <section className="hero"><div className="hero-content reveal"><p className="eyebrow">A table set for the senses</p><h1>An evening<br/>beyond the ordinary.</h1><p className="hero-copy">Seasonal cooking, considered wines and the quiet pleasure of being expected.</p><div className="hero-actions"><a className="button" href="/reservations">Reserve your table</a><a className="button button-outline" href="/menu">Explore the menu</a></div></div><span className="hero-note">A little more time around the table</span></section>
  <section className="section"><div className="section-inner intro-grid"><div className="intro-copy"><p className="eyebrow">The SAVORÉ feeling</p><h2>Come as you are.<br/>Stay a little longer.</h2><p>At SAVORÉ, dinner is an invitation to slow down. Our kitchen follows the seasons; our dining room is made for conversation that carries on after the last course.</p><a className="link-arrow" href="/our-story">A note on our way of dining <span>→</span></a></div><figure className="intro-image"><ResilientImage src="/images/savore-dining-room.png" alt="Candlelit dining room with forest green seating and linen tables" loading="eager"/><figcaption className="image-caption">An intimate room, warmly lit</figcaption></figure></div></section>
  <section className="section forest-section"><div className="section-inner"><div className="section-heading"><p className="eyebrow">From the kitchen</p><h2>A few things worth<br/>coming in for.</h2><p>Our menu changes with the market and the moment. Here are a few signatures from the current demonstration menu.</p></div>{menuUnavailable?<p className="empty-state">The menu is temporarily unavailable while the local database is offline.</p>:dishes.length?<div className="dish-grid">{dishes.map(dish=><article className="dish-card" key={dish.id}><a className="dish-image" href={`/menu/${dish.slug}`}><ResilientImage src={dish.image} alt={`A plated serving of ${dish.name}`}/></a><div className="dish-card-body"><span className="dish-category">{dish.category}</span><h3><a href={`/menu/${dish.slug}`}>{dish.name}</a></h3><p>{dish.description}</p><div className="dish-meta"><span>₹{(dish.price/100).toLocaleString('en-IN',{minimumFractionDigits:2})}</span><a href={`/menu/${dish.slug}`}>Discover ↗</a></div></div></article>)}</div>:<p className="empty-state">Our next menu is being prepared. Join us soon.</p>}<a className="link-arrow" href="/menu">See the full menu <span>→</span></a></div></section>
  <section className="experience-band"><div className="experience-photo" role="img" aria-label="An intimate candlelit table at SAVORÉ"/><div className="experience-copy"><p className="eyebrow">A longer kind of evening</p><h2>The chef’s<br/>tasting experience.</h2><p>A seasonal progression of small plates, thoughtful pairings and a little room for surprise. Settle in; we’ll take it from here.</p><a className="link-arrow" href="/experiences/chef-tasting">Discover the experience <span>→</span></a></div></section>
  <section className="story-band"><div className="story-copy"><p className="eyebrow">A sense of place</p><h2>Rooted in the season.<br/>Made for sharing.</h2><p>We believe the best hospitality feels effortless. Behind it is a kitchen that cares about where things come from, and a room that remembers why you came.</p><a className="link-arrow" href="/our-story">Our story <span>→</span></a></div><div className="story-photo" role="img" aria-label="Warm candlelight across a restaurant table"/></section>
  <section className="section"><div className="section-inner private-card"><div><p className="eyebrow">Gather around</p><h2>A room of your own,<br/>for a night to remember.</h2><p>For birthdays, long lunches and the people you love having at one table. Tell us a little about your gathering and we’ll help shape the evening.</p></div><a className="button button-forest" href="/private-dining">Explore private dining</a></div></section>
  <section className="cta-panel"><p className="eyebrow">Your table is waiting</p><h2>Make an evening of it.</h2><p>Choose a date, bring your appetite, and leave the rest with us.</p><a className="button" href="/reservations">Find a table</a></section>
 </>;
}
