import {staffPageContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import FloorLiveBoard from '@/components/floor-live-board';

export const dynamic='force-dynamic';
export default async function GuestCheckIn(){const context=await staffPageContext(['HOST','MANAGER','OWNER']);const board=await getFloorBoard(context.restaurantId);return <main className="layout"><p className="eyebrow">Front of house</p><h1>Guest check-in</h1><p className="muted">Record arrival, seating, no-shows, and completed service.</p><FloorLiveBoard initial={board} mode="checkin"/></main>}
