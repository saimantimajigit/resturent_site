import 'server-only';
import {db} from './db';
import type {AdminRange} from './admin-format';

export async function managementDashboard(restaurantId:string,range:AdminRange){
  const now=new Date();
  const reservationWhere={restaurantId,startsAt:{gte:range.from,lt:range.to}};
  const orderWhere={restaurantId,createdAt:{gte:range.from,lt:range.to}};
  const [restaurant,reservations,upcoming,seated,cancellations,noShows,walkInRows,orders,orderValue,kitchen,tables,occupancies]=await Promise.all([
    db.restaurant.findUniqueOrThrow({where:{id:restaurantId},select:{timezone:true,currency:true}}),
    db.reservation.groupBy({by:['status'],where:reservationWhere,_count:{_all:true}}),
    db.reservation.count({where:{...reservationWhere,startsAt:{gte:now,lt:range.to},status:{in:['HELD','AWAITING_PAYMENT','CONFIRMED','ARRIVED']}}}),
    db.reservation.count({where:{restaurantId,status:'SEATED',startsAt:{lt:range.to},endsAt:{gt:range.from}}}),
    db.reservation.count({where:{...reservationWhere,status:'CANCELLED'}}),
    db.reservation.count({where:{...reservationWhere,status:'NO_SHOW'}}),
    db.reservationEvent.groupBy({by:['reservationId'],where:{createdAt:{gte:range.from,lt:range.to},metadata:{path:['source'],equals:'WALK_IN'},reservationRef:{restaurantId}},_count:{_all:true}}),
    db.order.groupBy({by:['status'],where:orderWhere,_count:{_all:true}}),
    db.order.aggregate({where:{...orderWhere,status:{notIn:['CANCELLED','REJECTED']}},_sum:{totalMinor:true}}),
    db.kitchenTicket.findMany({where:{createdAt:{gte:range.from,lt:range.to},orderRef:{restaurantId}},select:{status:true,startedAt:true,completedAt:true}}),
    db.diningTable.count({where:{restaurantId,active:true}}),
    db.tableOccupancy.findMany({where:{restaurantId,startsAt:{lt:range.to},endsAt:{gt:range.from}},select:{startsAt:true,endsAt:true}})
  ]);
  const count=(rows:{status:string;_count:{_all:number}}[],status:string)=>rows.find(row=>row.status===status)?._count._all??0;
  const occupancyMs=occupancies.reduce((sum,row)=>sum+Math.max(0,Math.min(row.endsAt.getTime(),range.to.getTime())-Math.max(row.startsAt.getTime(),range.from.getTime())),0);
  const scheduledUtilization=tables?Math.min(100,occupancyMs/(tables*(range.to.getTime()-range.from.getTime()))*100):0;
  const completed=kitchen.filter(ticket=>ticket.status==='COMPLETED');
  const prepTimes=completed.flatMap(ticket=>ticket.startedAt&&ticket.completedAt&&ticket.completedAt>=ticket.startedAt?[(ticket.completedAt.getTime()-ticket.startedAt.getTime())/60_000]:[]);
  const orderCount=orders.reduce((sum,row)=>sum+row._count._all,0);
  return {
    range:{from:range.fromDate,to:range.toDate,timezone:restaurant.timezone},
    reservations:{total:reservations.reduce((sum,row)=>sum+row._count._all,0),upcoming,seated,cancelled:cancellations,noShows,walkIns:walkInRows.length,byStatus:Object.fromEntries(reservations.map(row=>[row.status,row._count._all]))},
    tables:{active:tables,scheduledUtilizationPercent:Number(scheduledUtilization.toFixed(1)),definition:'Scheduled occupied table-minutes divided by active tables × all minutes in the selected local-date period. This is not a live occupancy or service-hours measure.'},
    orders:{total:orderCount,cancelled:count(orders,'CANCELLED')+count(orders,'REJECTED'),simulatedOrderValueMinor:(orderValue._sum.totalMinor??0n).toString(),currency:restaurant.currency,definition:'Sum of order totals excluding cancelled and rejected orders. This is simulated order value, not collected revenue.'},
    kitchen:{tickets:kitchen.length,completed:completed.length,averagePreparationMinutes:prepTimes.length?Number((prepTimes.reduce((sum,n)=>sum+n,0)/prepTimes.length).toFixed(1)):null,definition:'Mean of startedAt-to-completedAt minutes for completed kitchen tickets with both timestamps.'}
  };
}

export async function managementReport(restaurantId:string,range:AdminRange,type:'reservations'|'orders'|'kitchen',page:number,pageSize=50){
  const skip=(page-1)*pageSize;
  if(type==='reservations'){
    const where={restaurantId,startsAt:{gte:range.from,lt:range.to}};
    const [total,rows]=await Promise.all([db.reservation.count({where}),db.reservation.findMany({where,orderBy:[{startsAt:'desc'},{id:'desc'}],skip,take:pageSize,select:{id:true,reference:true,partySize:true,startsAt:true,endsAt:true,status:true}})]);
    return {type,page,pageSize,total,rows};
  }
  if(type==='orders'){
    const where={restaurantId,createdAt:{gte:range.from,lt:range.to}};
    const [total,rows]=await Promise.all([db.order.count({where}),db.order.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip,take:pageSize,select:{id:true,reference:true,type:true,status:true,totalMinor:true,currency:true,createdAt:true}})]);
    return {type,page,pageSize,total,rows:rows.map(row=>({...row,totalMinor:row.totalMinor.toString()}))};
  }
  const where={createdAt:{gte:range.from,lt:range.to},orderRef:{restaurantId}};
  const [total,rows]=await Promise.all([db.kitchenTicket.count({where}),db.kitchenTicket.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip,take:pageSize,select:{id:true,status:true,createdAt:true,startedAt:true,completedAt:true,orderRef:{select:{reference:true}}}})]);
  return {type,page,pageSize,total,rows:rows.map(row=>({...row,orderReference:row.orderRef.reference,orderRef:undefined,preparationMinutes:row.startedAt&&row.completedAt?Number(((row.completedAt.getTime()-row.startedAt.getTime())/60_000).toFixed(1)):null}))};
}

export async function managementAudit(restaurantId:string,page:number,pageSize=50){
  const where={restaurantId};
  const [total,rows]=await Promise.all([db.auditLog.count({where}),db.auditLog.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(page-1)*pageSize,take:pageSize,select:{id:true,actorUserId:true,action:true,resource:true,resourceId:true,before:true,after:true,createdAt:true,actorUserRef:{select:{name:true}}}})]);
  return {page,pageSize,total,rows};
}
