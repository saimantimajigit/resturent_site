 'use client';
import {useState} from 'react';import {useRouter} from 'next/navigation';
export default function StatusAction({id,status}:{id:string;status:string}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const next=status==='CONFIRMED'?'ARRIVED':status==='ARRIVED'?'SEATED':status==='SEATED'?'COMPLETED':null;
 if(!next)return null;
 return <div><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch(`/api/v1/staff/reservations/${id}/status`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:next})});if(!r.ok)throw new Error('Status update rejected');router.refresh()}catch(e){setError(e instanceof Error?e.message:'Error')}finally{setBusy(false)}}}>{busy?'Saving…':`Mark ${next.toLowerCase()}`}</button>{error&&<p role="alert">{error}</p>}</div>;
}
