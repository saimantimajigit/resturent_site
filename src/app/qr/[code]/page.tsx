import {notFound} from 'next/navigation';
import {QrEntry} from '@/components/qr-entry';
import {getPublicQrInfo,QrDiningError} from '@/server/qr-dining';

export const dynamic='force-dynamic';
export default async function QrTableEntry({params}:{params:Promise<{code:string}>}){
  const {code}=await params;
  try{const info=await getPublicQrInfo(code);return <QrEntry code={code} restaurant={info.restaurant} table={info.table} active={info.active}/>}
  catch(error){if(error instanceof QrDiningError&&error.status===404)notFound();throw error}
}
