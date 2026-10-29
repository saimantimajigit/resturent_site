import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {z,ZodError} from 'zod';
import {managerContext,adminError} from '@/server/admin-access';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';
import {localDateTimeUtc} from '@/server/admin-format';

const policy=z.object({advanceDays:z.number().int().min(1).max(365).optional(),durationMinutes:z.number().int().min(30).max(360).optional(),turnoverMinutes:z.number().int().min(0).max(180).optional(),cutoffMinutes:z.number().int().min(0).max(1440).optional(),maxPartySize:z.number().int().min(1).max(30).optional()}).refine(value=>Object.keys(value).length>0);
const address=z.object({line1:z.string().trim().max(160).optional(),line2:z.string().trim().max(160).optional(),city:z.string().trim().max(80).optional(),region:z.string().trim().max(80).optional(),postalCode:z.string().trim().max(24).optional(),country:z.string().trim().max(80).optional()});
const action=z.discriminatedUnion('action',[
  z.object({action:z.literal('restaurant'),name:z.string().trim().min(2).max(100).optional(),address:address.optional(),timezone:z.string().trim().min(3).max(80).optional()}),
  z.object({action:z.literal('booking-policy'),...policy.shape}),
  z.object({action:z.literal('service-period'),id:z.uuid().optional(),dayOfWeek:z.number().int().min(0).max(6),mealType:z.string().trim().min(2).max(40),startMinute:z.number().int().min(0).max(1439),endMinute:z.number().int().min(1).max(1440),active:z.boolean().default(true)}),
  z.object({action:z.literal('zone'),id:z.uuid().optional(),name:z.string().trim().min(2).max(80),sortOrder:z.number().int().min(0).max(1000).default(0),active:z.boolean().default(true)}),
  z.object({action:z.literal('table'),id:z.uuid().optional(),diningZoneId:z.uuid(),label:z.string().trim().min(1).max(24),minCapacity:z.number().int().min(1).max(30).default(1),maxCapacity:z.number().int().min(1).max(30),active:z.boolean().default(true),x:z.number().min(0).max(100).default(0),y:z.number().min(0).max(100).default(0)}),
  z.object({action:z.literal('closure'),startsAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),endsAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),reason:z.string().trim().min(3).max(240)})
]);
const futureStatuses=['HELD','AWAITING_PAYMENT','CONFIRMED','ARRIVED','SEATED'] as const;
function weekdayAndMinute(date:Date,timeZone:string){const parts=new Intl.DateTimeFormat('en-US',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date),get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value||'';return {weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),minute:Number(get('hour'))*60+Number(get('minute'))}}

export async function GET(){
  try{const context=await managerContext(),[restaurant,bookingPolicy,servicePeriods,closures,zones]=await Promise.all([
    db.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{id:true,name:true,slug:true,timezone:true,currency:true,address:true}}),
    db.bookingPolicy.findUniqueOrThrow({where:{restaurantId:context.restaurantId}}),
    db.servicePeriod.findMany({where:{restaurantId:context.restaurantId},orderBy:[{dayOfWeek:'asc'},{startMinute:'asc'}]}),
    db.specialClosure.findMany({where:{restaurantId:context.restaurantId,endsAt:{gte:new Date()}},orderBy:{startsAt:'asc'},take:100}),
    db.diningZone.findMany({where:{restaurantId:context.restaurantId},include:{DiningTable_diningZoneId:{orderBy:{label:'asc'},select:{id:true,label:true,minCapacity:true,maxCapacity:true,active:true,x:true,y:true}}},orderBy:[{sortOrder:'asc'},{name:'asc'}]})
  ]);return NextResponse.json({data:{restaurant,bookingPolicy,servicePeriods,closures,zones}},{headers:{'Cache-Control':'no-store'}})}
  catch(error){return adminError(error,'Restaurant settings are temporarily unavailable.')}
}

