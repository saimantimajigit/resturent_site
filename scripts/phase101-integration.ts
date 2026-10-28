import 'dotenv/config';
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '../src/generated/prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';

const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!})});
const target=new URL(process.env.PHASE101_BASE_URL||'http://127.0.0.1:3001');
if(target.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash){
 throw new Error('PHASE101_BASE_URL must be a plain HTTP loopback URL; the harness sends the demo host password to this server.');
}
const base=target.origin;
const origin=target.origin;
const run=randomUUID().replaceAll('-','').slice(0,16);
const password=randomBytes(24).toString('hex');
// TEST-NET-1 keeps this run's local rate-limit fixtures separate from other runs.
const integrationIp=`192.0.2.${1+randomBytes(1)[0]%254}`;
const email=`phase101.${run}@example.test`;
const secondEmail=`phase101.second.${run}@example.test`;
const headers=(cookie?:string)=>({Origin:origin,'X-Real-IP':integrationIp,...(cookie?{Cookie:cookie}:{})});
const dateInKolkata=(days:number)=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+days*86_400_000));
 const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(value=>value.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
};
function sessionCookie(response:Response){
 const setCookie=response.headers.getSetCookie?.()[0]||response.headers.get('set-cookie');
 assert.ok(setCookie,'Expected a session cookie');
 return setCookie.split(';',1)[0];
}
async function json(response:Response){return response.json() as Promise<any>}
async function request(path:string,init:RequestInit={}){return fetch(`${base}${path}`,{...init,headers:{...headers(),...(init.headers||{})}})}
async function postBooking(date:string,time:string,tag:string){
 return request('/api/v1/reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date,time,partySize:4,name:`Concurrency ${tag}`,email:`phase101.${run}.${tag}@example.test`,notes:'Phase 10.1 concurrency verification'})});
}
async function findEmptyConcurrencyDate(restaurantId:string){
 for(let days=45;days<=85;days++){
  const date=dateInKolkata(days),start=new Date(`${date}T18:00:00+05:30`),end=new Date(start.getTime()+2*60*60_000);
  const occupied=await db.tableOccupancy.count({where:{restaurantId,active:true,startsAt:{lt:end},endsAt:{gt:start}}});
  if(occupied===0)return date;
 }
 throw new Error('No empty future slot is available for the concurrency fixture');
}
function pass(label:string){console.log(`PASS ${label}`)}

async function main(){
try{
 const restaurantId=process.env.RESTAURANT_ID!;
 assert.ok(restaurantId,'RESTAURANT_ID must be configured');
 assert.ok(process.env.DEMO_HOST_PASSWORD,'DEMO_HOST_PASSWORD must be configured');

 const menu=await fetch(`${base}/menu`);
 assert.equal(menu.status,200);
 assert.match(await menu.text(),/Truffle Wild Mushroom Risotto/);
 pass('published menu renders seeded Prisma items');

 const rejectedMissingOrigin=await fetch(`${base}/api/v1/customer/register`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Origin Check',email:`origin.${run}@example.test`,password})});
 assert.equal(rejectedMissingOrigin.status,403);
 const rejectedForeignOrigin=await fetch(`${base}/api/v1/customer/register`,{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:JSON.stringify({name:'Origin Check',email:`foreign.${run}@example.test`,password})});
 assert.equal(rejectedForeignOrigin.status,403);
 pass('missing and foreign Origin headers are rejected');

 const registration=await request('/api/v1/customer/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Phase Ten Guest',email,password,phone:'9876543210'})});
 assert.equal(registration.status,201,await registration.text());
 const registrationCookie=sessionCookie(registration);
 const user=await db.user.findUnique({where:{email}});
 assert.ok(user?.passwordHash&&user.passwordHash!==password);
 const guest=await db.guestProfile.findUnique({where:{userId:user!.id}});
 assert.ok(guest);
 pass('customer registration persists a hashed account and guest profile');

 const login=await request('/api/v1/customer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 assert.equal(login.status,200,await login.text());
 const loginCookie=sessionCookie(login);
 const token=loginCookie.split('=',2)[1];
 const session=await db.session.findUnique({where:{tokenHash:createHash('sha256').update(token).digest('hex')}});
 assert.ok(session&&session.userId===user!.id&&!session.revokedAt&&session.expiresAt>new Date());
 pass('customer login creates a valid persisted session');

 const profile=await request('/api/v1/customer/profile',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:loginCookie},body:JSON.stringify({name:'Phase Ten Guest Updated',phone:'9876501234',dietary:['Vegetarian']})});
 assert.equal(profile.status,200,await profile.text());
 const savedGuest=await db.guestProfile.findUnique({where:{userId:user!.id}});
 const dietary=await db.guestPreference.findFirst({where:{guestProfileId:guest!.id,kind:'DIETARY',value:'Vegetarian'}});
 assert.equal(savedGuest?.name,'Phase Ten Guest Updated');assert.equal(savedGuest?.phone,'9876501234');assert.ok(dietary);
 pass('customer profile and preferences persist');

 const dish=await db.menuItem.findFirst({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},select:{id:true}});
 assert.ok(dish,'Seeded published dish is required');
 const favorite=await request('/api/v1/customer/favorites',{method:'POST',headers:{'Content-Type':'application/json',Cookie:loginCookie},body:JSON.stringify({dishId:dish.id,action:'save'})});
 assert.equal(favorite.status,200,await favorite.text());
 assert.ok(await db.guestPreference.findFirst({where:{guestProfileId:guest!.id,kind:'FAVORITE_MENU_ITEM',value:dish.id}}));

 const secondRegistration=await request('/api/v1/customer/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Second Phase Guest',email:secondEmail,password})});
 assert.equal(secondRegistration.status,201,await secondRegistration.text());
 const secondCookie=sessionCookie(secondRegistration);
 const secondUser=await db.user.findUnique({where:{email:secondEmail}});
 const secondGuest=await db.guestProfile.findUnique({where:{userId:secondUser!.id}});
 const crossFavorite=await request('/api/v1/customer/favorites',{method:'POST',headers:{'Content-Type':'application/json',Cookie:secondCookie},body:JSON.stringify({dishId:dish.id,action:'remove'})});
 assert.equal(crossFavorite.status,200,await crossFavorite.text());
 assert.ok(await db.guestPreference.findFirst({where:{guestProfileId:guest!.id,kind:'FAVORITE_MENU_ITEM',value:dish.id}}));
 assert.equal(await db.guestPreference.count({where:{guestProfileId:secondGuest!.id,kind:'FAVORITE_MENU_ITEM',value:dish.id}}),0);
 pass('favorites persist and remain scoped to their owner');

 const privateEmail=`private.${run}@example.test`;
 const enquiry=await request('/api/v1/private-dining',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Phase Ten Enquiry',email:privateEmail,partySize:12,date:dateInKolkata(40),time:'19:00',message:'Integration verification'})});
 assert.equal(enquiry.status,201,await enquiry.text());
 assert.ok(await db.privateDiningEnquiry.findFirst({where:{email:privateEmail,restaurantId}}));
 pass('private dining enquiry persists');

 const reservationDate=dateInKolkata(42);
 const booking=await request('/api/v1/reservations',{method:'POST',headers:{'Content-Type':'application/json',Cookie:loginCookie},body:JSON.stringify({date:reservationDate,time:'19:00',partySize:2,name:'Phase Ten Guest Updated',email,notes:'Customer workflow verification'})});
 const bookingBody=await json(booking);
 assert.equal(booking.status,201,JSON.stringify(bookingBody));
 const bookingData=bookingBody.data;
 const reservation=await db.reservation.findUnique({where:{id:bookingData.id}});
 assert.ok(reservation&&reservation.guestProfileId===guest!.id);
 const crossRead=await fetch(`${base}/account/reservations/${bookingData.id}`,{headers:headers(secondCookie),redirect:'manual'});
 assert.equal(crossRead.status,404);
 pass('customer reservation persists and another customer cannot read it');

 const hostLogin=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{...headers(),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'host@savore.example.test',password:process.env.DEMO_HOST_PASSWORD!}),redirect:'manual'});
 assert.equal(hostLogin.status,303);
 const hostCookie=sessionCookie(hostLogin);
 const calendar=await fetch(`${base}/staff/host/calendar?date=${reservationDate}&view=day`,{headers:headers(hostCookie)});
 assert.equal(calendar.status,200);assert.match(await calendar.text(),new RegExp(bookingData.reference));
 const statusUpdate=await fetch(`${base}/api/v1/staff/reservations/${bookingData.id}/status`,{method:'POST',headers:{...headers(hostCookie),'Content-Type':'application/json'},body:JSON.stringify({status:'ARRIVED'})});
 assert.equal(statusUpdate.status,200,await statusUpdate.text());
 assert.equal((await db.reservation.findUnique({where:{id:bookingData.id}}))?.status,'ARRIVED');
 pass('host calendar shows the future reservation and host status update persists');

 const limitedEmail=`ratelimit.${run}@example.test`;
 const rateStatuses:number[]=[];
 for(let attempt=0;attempt<6;attempt++){
  const response=await request('/api/v1/customer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:limitedEmail,password:'deliberately-wrong-password'})});
  rateStatuses.push(response.status);
 }
 assert.deepEqual(rateStatuses,[401,401,401,401,401,429]);
 pass('authentication limit blocks the sixth failed login in its window');

 const concurrentDate=await findEmptyConcurrencyDate(restaurantId);
 for(let i=0;i<11;i++){
  const response=await postBooking(concurrentDate,'18:00',`fill${i}`);
  assert.equal(response.status,201,`Could not reserve fixture table ${i+1}: ${response.status} ${await response.text()}`);
 }
 pass('11 fixture bookings occupy 11 of 12 eligible tables');
 const concurrent=await Promise.all([postBooking(concurrentDate,'18:00','raceA'),postBooking(concurrentDate,'18:00','raceB')]);
 const raceStatuses=concurrent.map(response=>response.status).sort((a,b)=>a-b);
 assert.deepEqual(raceStatuses,[201,409],`Expected one booking and one conflict; got ${raceStatuses.join(',')}`);
 const slotStart=new Date(`${concurrentDate}T18:00:00+05:30`);
 const slotEnd=new Date(slotStart.getTime()+2*60*60_000);
 const occupancies=await db.tableOccupancy.findMany({where:{restaurantId,active:true,startsAt:{lt:slotEnd},endsAt:{gt:slotStart}},select:{diningTableId:true}});
 assert.equal(occupancies.length,12);
 assert.equal(new Set(occupancies.map(value=>value.diningTableId)).size,12);
 pass('simultaneous final-table requests yield one reservation, one 409, and no double booking');
}finally{
 await db.$disconnect();
}
}

main().catch(error=>{console.error(error);process.exitCode=1});
