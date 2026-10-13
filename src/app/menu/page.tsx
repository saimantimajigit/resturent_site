import {db} from '@/server/db';

export const dynamic = 'force-dynamic';

function getMenuItems(){
 return db.menuItem.findMany({
  where:{status:'PUBLISHED'},
  include:{menuCategoryRef:true,MenuItemPrice_menuItemId:true,MenuAvailability_menuItemId:true},
  take:50
 });
}

type MenuItems=Awaited<ReturnType<typeof getMenuItems>>;

export default async function Menu(){
 let items:MenuItems=[];
 let databaseUnavailable=false;

 try{
  items=await getMenuItems();
 }catch(error){
  // Keep the public page renderable when the local database service is stopped.
  // Other Prisma errors still surface so schema and query defects are not hidden.
  if(error&&typeof error==='object'&&'code' in error&&
   (error.code==='ECONNREFUSED'||error.code==='P1001')){
   databaseUnavailable=true;
  }else{
   throw error;
  }
 }

 return <main className="layout">
  <p className="eyebrow">A culinary journey</p>
  <h1>Our Menu</h1>
  <p className="muted">Illustrative dishes and pricing for client demonstration.</p>
  {databaseUnavailable?<p role="status" className="card">Our menu is temporarily unavailable. Please try again shortly.</p>:null}
  {!databaseUnavailable&&items.length===0?<p className="muted">Our menu is being prepared. Please check back soon.</p>:null}
  <div className="grid">{items.map(i=><article className="card" key={i.id}>
   <p className="eyebrow">{i.menuCategoryRef.name}</p>
   <h2>{i.name}</h2>
   <p>{i.description}</p>
   <p>₹{((Number(i.MenuItemPrice_menuItemId.at(-1)?.amountMinor??0))/100).toFixed(2)}</p>
   <span className="chip">{i.MenuAvailability_menuItemId[0]?.available===false?'Unavailable':'Available'}</span>
  </article>)}</div>
 </main>;
}
