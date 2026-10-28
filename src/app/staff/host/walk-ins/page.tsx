import {staffContext} from '@/server/staff-context';
import {getFloorBoard} from '@/server/floor-operations';
import {WalkInForm} from '@/components/floor-actions';

export const dynamic='force-dynamic';
export default async function WalkIns(){const context=await staffContext(['HOST','MANAGER','OWNER']);const board=await getFloorBoard(context.restaurantId);return <main className="layout"><p className="eyebrow">Front of house</p><h1>Walk-in registration</h1><p className="muted">Current availability is checked transactionally when you register each party.</p><div className="floor-legend"><span>{board.tables.filter(table=>table.status==='AVAILABLE').length} tables available now</span><span>{board.waitlist.length} parties waiting</span></div><WalkInForm waiters={board.waiters}/></main>}
