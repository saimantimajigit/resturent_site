import FloorLiveBoard from '@/components/floor-live-board';
import {getFloorBoard} from '@/server/floor-operations';
import {staffContext} from '@/server/staff-context';

export const dynamic='force-dynamic';
function plusDays(date:string,days:number){const value=new Date(`${date}T12:00:00+05:30`);value.setDate(value.getDate()+days);return value.toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
export default async function ReservationCalendar({searchParams}:{searchParams:Promise<{date?:string;view?:string;endDate?:string}>}){
  const context=await staffContext(['HOST','MANAGER','OWNER']);const query=await searchParams;
  const date=query.date??new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});const view=query.view==='week'?'week':'day';
  const endDate=view==='week'?(query.endDate??plusDays(date,6)):date;
  const board=await getFloorBoard(context.restaurantId,undefined,date,endDate);
  return <main className="layout"><p className="eyebrow">Front of house</p><h1>Reservation calendar</h1><p className="muted">Review bookings by service day and upcoming week.</p><FloorLiveBoard initial={board} mode="calendar" view={view} endDate={view==='week'?endDate:undefined}/></main>;
}
