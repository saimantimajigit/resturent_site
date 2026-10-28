import {staffContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import FloorLiveBoard from '@/components/floor-live-board';

export const dynamic='force-dynamic';
export default async function LiveService(){const context=await staffContext(['HOST','WAITER','MANAGER','OWNER']);const waiterScope=context.roles.includes('WAITER')&&!context.roles.some(role=>['HOST','MANAGER','OWNER'].includes(role))?context.membership.id:undefined;const board=await getFloorBoard(context.restaurantId,waiterScope);return <main className="layout"><p className="eyebrow">Front of house</p><h1>Live service board</h1><p className="muted">Assigned tables, guest assistance, and kitchen progress.</p><FloorLiveBoard initial={board} mode="service"/></main>}
