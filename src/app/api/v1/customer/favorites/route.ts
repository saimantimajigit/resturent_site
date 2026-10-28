import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({dishId:z.uuid(),action:z.enum(['save','remove'])});

export async function POST(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 const customer=await currentCustomer();if(!customer)return NextResponse.json({error:{message:'Sign in to manage favorites.'}},{status:401});
 try{
  const {dishId,action}=input.parse(await request.json());
  const dish=await db.menuItem.findFirst({where:{id:dishId,status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId:process.env.RESTAURANT_ID,published:true}}},select:{id:true}});
  if(!dish)return NextResponse.json({error:{message:'Dish not found.'}},{status:404});
  const where={guestProfileId:customer.guest.id,kind:'FAVORITE_MENU_ITEM',value:dish.id};
  await db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${customer.guest.id}:${dish.id}:favorite`}))`;
   if(action==='save'){
    const existing=await tx.guestPreference.findFirst({where});
    if(!existing)await tx.guestPreference.create({data:where});
   }else await tx.guestPreference.deleteMany({where});
  });
  return NextResponse.json({data:{saved:action==='save'}});
 }catch(error){if(error instanceof ZodError)return NextResponse.json({error:{message:'Invalid favorite request.'}},{status:400});console.error('favorite update failed',error);return NextResponse.json({error:{message:'Could not update favorites.'}},{status:500});}
}
