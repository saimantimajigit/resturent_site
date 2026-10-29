import {db} from '@/server/db';
import {Prisma} from '@/generated/prisma/client';
import {requireRole} from '@/server/session';
import OrderStatusAction from '@/components/order-status-action';
import OrderQueueRefresh from '@/components/order-queue-refresh';

export const dynamic='force-dynamic';

export default async function KitchenDisplay({searchParams}:{searchParams:Promise<{page?:string}>}){
  await requireRole(['CHEF','MANAGER','OWNER']);
  const restaurantId=process.env.RESTAURANT_ID!;
  const where:Prisma.KitchenTicketWhereInput={status:{in:['NEW','PREPARING','READY']},orderRef:{restaurantId,status:{in:['PLACED','ACCEPTED','PREPARING','READY']}}};
  const total=await db.kitchenTicket.count({where}),pageSize=100,totalPages=Math.max(1,Math.ceil(total/pageSize)),rawPage=(await searchParams).page;
  const requestedPage=rawPage&&/^\d+$/.test(rawPage)?Number(rawPage):1,page=Number.isSafeInteger(requestedPage)?Math.min(totalPages,Math.max(1,requestedPage)):1;
  const tickets=await db.kitchenTicket.findMany({where,include:{orderRef:{select:{id:true,reference:true,status:true,createdAt:true,type:true}},KitchenTicketItem_kitchenTicketId:{include:{orderItemRef:{select:{id:true,nameSnapshot:true,quantity:true,notes:true,allergenSnapshot:true}}}}},orderBy:[{createdAt:'asc'},{id:'asc'}],skip:(page-1)*pageSize,take:pageSize});
  return <main className="layout">
    <p className="eyebrow">Kitchen display</p><h1>Today’s tickets</h1>
    <p className="muted">{total} active tickets · page {page} of {totalPages}</p>
    <OrderQueueRefresh activeCount={total}/>
    {totalPages>1?<nav className="kitchen-queue-pages" aria-label="Kitchen ticket pages">
      {page===1?<span className="button button-small button-forest" aria-disabled="true">Previous tickets</span>:<a className="button button-small button-forest" href={`/staff/kitchen?page=${page-1}`}>Previous tickets</a>}
      {page===totalPages?<span className="button button-small button-forest" aria-disabled="true">Next tickets</span>:<a className="button button-small button-forest" href={`/staff/kitchen?page=${page+1}`}>Next tickets</a>}
    </nav>:null}
    {tickets.length?<div className="grid">{tickets.map(ticket=><article className="card" key={ticket.id}>
      <div className="reservation-row"><div><p className="eyebrow">{ticket.station} · {Math.max(0,Math.floor((Date.now()-ticket.createdAt.getTime())/60000))} min</p><h2><a href={`/staff/kitchen/${ticket.id}`}>{ticket.orderRef.reference}</a></h2></div><span className="status-pill">{ticket.status.toLowerCase()}</span></div>
      <ul>{ticket.KitchenTicketItem_kitchenTicketId.map(row=>{const allergens=Array.isArray(row.orderItemRef.allergenSnapshot)?row.orderItemRef.allergenSnapshot.map(String):[];return <li key={row.id}><strong>{row.orderItemRef.quantity} × {row.orderItemRef.nameSnapshot}</strong>{row.orderItemRef.notes?<p>Instruction: {row.orderItemRef.notes}</p>:null}<p className="muted">Allergens: {allergens.length?allergens.join(', '):'No listed allergens; check with the guest for dietary needs.'}</p></li>})}</ul>
      <OrderStatusAction id={ticket.orderRef.id} status={ticket.orderRef.status} options={ticket.orderRef.status==='PLACED'||ticket.orderRef.status==='ACCEPTED'?['PREPARING']:ticket.orderRef.status==='PREPARING'?['READY']:[]}/>
    </article>)}</div>:<div className="empty-state"><h2>No active tickets.</h2><p>New customer orders will appear here.</p></div>}
  </main>;
}
