import 'server-only';
import {createHash} from 'node:crypto';
import {db} from './db';
import {canTransitionOrder} from './order-policy';

export class OrderInputError extends Error {}
export class OrderUnavailableError extends Error {}
export class OrderTransitionError extends Error {}

export function assertOrderTransition(from:string,to:string){if(!canTransitionOrder(from,to))throw new OrderTransitionError(`Cannot move order from ${from} to ${to}.`)}

export async function createCustomerOrder(guestProfileId:string, restaurantId:string, key:string, items:{menuItemId:string;quantity:number;notes?:string}[],reservationId?:string,attempt=0){
  const prior=await db.order.findFirst({where:{guestProfileId,idempotencyKey:key}});
  if(prior)return prior;
  const ids=[...new Set(items.map(item=>item.menuItemId))];
  if(ids.length!==items.length)throw new OrderInputError('Combine duplicate dishes into one cart line.');
  const digest=createHash('sha256').update(`${guestProfileId}:${key}`).digest('hex');
  try{return await db.$transaction(async tx=>{
    const restaurant=await tx.restaurant.findUnique({where:{id:restaurantId},select:{currency:true}});
    if(!restaurant)throw new OrderUnavailableError('Restaurant is not accepting online orders.');
    if(reservationId){
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id=${reservationId}::uuid AND "restaurantId"=${restaurantId}::uuid FOR UPDATE`;
      const reservation=await tx.reservation.findFirst({where:{id:reservationId,restaurantId,guestProfileId,status:'SEATED'}});
      const assignments=reservation?await tx.reservationTable.findMany({where:{reservationId,restaurantId},select:{id:true}}):[];
      const occupancy=assignments.length?await tx.tableOccupancy.findFirst({where:{restaurantId,reservationTableId:{in:assignments.map(row=>row.id)},active:true,startsAt:{lte:new Date()},endsAt:{gt:new Date()}},select:{id:true}}):null;
      if(!reservation||!occupancy)throw new OrderUnavailableError('Choose one of your currently seated reservations for dine-in service.');
    }
    const menu=await tx.menuItem.findMany({where:{id:{in:ids},status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuAvailability_menuItemId:true,MenuItemAllergen_menuItemId:{include:{allergenRef:true}}}});
    if(menu.length!==ids.length)throw new OrderUnavailableError('One or more dishes are no longer available.');
    const byId=new Map(menu.map(item=>[item.id,item]));
    const lines=items.map(line=>{const item=byId.get(line.menuItemId),price=item?.MenuItemPrice_menuItemId[0];if(!item||!price||price.currency!==restaurant.currency||item.MenuAvailability_menuItemId[0]?.available===false)throw new OrderUnavailableError('One or more dishes are no longer available.');return {line,item,price,unit:BigInt(price.amountMinor)}});
    const subtotal=lines.reduce((sum,x)=>sum+x.unit*BigInt(x.line.quantity),0n);
    const reference=`S-${digest.slice(0,10).toUpperCase()}`;
    const order=await tx.order.create({data:{restaurantId,guestProfileId,reservationId:reservationId??null,reference,type:reservationId?'DINE_IN':'PICKUP',status:'PLACED',subtotalMinor:subtotal,taxMinor:0n,totalMinor:subtotal,currency:restaurant.currency,idempotencyKey:key,
      OrderItem_orderId:{create:lines.map(({line,item,price,unit})=>({menuItemId:item.id,nameSnapshot:item.name,unitPriceMinor:unit,quantity:line.quantity,lineTotalMinor:unit*BigInt(line.quantity),notes:line.notes?.trim()||null,allergenSnapshot:item.MenuItemAllergen_menuItemId.map(link=>link.allergenRef.name)}))},
      OrderEvent_orderId:{create:{toStatus:'PLACED'}}
    }});
    // Create dependent ticket rows after order items are available, within this same transaction.
    const orderItems=await tx.orderItem.findMany({where:{orderId:order.id},orderBy:{id:'asc'}});
    const ticket=await tx.kitchenTicket.create({data:{orderId:order.id,station:'MAIN'}});
    await tx.kitchenTicketItem.createMany({data:orderItems.map(orderItem=>({kitchenTicketId:ticket.id,orderItemId:orderItem.id,status:'NEW'}))});
    await tx.payment.create({data:{orderId:order.id,provider:'DEMO',amountMinor:subtotal,status:'SUCCEEDED'}});
    return order;
  },{isolationLevel:'Serializable'});}catch(error){if(error&&typeof error==='object'&&'code'in error){const code=(error as {code:string}).code;if(code==='P2002'){const duplicate=await db.order.findFirst({where:{guestProfileId,idempotencyKey:key}});if(duplicate)return duplicate;}if(code==='P2034'&&attempt<2){await new Promise(resolve=>setTimeout(resolve,20*(attempt+1)));return createCustomerOrder(guestProfileId,restaurantId,key,items,reservationId,attempt+1);}}throw error;}
}

export async function changeOrderStatus(orderId:string,restaurantId:string,actorUserId:string,status:string){
  return db.$transaction(async tx=>{
    const order=await tx.order.findFirst({where:{id:orderId,restaurantId}});if(!order)throw new OrderUnavailableError('Order not found.');
    assertOrderTransition(order.status,status);
    await tx.order.update({where:{id:order.id},data:{status:status as never}});
    await tx.orderEvent.create({data:{orderId:order.id,actorUserId,fromStatus:order.status,toStatus:status}});
    const kitchen=status==='PREPARING'?'PREPARING':status==='READY'?'READY':status==='CANCELLED'||status==='REJECTED'?'CANCELLED':null;
    if(kitchen)await tx.kitchenTicket.updateMany({where:{orderId:order.id},data:{status:kitchen,startedAt:kitchen==='PREPARING'?new Date():undefined,completedAt:kitchen==='READY'||kitchen==='CANCELLED'?new Date():undefined}});
    return {id:order.id,status};
  });
}
