import {getFloorBoard} from '@/server/floor-operations';
import {staffContext} from '@/server/staff-context';
import FloorLiveBoard from '@/components/floor-live-board';

export const dynamic='force-dynamic';
export default async function HostDashboard(){
  const context=await staffContext(['HOST','MANAGER','OWNER']);
  const board=await getFloorBoard(context.restaurantId);
  return <main className="layout"><p className="eyebrow">Front of house</p><h1>Host dashboard</h1><p className="muted">Today’s arrivals, floor occupancy, and service alerts.</p><FloorLiveBoard initial={board} mode="dashboard"/></main>;
}
