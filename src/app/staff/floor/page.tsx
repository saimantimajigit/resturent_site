import {staffPageContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import FloorLiveBoard from '@/components/floor-live-board';

export const dynamic='force-dynamic';
export default async function FloorPlan(){const context=await staffPageContext(['HOST','WAITER','MANAGER','OWNER']);const waiterScope=context.roles.includes('WAITER')&&!context.roles.some(role=>['HOST','MANAGER','OWNER'].includes(role))?context.membership.id:undefined;const board=await getFloorBoard(context.restaurantId,waiterScope);return <main className="layout"><p className="eyebrow">Front of house</p><h1>Floor plan</h1><p className="muted">Table status is derived from active database occupancy.</p><FloorLiveBoard initial={board} mode="floor"/></main>}
