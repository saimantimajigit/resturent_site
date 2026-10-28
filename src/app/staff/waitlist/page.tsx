import {staffContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import FloorLiveBoard from '@/components/floor-live-board';

export const dynamic='force-dynamic';
export default async function Waitlist(){const context=await staffContext(['HOST','MANAGER','OWNER']);const board=await getFloorBoard(context.restaurantId);return <main className="layout"><p className="eyebrow">Front of house</p><h1>Waitlist</h1><p className="muted">Queue order, guest calls, and seating readiness.</p><FloorLiveBoard initial={board} mode="waitlist"/></main>}
