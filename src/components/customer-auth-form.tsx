'use client';

import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';

export default function CustomerAuthForm({mode}:{mode:'login'|'register'}){
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);const router=useRouter();
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');
  const values=Object.fromEntries(new FormData(event.currentTarget));
  try{
   const response=await fetch(`/api/v1/customer/${mode}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error?.message||'Please try again.');
   router.push('/account');router.refresh();
  }catch(problem){setError(problem instanceof Error?problem.message:'Please try again.');}
  finally{setBusy(false);}
 }
 return <form className="reservation-form" onSubmit={submit}>
  {mode==='register'?<label className="field field-full"><span>Your name</span><input name="name" autoComplete="name" required minLength={2} maxLength={100}/></label>:null}
  <label className="field field-full"><span>Email address</span><input type="email" name="email" autoComplete="email" required/></label>
  {mode==='register'?<label className="field field-full"><span>Phone <small>(optional)</small></span><input type="tel" name="phone" autoComplete="tel" maxLength={30}/></label>:null}
  <label className="field field-full"><span>Password {mode==='register'?<small>(at least 12 characters)</small>:null}</span><input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='register'?12:1}/></label>
  {error?<p className="form-message" role="alert">{error}</p>:null}
  <button className="button button-forest field-full" disabled={busy}>{busy?'One moment…':mode==='login'?'Sign in':'Create your account'}</button>
 </form>;
}
