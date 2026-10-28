import {db} from '@/server/db';
import {requireRole} from '@/server/session';
import OrderStatusAction from '@/components/order-status-action';
import RefundReviewAction from '@/components/refund-review-action';
import OrderQueueRefresh from '@/components/order-queue-refresh';
export const dynamic='force-dynamic';
const next:Record<string,string[]>={PLACED:['ACCEPTED','CANCELLED','REJECTED'],ACCEPTED:['PREPARING','CANCELLED'],PREPARING:['READY','CANCELLED'],READY:['SERVED','COLLECTED','DELIVERED'],SERVED:[],COLLECTED:[],DELIVERED:[],CANCELLED:[],REJECTED:[]};
export default async function StaffOrders(){
 await requireRole(['MANAGER','OWNER']);const rows=await db.order.findMany({where:{restaurantId:process.env.RESTAURANT_ID},include:{guestProfileRef:{select:{name:true,email:true}},OrderItem_orderId:true,Payment_orderId:{include:{Refund_paymentId:true}}},orderBy:{createdAt:'desc'},take:100});
 return <main className="layout"><p className="eyebrow">Restaurant operations</p><h1>Order management</h1><OrderQueueRefresh/>{rows.length?<div className="stack">{rows.map(order=><article className="card" key={order.id}><div className="reservation-row"><div><p className="eyebrow"><a href={`/staff/orders/${order.id}`}>{order.reference}</a> · {order.type.toLowerCase().replaceAll('_',' ')}</p><h2>{order.guestProfileRef.name}</h2><p className="muted">{order.guestProfileRef.email} · {order.createdAt.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'})}</p></div><span className="status-pill">{order.status.toLowerCase()}</span></div><ul>{order.OrderItem_orderId.map(item=><li key={item.id}>{item.quantity} × {item.nameSnapshot} — ₹{(Number(item.lineTotalMinor)/100).toFixed(2)}{item.notes?` · ${item.notes}`:''}</li>)}</ul><p><strong>Total ₹{(Number(order.totalMinor)/100).toFixed(2)}</strong> · Demo payment: {order.Payment_orderId[0]?.status.toLowerCase()??'pending'}</p><OrderStatusAction id={order.id} status={order.status} options={next[order.status]??[]}/></article>)}</div>:<div className="empty-state"><h2>No orders yet.</h2><p>New customer orders will appear here.</p></div>}</main>;
}
