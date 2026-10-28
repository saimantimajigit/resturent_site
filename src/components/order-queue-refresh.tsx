'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
export default function OrderQueueRefresh(){const router=useRouter();useEffect(()=>{const timer=setInterval(()=>router.refresh(),15000);return()=>clearInterval(timer)},[router]);return <p className="muted">Queue refreshes every 15 seconds.</p>}
