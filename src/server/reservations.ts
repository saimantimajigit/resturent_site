import 'server-only';
import {db} from './db';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {assertBookingAllowed,BookingRuleError} from './booking-policy';
export {BookingRuleError} from './booking-policy';
type BookingInput = {
 date: string;
 time: string;
 partySize: number;
 name: string;
 email: string;
 notes?: string;
};
export const bookingInput=z.object({date:z.iso.date(),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),partySize:z.number().int().min(1).max(12),name:z.string().trim().min(2).max(100),email:z.email(),notes:z.string().max(500).optional()});
const rid=()=>{if(!process.env.RESTAURANT_ID)throw new Error('RESTAURANT_ID missing');return process.env.RESTAURANT_ID};
async function policyData(restaurantId:string){
 const [policy,periods,closures]=await Promise.all([
  db.bookingPolicy.findUniqueOrThrow({where:{restaurantId}}),
  db.servicePeriod.findMany({where:{restaurantId,active:true}}),
  db.specialClosure.findMany({where:{restaurantId}})
 ]);
 return {policy,periods,closures};
}
export class BookingConflict extends Error{constructor(){super('No tables available for that time')}}
export async function slots(date:string,partySize:number){
 const restaurantId=rid();const {policy,periods,closures}=await policyData(restaurantId);
 const tables=await db.diningTable.findMany({where:{restaurantId,active:true,maxCapacity:{gte:partySize},minCapacity:{lte:partySize}}});
 const options=['18:00','18:30','19:00','19:30','20:00','20:30'];
 const result=[];
 for(const time of options){
  let start:Date,end:Date;
  try{({start,end}=assertBookingAllowed({date,time,partySize,now:new Date(),policy,periods,closures}))}
  catch(e){if(e instanceof BookingRuleError){result.push({time,available:false});continue}throw e}
  const occupied=await db.tableOccupancy.findMany({where:{restaurantId,active:true,diningTableId:{in:tables.map(t=>t.id)},startsAt:{lt:end},endsAt:{gt:start}},select:{diningTableId:true}});
  const used=new Set(occupied.map(o=>o.diningTableId));result.push({time,available:tables.some(t=>!used.has(t.id))});
 }return result;
}
export async function createBooking(data:BookingInput){
 const parsed=bookingInput.parse(data) as BookingInput,restaurantId=rid();
 // Read-only availability is advisory; policy and table allocation are rechecked inside transaction.
 return db.$transaction(async(tx)=>{
  const [policy,periods,closures]=await Promise.all([
   tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId}}),
   tx.servicePeriod.findMany({where:{restaurantId,active:true}}),
   tx.specialClosure.findMany({where:{restaurantId}})
  ]);
  const {start,end}=assertBookingAllowed({date:parsed.date,time:parsed.time,partySize:parsed.partySize,now:new Date(),policy,periods,closures});
  const candidates=await tx.diningTable.findMany({where:{restaurantId,active:true,maxCapacity:{gte:parsed.partySize},minCapacity:{lte:parsed.partySize}},orderBy:{label:'asc'}});
  for(const table of candidates){
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${table.id}::text))`;
   const count=await tx.tableOccupancy.count({where:{diningTableId:table.id,active:true,startsAt:{lt:end},endsAt:{gt:start}}});
   if(count)continue;
   const guest=await tx.guestProfile.create({data:{name:parsed.name,email:parsed.email}});
   const reservation=await tx.reservation.create({data:{restaurantId,guestProfileId:guest.id,reference:'SV-'+randomUUID().slice(0,12).toUpperCase(),partySize:parsed.partySize,startsAt:start,endsAt:end,notes:parsed.notes,status:'CONFIRMED'}});
   const assignment=await tx.reservationTable.create({data:{restaurantId,reservationId:reservation.id,diningTableId:table.id,startsAt:start,endsAt:end}});
   await tx.tableOccupancy.create({data:{restaurantId,reservationTableId:assignment.id,diningTableId:table.id,startsAt:start,endsAt:end,active:true}});
   await tx.reservationEvent.create({data:{reservationId:reservation.id,toStatus:'CONFIRMED'}});
   return {id:reservation.id,reference:reservation.reference,status:reservation.status};
  }
  throw new BookingConflict();
 },{isolationLevel:'Serializable',maxWait:8000,timeout:12000});
}
