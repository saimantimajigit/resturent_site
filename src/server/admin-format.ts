export type AdminRange={from:Date;to:Date;fromDate:string;toDate:string;timezone:string};

function dateParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const value=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(part=>part.type===type)?.value);
  return {year:value('year'),month:value('month'),day:value('day'),hour:value('hour'),minute:value('minute'),second:value('second')};
}
function localMidnightUtc(date:string,timeZone:string){
  const [year,month,day]=date.split('-').map(Number);
  let instant=Date.UTC(year,month-1,day);
  for(let i=0;i<3;i++){
    const local=dateParts(new Date(instant),timeZone);
    instant+=Date.UTC(year,month-1,day)-Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);
  }
  const local=dateParts(new Date(instant),timeZone);
  if(`${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')}`!==date)throw new Error('ADMIN_CONFLICT:Enter a valid calendar date.');
  return new Date(instant);
}
export function localDateTimeUtc(value:string,timeZone:string){
  const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if(!match)throw new Error('ADMIN_CONFLICT:Enter a valid local date and time.');
  const [year,month,day]=match[1].split('-').map(Number),hours=Number(match[2]),minute=Number(match[3]);
  if(hours>23||minute>59)throw new Error('ADMIN_CONFLICT:Enter a valid local time.');
  const target=Date.UTC(year,month-1,day,hours,minute);let instant=target;
  for(let i=0;i<4;i++){
    const local=dateParts(new Date(instant),timeZone);
    instant+=target-Date.UTC(local.year,local.month-1,local.day,local.hour,local.minute,local.second);
  }
  const local=dateParts(new Date(instant),timeZone);
  if(local.hour!==hours||local.minute!==minute||`${local.year}-${String(local.month).padStart(2,'0')}-${String(local.day).padStart(2,'0')}`!==match[1])throw new Error('ADMIN_CONFLICT:That local time does not exist in the restaurant timezone.');
  return new Date(instant);
}
export function parseAdminRange(fromDate:string,toDate:string,timeZone:string):AdminRange{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)||!/^\d{4}-\d{2}-\d{2}$/.test(toDate))throw new Error('ADMIN_CONFLICT:Use ISO calendar dates.');
  const from=localMidnightUtc(fromDate,timeZone),dayAfter=new Date(`${toDate}T00:00:00.000Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate()+1);
  const endDate=dayAfter.toISOString().slice(0,10),to=localMidnightUtc(endDate,timeZone);
  const [fromYear,fromMonth,fromDay]=fromDate.split('-').map(Number),[toYear,toMonth,toDay]=toDate.split('-').map(Number);
  const calendarDays=(Date.UTC(toYear,toMonth-1,toDay+1)-Date.UTC(fromYear,fromMonth-1,fromDay))/86_400_000;
  if(Number.isNaN(from.valueOf())||Number.isNaN(to.valueOf())||from>=to||calendarDays>366)throw new Error('ADMIN_CONFLICT:Choose a valid range of no more than 366 days.');
  return {from,to,fromDate,toDate,timezone:timeZone};
}
export function csvCell(value:unknown){
  let text=value===null||value===undefined?'':value instanceof Date?value.toISOString():String(value);
  if(/^[\s\u0000-\u001f]*[=+@-]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
