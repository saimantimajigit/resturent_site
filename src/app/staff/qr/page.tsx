import {requireRole} from '@/server/session';
import {db} from '@/server/db';
import {QrStaffManager} from '@/components/qr-staff-manager';

export const dynamic='force-dynamic';
export default async function StaffQrPage(){
  await requireRole(['HOST','MANAGER','OWNER']);const restaurantId=process.env.RESTAURANT_ID!,now=new Date();
  const [tables,occupancies,sessions]=await Promise.all([
    db.diningTable.findMany({where:{restaurantId,active:true,diningZoneRef:{active:true}},include:{diningZoneRef:true,TableToken_diningTableId:{where:{active:true,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}},orderBy:[{diningZoneRef:{sortOrder:'asc'}},{label:'asc'}]}),
    db.tableOccupancy.findMany({where:{restaurantId,active:true,startsAt:{lte:now},endsAt:{gt:now}},include:{reservationTableRef:{include:{reservationRef:{select:{status:true}}}}}}),
    db.diningSession.findMany({where:{restaurantId,status:'ACTIVE',expiresAt:{gt:now}},select:{id:true,diningTableId:true,expiresAt:true}})
  ]);
  const occupied=new Set(occupancies.filter(row=>row.reservationTableRef.reservationRef.status==='SEATED').map(row=>row.diningTableId));
  const sessionByTable=new Map(sessions.map(row=>[row.diningTableId,{id:row.id,expiresAt:row.expiresAt.toISOString()}]));
  const rows=tables.map(table=>({id:table.id,label:table.label,zone:table.diningZoneRef.name,occupied:occupied.has(table.id),hasQr:table.TableToken_diningTableId.length>0,session:sessionByTable.get(table.id)??null}));
  return <main className="content-width"><section className="page-intro"><div className="page-intro-inner"><p className="eyebrow">Reception · Guest technology</p><h1>QR table ordering</h1><p>Provision table identities, open ordering for seated guests, and close access when service ends.</p></div></section><section className="content-width staff-qr-content"><p className="muted">Static table codes identify a table only. Guests receive separate, short-lived access after a host opens a seated session. Rotating a code invalidates the old print; ending a session revokes guest access.</p><QrStaffManager initialTables={rows}/></section></main>
}
