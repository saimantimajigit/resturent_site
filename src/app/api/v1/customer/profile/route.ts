import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {currentCustomer} from '@/server/customer';
import {db} from '@/server/db';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().max(30),dietary:z.array(z.enum(['Vegetarian','Vegan','Pescatarian','Gluten-free','Dairy-free'])).max(5).refine(values=>new Set(values).size===values.length)});
export async function PATCH(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 const customer=await currentCustomer();if(!customer)return NextResponse.json({error:{message:'Sign in to edit your profile.'}},{status:401});
 try{
  const data=input.parse(await request.json());
  await db.$transaction(async tx=>{
   await tx.guestProfile.update({where:{id:customer.guest.id},data:{name:data.name,phone:data.phone||null}});
   await tx.user.update({where:{id:customer.user.id},data:{name:data.name}});
   await tx.guestPreference.deleteMany({where:{guestProfileId:customer.guest.id,kind:'DIETARY'}});
   if(data.dietary.length)await tx.guestPreference.createMany({data:data.dietary.map(value=>({guestProfileId:customer.guest.id,kind:'DIETARY',value}))});
  });
  return NextResponse.json({data:{saved:true}});
 }catch(error){if(error instanceof ZodError)return NextResponse.json({error:{message:'Please review the profile fields.'}},{status:400});console.error('customer profile update failed',error);return NextResponse.json({error:{message:'Could not save profile changes.'}},{status:500});}
}
