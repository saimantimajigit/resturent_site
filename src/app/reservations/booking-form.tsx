'use client';
import {useEffect,useState,type FormEvent} from 'react';

type Slot={time:string;available:boolean};
type Confirmation={id:string;reference:string;status:string};
export default function BookingForm({defaultName='',defaultEmail=''}:{defaultName?:string;defaultEmail?:string}){
 const [date,setDate]=useState('');const [minDate,setMinDate]=useState('');const [time,setTime]=useState('');const [partySize,setPartySize]=useState(2);const [name,setName]=useState(defaultName);const [email,setEmail]=useState(defaultEmail);const [notes,setNotes]=useState('');const [slots,setSlots]=useState<Slot[]>([]);const [availabilityError,setAvailabilityError]=useState('');const [message,setMessage]=useState('');const [confirmation,setConfirmation]=useState<Confirmation|null>(null);const [busy,setBusy]=useState(false);
 useEffect(()=>{const today=new Date();setMinDate(`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`);},[]);
 useEffect(()=>{
  if(!date){setSlots([]);setTime('');setAvailabilityError('');return;}
  const controller=new AbortController();setAvailabilityError('Checking available times…');setTime('');
  fetch(`/api/v1/reservations/availability?date=${encodeURIComponent(date)}&partySize=${partySize}`,{signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Availability could not be checked.');setSlots(result.data.slots);setAvailabilityError(result.data.slots.some((slot:Slot)=>slot.available)?'Choose an available time.':'No times are available for this date.');}).catch(error=>{if(error.name!=='AbortError'){setSlots([]);setAvailabilityError('We can’t check availability right now. Please try again shortly.');}});
  return ()=>controller.abort();
 },[date,partySize]);

 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');setConfirmation(null);try{const response=await fetch('/api/v1/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date,time,partySize,name,email,notes})});const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Your reservation could not be completed.');setConfirmation(result.data);}catch(error){setMessage(error instanceof Error?error.message:'Please try again.');}finally{setBusy(false);}}

 if(confirmation)return <section className="confirmation" aria-live="polite"><p className="eyebrow">We look forward to seeing you</p><h2>Your table is reserved.</h2><div className="summary-grid"><div className="summary-item"><span>Date</span><strong>{new Date(`${date}T12:00:00`).toLocaleDateString('en-IN',{dateStyle:'long'})}</strong></div><div className="summary-item"><span>Time</span><strong>{time}</strong></div><div className="summary-item"><span>Party</span><strong>{partySize} guests</strong></div></div><p>Reservation reference<br/><strong>{confirmation.reference}</strong></p><p className="muted">A confirmation has been recorded. Keep this reference for your visit.</p><button className="button button-forest" type="button" onClick={()=>setConfirmation(null)}>Make another reservation</button></section>;

 return <form className="reservation-form" onSubmit={submit}>
  <label className="field"><span>Date</span><input type="date" value={date} min={minDate} onChange={event=>setDate(event.target.value)} required/></label>
  <label className="field"><span>Party size</span><select value={partySize} onChange={event=>setPartySize(Number(event.target.value))}>{[1,2,3,4,5,6,7,8,9,10,11,12].map(value=><option value={value} key={value}>{value} {value===1?'guest':'guests'}</option>)}</select></label>
  <div className="field field-full"><span>Available times</span><div className="time-slots" role="group" aria-label="Available reservation times">{slots.filter(slot=>slot.available).map(slot=><button className={`time-slot ${time===slot.time?'selected':''}`} type="button" aria-pressed={time===slot.time} onClick={()=>setTime(slot.time)} key={slot.time}>{slot.time}</button>)}</div><span className="form-hint" aria-live="polite">{availabilityError}</span></div>
  <label className="field"><span>Your name</span><input value={name} onChange={event=>setName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} required/></label>
  <label className="field"><span>Email address</span><input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email" required/></label>
  <label className="field field-full"><span>Anything we should know? <small>(optional)</small></span><textarea value={notes} onChange={event=>setNotes(event.target.value)} maxLength={500} placeholder="A special occasion, seating preference or note for our team"/></label>
  {message?<p className="form-message" role="alert">{message}</p>:null}
  <div className="field-full reservation-submit"><p className="muted">Your table is confirmed only after our booking service accepts the request.</p><button className="button button-forest" disabled={busy||!time}>{busy?'Confirming your table…':'Confirm reservation'}</button></div>
 </form>;
}
