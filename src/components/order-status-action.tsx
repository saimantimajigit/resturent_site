'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export default function OrderStatusAction({id,status,options}:{id:string;status:string;options:string[]}){
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const router=useRouter();const next=options.filter(option=>option!==status);
 if(!next.length)return <span className="status-pill">{status.toLowerCase()}</span>;
 return <div className="stack"><div className="dietary-badges">{next.map(value=><button key={value} className="button button-small button-forest" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const response=await fetch(`/api/v1/staff/orders/${id}/status`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:value})});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Status update rejected.');router.refresh()}catch(e){setError(e instanceof Error?e.message:'Could not update status.')}finally{setBusy(false)}}}>{busy?'Saving…':value.toLowerCase().replaceAll('_',' ')}</button>)}</div>{error?<p role="alert">{error}</p>:null}</div>;
}
