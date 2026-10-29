import {NextResponse} from 'next/server';
import {z,ZodError} from 'zod';
import {db} from '@/server/db';
import {parseLocalSlot} from '@/server/booking-policy';
import {rejectCrossOrigin} from '@/server/request-security';
const input=z.object({name:z.string().trim().min(2).max(100),email:z.email().max(254),partySize:z.coerce.number().int().min(8).max(60),date:z.iso.date(),time:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),message:z.string().max(1000).optional()});
export async function POST(request:Request){
 const rejected=rejectCrossOrigin(request);if(rejected)return rejected;
 try{
  const data=input.parse(await request.json());const restaurantId=process.env.RESTAURANT_ID;if(!restaurantId)return NextResponse.json({error:{message:'Enquiries are unavailable.'}},{status:503});
  const preferredAt=parseLocalSlot(data.date,data.time);if(preferredAt<new Date())return NextResponse.json({error:{message:'Choose a future date and time.'}},{status:400});
  await db.privateDiningEnquiry.create({data:{restaurantId,guestName:data.name,email:data.email,partySize:data.partySize,preferredAt,message:data.message||null}});
  return NextResponse.json({data:{received:true}},{status:201});
 }catch(error){if(error instanceof ZodError)return NextResponse.json({error:{message:'Please check the enquiry details.'}},{status:400});console.error('private dining enquiry failed',error);return NextResponse.json({error:{message:'Your enquiry could not be received right now.'}},{status:500});}
}