export async function PATCH(request:Request){
  const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
  try{
    const context=await managerContext(),body=action.parse(await request.json()),owner=context.roles.includes('OWNER');
    if(body.action==='restaurant'&&body.timezone&&!owner)return NextResponse.json({error:{code:'FORBIDDEN',message:'Only an owner may change the restaurant timezone.'}},{status:403});
    const result=await db.$transaction(async tx=>{
      const audit=async(actionName:string,resource:string,id:string|null,before:unknown,after:unknown)=>tx.auditLog.create({data:{restaurantId:context.restaurantId,actorUserId:context.user.id,action:actionName,resource,resourceId:id,before:before as never,after:after as never,requestId:randomUUID()}});
      if(body.action==='booking-policy'){
        const before=await tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId:context.restaurantId}});
        if(body.maxPartySize!==undefined&&body.maxPartySize<before.maxPartySize){const oversized=await tx.reservation.findFirst({where:{restaurantId:context.restaurantId,startsAt:{gte:new Date()},status:{in:[...futureStatuses]},partySize:{gt:body.maxPartySize}},select:{id:true}});if(oversized)throw new Error('ADMIN_CONFLICT:Future reservations exceed the proposed party-size limit.')}
        if(body.advanceDays!==undefined&&body.advanceDays<before.advanceDays){const cutoff=new Date(Date.now()+body.advanceDays*86_400_000),farBookings=await tx.reservation.findFirst({where:{restaurantId:context.restaurantId,startsAt:{gt:cutoff},status:{in:[...futureStatuses]}},select:{id:true}});if(farBookings)throw new Error('ADMIN_CONFLICT:Future reservations exist beyond the proposed booking window.')}
        const {action:_,...data}=body;const updated=await tx.bookingPolicy.update({where:{restaurantId:context.restaurantId},data});await audit('BOOKING_POLICY_UPDATED','BookingPolicy',updated.id,before,updated);return updated;
      }
      if(body.action==='restaurant'){
        const before=await tx.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{name:true,address:true,timezone:true}});
        if(body.timezone&&body.timezone!==before.timezone){try{new Intl.DateTimeFormat('en-US',{timeZone:body.timezone})}catch{throw new Error('ADMIN_CONFLICT:Select a supported IANA timezone.')};const future=await tx.reservation.findFirst({where:{restaurantId:context.restaurantId,startsAt:{gte:new Date()},status:{in:[...futureStatuses]}},select:{id:true}});if(future)throw new Error('ADMIN_CONFLICT:Timezone cannot change while future reservations are active.')}
        const updated=await tx.restaurant.update({where:{id:context.restaurantId},data:{...(body.name?{name:body.name}:{}),...(body.timezone?{timezone:body.timezone}:{}),...(body.address?{address:body.address}:{} )},select:{id:true,name:true,timezone:true,address:true}});await audit('RESTAURANT_SETTINGS_UPDATED','Restaurant',updated.id,before,updated);return updated;
      }
      if(body.action==='service-period'){
        if(body.startMinute>=body.endMinute)throw new Error('ADMIN_CONFLICT:Service start time must be earlier than end time.')
        let before=null;
        if(body.id){before=await tx.servicePeriod.findFirst({where:{id:body.id,restaurantId:context.restaurantId}});if(!before)throw new Error('ADMIN_NOT_FOUND:Service period not found.')}
        const affectedDays=[...new Set([body.dayOfWeek,...(before?[before.dayOfWeek]:[])])],other=await tx.servicePeriod.findMany({where:{restaurantId:context.restaurantId,dayOfWeek:{in:affectedDays},active:true,...(body.id?{id:{not:body.id}}:{})},select:{id:true,dayOfWeek:true,startMinute:true,endMinute:true,mealType:true}});
        if(body.active&&other.some(row=>row.dayOfWeek===body.dayOfWeek&&body.startMinute<row.endMinute&&body.endMinute>row.startMinute))throw new Error('ADMIN_CONFLICT:This service period overlaps another active period on that day.')
        const scheduleByDay=new Map<number,{startMinute:number;endMinute:number}[]>();for(const day of affectedDays)scheduleByDay.set(day,other.filter(row=>row.dayOfWeek===day).map(row=>({startMinute:row.startMinute,endMinute:row.endMinute})));if(body.active)scheduleByDay.get(body.dayOfWeek)!.push({startMinute:body.startMinute,endMinute:body.endMinute});
        const [restaurant,policy]=await Promise.all([tx.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{timezone:true}}),tx.bookingPolicy.findUniqueOrThrow({where:{restaurantId:context.restaurantId},select:{advanceDays:true}})]),now=new Date(),until=new Date(now.getTime()+policy.advanceDays*86_400_000);
        const affectedCount=await tx.reservation.count({where:{restaurantId:context.restaurantId,startsAt:{gte:now,lt:until},status:{in:[...futureStatuses]}}});if(affectedCount>10000)throw new Error('ADMIN_CONFLICT:There are too many future bookings to safely verify this schedule change.');
        const affected=await tx.reservation.findMany({where:{restaurantId:context.restaurantId,startsAt:{gte:now,lt:until},status:{in:[...futureStatuses]}},select:{startsAt:true,endsAt:true}});
        for(const reservation of affected){const start=weekdayAndMinute(reservation.startsAt,restaurant.timezone),end=weekdayAndMinute(reservation.endsAt,restaurant.timezone);if(!scheduleByDay.has(start.weekday))continue;const fits=scheduleByDay.get(start.weekday)!.some(period=>end.weekday===start.weekday&&start.minute>=period.startMinute&&end.minute<=period.endMinute);if(!fits)throw new Error('ADMIN_CONFLICT:A future reservation would fall outside the proposed service hours.')}
        let period;
        if(body.id)period=await tx.servicePeriod.update({where:{id:body.id},data:{dayOfWeek:body.dayOfWeek,mealType:body.mealType,startMinute:body.startMinute,endMinute:body.endMinute,active:body.active}});else period=await tx.servicePeriod.create({data:{restaurantId:context.restaurantId,dayOfWeek:body.dayOfWeek,mealType:body.mealType,startMinute:body.startMinute,endMinute:body.endMinute,active:body.active}});
        await audit(body.id?'SERVICE_PERIOD_UPDATED':'SERVICE_PERIOD_CREATED','ServicePeriod',period.id,before,period);return period;
      }
      if(body.action==='zone'){
        let before=null,zone;
        if(body.id){before=await tx.diningZone.findFirst({where:{id:body.id,restaurantId:context.restaurantId}});if(!before)throw new Error('ADMIN_NOT_FOUND:Dining zone not found.');if(!body.active&&before.active){const activeTables=await tx.diningTable.count({where:{restaurantId:context.restaurantId,diningZoneId:body.id,active:true}});if(activeTables)throw new Error('ADMIN_CONFLICT:Deactivate or move the zone tables before archiving this zone.')};zone=await tx.diningZone.update({where:{id:body.id},data:{name:body.name,sortOrder:body.sortOrder,active:body.active}})}else zone=await tx.diningZone.create({data:{restaurantId:context.restaurantId,name:body.name,sortOrder:body.sortOrder,active:body.active}});
        await audit(body.id?'DINING_ZONE_UPDATED':'DINING_ZONE_CREATED','DiningZone',zone.id,before,zone);return zone;
      }
      if(body.action==='table'){
        const zone=await tx.diningZone.findFirst({where:{id:body.diningZoneId,restaurantId:context.restaurantId,active:true},select:{id:true}});if(!zone)throw new Error('ADMIN_NOT_FOUND:Active dining zone not found.');if(body.minCapacity>body.maxCapacity)throw new Error('ADMIN_CONFLICT:Minimum capacity cannot exceed maximum capacity.');
        let before=null,table;
        if(body.id){before=await tx.diningTable.findFirst({where:{id:body.id,restaurantId:context.restaurantId}});if(!before)throw new Error('ADMIN_NOT_FOUND:Dining table not found.');const now=new Date();if(!body.active&&before.active){const active=await tx.tableOccupancy.findFirst({where:{restaurantId:context.restaurantId,diningTableId:body.id,active:true,endsAt:{gt:now}},select:{id:true}});const upcoming=await tx.reservationTable.findFirst({where:{restaurantId:context.restaurantId,diningTableId:body.id,reservationRef:{status:{in:[...futureStatuses]},startsAt:{gte:now}}},select:{id:true}});if(active||upcoming)throw new Error('ADMIN_CONFLICT:This table has active or future reservation occupancy.')};if(body.minCapacity>before.minCapacity||body.maxCapacity<before.maxCapacity){const incompatible=await tx.reservationTable.findFirst({where:{restaurantId:context.restaurantId,diningTableId:body.id,reservationRef:{status:{in:[...futureStatuses]},startsAt:{gte:now},OR:[{partySize:{lt:body.minCapacity}},{partySize:{gt:body.maxCapacity}}]}},select:{id:true}});const activeIncompatible=await tx.reservationTable.findFirst({where:{restaurantId:context.restaurantId,diningTableId:body.id,tableOccupancyRef:{is:{active:true,endsAt:{gt:now}}},reservationRef:{status:{in:[...futureStatuses]},OR:[{partySize:{lt:body.minCapacity}},{partySize:{gt:body.maxCapacity}}]}},select:{id:true}});if(incompatible||activeIncompatible)throw new Error('ADMIN_CONFLICT:Active or future reservations would not fit the proposed table capacity.')};table=await tx.diningTable.update({where:{id:body.id},data:{diningZoneId:zone.id,label:body.label,minCapacity:body.minCapacity,maxCapacity:body.maxCapacity,active:body.active,x:body.x,y:body.y}})}else table=await tx.diningTable.create({data:{restaurantId:context.restaurantId,diningZoneId:zone.id,label:body.label,minCapacity:body.minCapacity,maxCapacity:body.maxCapacity,active:body.active,x:body.x,y:body.y}});
        await audit(body.id?'DINING_TABLE_UPDATED':'DINING_TABLE_CREATED','DiningTable',table.id,before,table);return table;
      }
      if(body.action==='closure'){
        const restaurant=await tx.restaurant.findUniqueOrThrow({where:{id:context.restaurantId},select:{timezone:true}}),startsAt=localDateTimeUtc(body.startsAt,restaurant.timezone),endsAt=localDateTimeUtc(body.endsAt,restaurant.timezone);if(startsAt>=endsAt)throw new Error('ADMIN_CONFLICT:Closure end must be after its start.');const overlapping=await tx.reservation.findFirst({where:{restaurantId:context.restaurantId,startsAt:{lt:endsAt},endsAt:{gt:startsAt},status:{in:[...futureStatuses]}},select:{id:true}});if(overlapping)throw new Error('ADMIN_CONFLICT:Reservations already exist during this closure window.');const closure=await tx.specialClosure.create({data:{restaurantId:context.restaurantId,startsAt,endsAt,reason:body.reason}});await audit('SPECIAL_CLOSURE_CREATED','SpecialClosure',closure.id,null,{startsAt,endsAt,reason:closure.reason});return closure;
      }
      throw new Error('Unknown management action.');
    },{isolationLevel:'Serializable',timeout:15000});
    return NextResponse.json({data:result},{status:body.action==='zone'&&!('id'in body)||body.action==='table'&&!('id'in body)||body.action==='service-period'&&!('id'in body)||body.action==='closure'?201:200});
  }catch(error){if(error instanceof ZodError)return adminError(error);return adminError(error,'Could not update restaurant configuration.')}
}
