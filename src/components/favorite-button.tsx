'use client';

import {useState} from 'react';
export default function FavoriteButton({dishId,initiallySaved=false}:{dishId:string;initiallySaved?:boolean}){
 const [saved,setSaved]=useState(initiallySaved);const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function toggle(){setBusy(true);setMessage('');try{const response=await fetch('/api/v1/customer/favorites',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dishId,action:saved?'remove':'save'})});const result=await response.json();if(response.status===401){setMessage('Sign in to save favorites.');return;}if(!response.ok)throw new Error(result.error?.message||'Could not update favorites.');setSaved(!saved);}catch(error){setMessage(error instanceof Error?error.message:'Could not update favorites.');}finally{setBusy(false);}}
 return <div className="favorite-control"><button className="button button-outline favorite-button" type="button" onClick={toggle} disabled={busy} aria-pressed={saved}>{saved?'Saved to favorites':'Save to favorites'}</button>{message?<p className="form-hint" role="status">{message} {message.startsWith('Sign in')?<a href="/login">Sign in</a>:null}</p>:null}</div>;
}
