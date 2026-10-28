import {QrOrderTracking} from '@/components/qr-order-tracking';
export default async function QrOrderPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <QrOrderTracking orderId={id}/>}
