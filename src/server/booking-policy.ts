/** Pure, dependency-free reservation rules, independently testable. */
export type Window = { dayOfWeek: number; startMinute: number; endMinute: number; active: boolean };
export type Closure = { startsAt: Date; endsAt: Date };
export type Policy = { advanceDays: number; cutoffMinutes: number; maxPartySize: number; durationMinutes: number; turnoverMinutes: number };
export type OccupancyWindow={tableId:string;startsAt:Date;endsAt:Date};
export class BookingRuleError extends Error { readonly code: string; constructor(code: string, message: string) {super(message);this.code=code} }
export const DEMO_TIME_ZONE = 'Asia/Kolkata';
export function parseLocalSlot(date: string, time: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BookingRuleError('INVALID_SLOT','Invalid local date or time');
  // Phase 9.1 is intentionally scoped to Asia/Kolkata (no DST); timezone-general scheduling follows later.
  const instant=new Date(`${date}T${time}:00+05:30`);
  if (!Number.isFinite(instant.getTime()) || new Date(instant.getTime()+330*60000).toISOString().slice(0,16)!==`${date}T${time}`) throw new BookingRuleError('INVALID_SLOT','Nonexistent date');
  return instant;
}
export function assertBookingAllowed(args: {date:string;time:string;partySize:number;now:Date;policy:Policy;periods:Window[];closures:Closure[]}): {start:Date;end:Date} {
  const {date,time,partySize,now,policy,periods,closures}=args;
  if (!Number.isInteger(partySize)||partySize<1||partySize>policy.maxPartySize) throw new BookingRuleError('PARTY_SIZE_INVALID','Party size exceeds policy');
  const start=parseLocalSlot(date,time);
  const minutes=Number(time.slice(0,2))*60+Number(time.slice(3,5));
  const day=new Date(`${date}T12:00:00+05:30`).getUTCDay();
  const end=new Date(start.getTime()+(policy.durationMinutes+policy.turnoverMinutes)*60000);
  const serviceEnd=minutes+policy.durationMinutes;
  if (!periods.some(p=>p.active&&p.dayOfWeek===day&&minutes>=p.startMinute&&serviceEnd<=p.endMinute)) throw new BookingRuleError('SERVICE_CLOSED','No service at this time');
  if (start.getTime()-now.getTime()<policy.cutoffMinutes*60000) throw new BookingRuleError('BOOKING_CUTOFF','Booking cutoff passed');
  if (start.getTime()>now.getTime()+policy.advanceDays*86400000) throw new BookingRuleError('ADVANCE_WINDOW','Date is beyond the booking window');
  if (closures.some(c=>start<c.endsAt&&end>c.startsAt)) throw new BookingRuleError('SERVICE_CLOSED','Restaurant is closed for this interval');
  return {start,end};
}
export function hasAvailableTable(tableIds:readonly string[],occupancies:readonly OccupancyWindow[],start:Date,end:Date){
  const occupied=new Set(occupancies.filter(item=>item.startsAt<end&&item.endsAt>start).map(item=>item.tableId));
  return tableIds.some(id=>!occupied.has(id));
}
export const allowedReservationTransitions: Record<string, readonly string[]> = {
  CONFIRMED:['ARRIVED','CANCELLED','NO_SHOW'],
  ARRIVED:['SEATED','CANCELLED'],
  SEATED:['COMPLETED'],
  COMPLETED:[], CANCELLED:[], NO_SHOW:[],EXPIRED:[],
  HELD:['AWAITING_PAYMENT','CONFIRMED','EXPIRED','CANCELLED'],
  AWAITING_PAYMENT:['CONFIRMED','EXPIRED','CANCELLED']
};
export function assertTransition(from:string,to:string){if(!allowedReservationTransitions[from]?.includes(to)) throw new BookingRuleError('INVALID_TRANSITION',`Cannot transition from ${from} to ${to}`)}
