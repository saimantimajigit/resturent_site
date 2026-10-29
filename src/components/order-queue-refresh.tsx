'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';

export default function OrderQueueRefresh({activeCount}:{activeCount?:number}){
 const router=useRouter(),previous=useRef(activeCount);
 const [announcement,setAnnouncement]=useState('');
 useEffect(()=>{const timer=setInterval(()=>router.refresh(),15000);return()=>clearInterval(timer)},[router]);
 useEffect(()=>{if(activeCount!==undefined){if(previous.current!==undefined&&previous.current!==activeCount)setAnnouncement(`Kitchen queue updated. ${activeCount} active ${activeCount===1?'ticket':'tickets'}.`);previous.current=activeCount}},[activeCount]);
 return <><p className="muted">Queue refreshes every 15 seconds.</p><p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p></>;
}
