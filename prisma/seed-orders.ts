import 'dotenv/config';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});

async function main(){
 const restaurantId=process.env.RESTAURANT_ID;
 if(!restaurantId)throw new Error('RESTAURANT_ID is required');
 const dish=await db.menuItem.findFirst({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuItemAllergen_menuItemId:{include:{allergenRef:true}}},orderBy:{name:'asc'}});
 if(!dish||!dish.MenuItemPrice_menuItemId[0])throw new Error('A published, priced dish is required before seeding sample orders.');
 let guest=await db.guestProfile.findFirst({where:{email:'phase11.guest@savore.example.test'}});
 if(!guest)guest=await db.guestProfile.create({data:{name:'Aarav Mehta',email:'phase11.guest@savore.example.test',phone:'+91 90000 11011'}});
 const unit=BigInt(dish.MenuItemPrice_menuItemId[0].amountMinor);
 const samples=[{reference:'DEMO-PH11-001',key:'phase11-demo-placed',status:'PLACED' as const,ticket:'NEW' as const},{reference:'DEMO-PH11-002',key:'phase11-demo-preparing',status:'PREPARING' as const,ticket:'PREPARING' as const},{reference:'DEMO-PH11-003',key:'phase11-demo-ready',status:'READY' as const,ticket:'READY' as const}];
 for(const sample of samples){
  if(await db.order.findUnique({where:{reference:sample.reference}}))continue;
  await db.$transaction(async tx=>{
   const order=await tx.order.create({data:{restaurantId,guestProfileId:guest!.id,reference:sample.reference,idempotencyKey:sample.key,type:'PICKUP',status:sample.status,subtotalMinor:unit,totalMinor:unit,taxMinor:0n,currency:'INR',OrderItem_orderId:{create:{menuItemId:dish.id,nameSnapshot:dish.name,unitPriceMinor:unit,quantity:1,lineTotalMinor:unit,notes:'Fictional seed order: no special instructions.',allergenSnapshot:dish.MenuItemAllergen_menuItemId.map(link=>link.allergenRef.name)}},OrderEvent_orderId:{create:{toStatus:sample.status}}}});
   const ticket=await tx.kitchenTicket.create({data:{orderId:order.id,station:'MAIN',status:sample.ticket,startedAt:sample.ticket==='PREPARING'?new Date():null,completedAt:sample.ticket==='READY'?new Date():null}});
   const orderItem=await tx.orderItem.findFirstOrThrow({where:{orderId:order.id}});
   await tx.kitchenTicketItem.create({data:{kitchenTicketId:ticket.id,orderItemId:orderItem.id,status:sample.ticket}});
   await tx.payment.create({data:{orderId:order.id,provider:'DEMO',amountMinor:unit,status:'SUCCEEDED'}});
  });
 }
 console.log('Phase 11 sample orders and kitchen tickets are present (existing orders were left unchanged).');
}
main().finally(()=>db.$disconnect());
