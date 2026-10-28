'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';

export function QrEntry({code,restaurant,table,active}:{code:string;restaurant:string;table:string;active:boolean}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function start(){setBusy(true);setMessage('');try{const response=await fetch('/api/v1/qr/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'Could not start table ordering.');router.push(`/qr/${code}/menu`)}catch(error){setMessage(error instanceof Error?error.message:'Could not start table ordering.')}finally{setBusy(false)}}
  return <main className="qr-shell"><section className="qr-welcome"><p className="eyebrow">SAVORÉ · {restaurant}</p><span className="qr-mark" aria-hidden="true">S</span><p className="eyebrow">Your table</p><h1>{table}</h1>{active?<><p className="muted">Your server has opened tableside ordering for this seating.</p><button className="button button-forest" onClick={start} disabled={busy}>{busy?'Connecting…':'Open the digital menu'}</button></>:<><p className="muted">Table ordering is not open yet. Please ask your server to activate this table.</p><button className="button button-forest" onClick={()=>router.refresh()}>Check again</button></>}{message?<p className="form-hint" role="alert">{message}</p>:null}<a className="link-arrow" href="/">Visit SAVORÉ</a></section></main>
}
