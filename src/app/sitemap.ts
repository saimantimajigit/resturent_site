import type {MetadataRoute} from 'next';
import {db} from '@/server/db';
export const dynamic='force-dynamic';
const publicRoutes=['','/menu','/experiences/chef-tasting','/our-story','/chef','/gallery','/private-dining','/contact','/reservations'];
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const base=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';
 let dishRoutes:string[]=[];
 try{const dishes=await db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},select:{slug:true},take:500});dishRoutes=dishes.map(dish=>`/menu/${encodeURIComponent(dish.slug)}`);}catch(error){if(!(error&&typeof error==='object'&&'code'in error&&(error.code==='ECONNREFUSED'||error.code==='P1001')))throw error;}
 return [...publicRoutes,...dishRoutes].map(route=>({url:new URL(route,base).toString(),lastModified:new Date(),changeFrequency:route==='/menu'?'weekly' as const:'monthly' as const,priority:route===''?1:(route==='/menu'||route==='/reservations')?0.9:0.7}));
}
