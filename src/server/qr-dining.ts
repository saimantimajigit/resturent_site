import 'server-only';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {db} from './db';
import {allowQrRequest} from './auth-rate-limit';

export const QR_GUEST_COOKIE='savore_qr_access';
const QR_GUEST_TTL_MS=45*60_000;

export class QrDiningError extends Error {
  constructor(readonly code:string,message:string,readonly status=400){super(message)}
}

function hash(value:string){return createHash('sha256').update(value).digest('hex')}
function newToken(){return randomBytes(32).toString('hex')}

export async function rotateTableQr(args:{restaurantId:string;tableId:string;actorUserId:string;rotate:boolean}){
  const rawCode=newToken();
  const token=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id=${args.tableId}::uuid AND "restaurantId"=${args.restaurantId}::uuid FOR UPDATE`;
    const table=await tx.diningTable.findFirst({where:{id:args.tableId,restaurantId:args.restaurantId,active:true,diningZoneRef:{active:true}},select:{id:true,label:true}});
    if(!table)throw new QrDiningError('TABLE_NOT_FOUND','Active table not found.',404);
    const active=await tx.tableToken.findFirst({where:{diningTableId:table.id,active:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
    if(active&&!args.rotate)throw new QrDiningError('QR_ALREADY_PROVISIONED','This table already has an active QR code. Rotate it to replace the code.',409);
    if(active)await tx.tableToken.updateMany({where:{diningTableId:table.id,active:true},data:{active:false}});
    const created=await tx.tableToken.create({data:{diningTableId:table.id,tokenHash:hash(rawCode)}});
    await tx.auditLog.create({data:{restaurantId:args.restaurantId,actorUserId:args.actorUserId,action:args.rotate?'TABLE_QR_ROTATED':'TABLE_QR_PROVISIONED',resource:'TableToken',resourceId:created.id,after:{tableId:table.id},requestId:randomUUID()}});
    return {id:created.id,table};
  },{isolationLevel:'Serializable'});
  return {id:token.id,table:token.table,url:`/qr/${rawCode}`};
}

async function closeSessionInTransaction(tx:any,sessionId:string,restaurantId:string,actorUserId:string,event='QR_SESSION_CLOSED'){
  await tx.$queryRaw`SELECT id FROM "DiningSession" WHERE id=${sessionId}::uuid AND "restaurantId"=${restaurantId}::uuid FOR UPDATE`;
  const session=await tx.diningSession.findFirst({where:{id:sessionId,restaurantId},select:{id:true,status:true,reservationId:true}});
  if(!session)throw new QrDiningError('QR_SESSION_NOT_FOUND','Dining session not found.',404);
  if(session.status==='ACTIVE'){
    await tx.diningSession.update({where:{id:session.id},data:{status:'CLOSED',closedAt:new Date()}});
    await tx.diningGuestToken.updateMany({where:{diningSessionId:session.id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.diningSessionEvent.create({data:{diningSessionId:session.id,actorUserId,event}});
  }
  return {id:session.id,status:session.status==='ACTIVE'?'CLOSED':session.status};
}

export async function activateTableQrSession(args:{restaurantId:string;tableId:string;actorUserId:string}){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id=${args.tableId}::uuid AND "restaurantId"=${args.restaurantId}::uuid FOR UPDATE`;
    const table=await tx.diningTable.findFirst({where:{id:args.tableId,restaurantId:args.restaurantId,active:true,diningZoneRef:{active:true}},select:{id:true,label:true}});
    if(!table)throw new QrDiningError('TABLE_NOT_FOUND','Active table not found.',404);
    const qr=await tx.tableToken.findFirst({where:{diningTableId:table.id,active:true,OR:[{expiresAt:null},{expiresAt:{gt:new Date()}}]},select:{id:true}});
    if(!qr)throw new QrDiningError('QR_NOT_PROVISIONED','Provision a QR code for this table first.',409);
    const now=new Date();
    const occupancy=await tx.tableOccupancy.findFirst({where:{restaurantId:args.restaurantId,diningTableId:table.id,active:true,startsAt:{lte:now},endsAt:{gt:now}},include:{reservationTableRef:{include:{reservationRef:true}}}});
    if(!occupancy||occupancy.reservationTableRef.reservationRef.status!=='SEATED')throw new QrDiningError('TABLE_NOT_OCCUPIED','QR ordering can only be activated for a currently seated table.',409);
    const reservation=occupancy.reservationTableRef.reservationRef;
    const existing=await tx.diningSession.findFirst({where:{restaurantId:args.restaurantId,diningTableId:table.id,status:'ACTIVE',expiresAt:{gt:now}}});
    if(existing){
      if(existing.reservationId!==reservation.id)throw new QrDiningError('QR_SESSION_CONFLICT','This table has another active dining session.',409);
      return {id:existing.id,table:table.label,status:existing.status,expiresAt:existing.expiresAt.toISOString()};
    }
    const stale=await tx.diningSession.findFirst({where:{restaurantId:args.restaurantId,diningTableId:table.id,status:'ACTIVE'}});
    if(stale)await closeSessionInTransaction(tx,stale.id,args.restaurantId,args.actorUserId,'QR_SESSION_EXPIRED');
    const expiresAt=occupancy.endsAt;
    if(expiresAt<=now)throw new QrDiningError('TABLE_NOT_OCCUPIED','The current seating window has expired.',409);
    const session=await tx.diningSession.create({data:{restaurantId:args.restaurantId,diningTableId:table.id,reservationId:reservation.id,activatedByUserId:args.actorUserId,expiresAt}});
    await tx.diningSessionEvent.create({data:{diningSessionId:session.id,actorUserId:args.actorUserId,event:'QR_SESSION_ACTIVATED',metadata:{tableLabel:table.label}}});
    return {id:session.id,table:table.label,status:session.status,expiresAt:session.expiresAt.toISOString()};
  },{isolationLevel:'Serializable'});
}

export async function closeTableQrSession(args:{restaurantId:string;sessionId:string;actorUserId:string}){
  return db.$transaction(tx=>closeSessionInTransaction(tx,args.sessionId,args.restaurantId,args.actorUserId),{isolationLevel:'Serializable'});
}

export async function revokeTableQr(args:{restaurantId:string;tableId:string;actorUserId:string}){
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DiningTable" WHERE id=${args.tableId}::uuid AND "restaurantId"=${args.restaurantId}::uuid FOR UPDATE`;
    const table=await tx.diningTable.findFirst({where:{id:args.tableId,restaurantId:args.restaurantId},select:{id:true}});
    if(!table)throw new QrDiningError('TABLE_NOT_FOUND','Table not found.',404);
    const tokens=await tx.tableToken.updateMany({where:{diningTableId:table.id,active:true},data:{active:false}});
    const sessions=await tx.diningSession.findMany({where:{restaurantId:args.restaurantId,diningTableId:table.id,status:'ACTIVE'},select:{id:true}});
    for(const session of sessions)await closeSessionInTransaction(tx,session.id,args.restaurantId,args.actorUserId,'QR_ACCESS_REVOKED');
    await tx.auditLog.create({data:{restaurantId:args.restaurantId,actorUserId:args.actorUserId,action:'TABLE_QR_REVOKED',resource:'DiningTable',resourceId:table.id,after:{revokedTokenCount:tokens.count,closedSessionCount:sessions.length},requestId:randomUUID()}});
    return {revokedTokenCount:tokens.count,closedSessionCount:sessions.length};
  },{isolationLevel:'Serializable'});
}

export async function getPublicQrInfo(code:string){
  if(!/^[a-f0-9]{64}$/i.test(code))throw new QrDiningError('QR_NOT_FOUND','This table QR code is not valid.',404);
  const now=new Date();
  const qr=await db.tableToken.findFirst({where:{tokenHash:hash(code),active:true,OR:[{expiresAt:null},{expiresAt:{gt:now}}]},include:{diningTableRef:{include:{restaurantRef:true,diningZoneRef:true}}}});
  if(!qr||!qr.diningTableRef.active||!qr.diningTableRef.diningZoneRef.active)throw new QrDiningError('QR_NOT_FOUND','This table QR code is not valid.',404);
  const session=await db.diningSession.findFirst({where:{restaurantId:qr.diningTableRef.restaurantId,diningTableId:qr.diningTableId,status:'ACTIVE',expiresAt:{gt:now},reservationRef:{status:'SEATED'}},select:{id:true,expiresAt:true}});
  return {table:qr.diningTableRef.label,restaurant:qr.diningTableRef.restaurantRef.name,zone:qr.diningTableRef.diningZoneRef.name,active:Boolean(session),expiresAt:session?.expiresAt.toISOString()??null};
}

export async function claimQrGuestAccess(args:{request:Request;code:string}){
  if(!/^[a-f0-9]{64}$/i.test(args.code))throw new QrDiningError('QR_NOT_FOUND','This table QR code is not valid.',404);
  const codeHash=hash(args.code);
  if(!await allowQrRequest(args.request,'claim',codeHash,12,8))throw new QrDiningError('RATE_LIMITED','Please wait before requesting table access again.',429);
  const now=new Date();
  const qr=await db.tableToken.findFirst({where:{tokenHash:codeHash,active:true,OR:[{expiresAt:null},{expiresAt:{gt:now}}]},include:{diningTableRef:true}});
  if(!qr||!qr.diningTableRef.active)throw new QrDiningError('QR_NOT_FOUND','This table QR code is not valid.',404);
  const session=await db.diningSession.findFirst({where:{restaurantId:qr.diningTableRef.restaurantId,diningTableId:qr.diningTableId,status:'ACTIVE',expiresAt:{gt:now},reservationRef:{status:'SEATED'}},include:{reservationRef:{select:{id:true,guestProfileId:true}},diningTableRef:{select:{label:true}}}});
  if(!session)throw new QrDiningError('QR_SESSION_INACTIVE','Your server has not opened QR ordering for this table.',409);
  const activeOccupancy=await db.tableOccupancy.findFirst({where:{restaurantId:session.restaurantId,diningTableId:session.diningTableId,reservationTableRef:{reservationId:session.reservationId},active:true,startsAt:{lte:now},endsAt:{gt:now}},select:{id:true}});
  if(!activeOccupancy)throw new QrDiningError('QR_SESSION_INACTIVE','The table is no longer occupied.',409);
  const rawToken=newToken(),expiresAt=new Date(Math.min(session.expiresAt.getTime(),now.getTime()+QR_GUEST_TTL_MS));
  const guestToken=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DiningSession" WHERE id=${session.id}::uuid AND status='ACTIVE' AND "expiresAt">NOW() FOR UPDATE`;
    const current=await tx.diningSession.findFirst({where:{id:session.id,status:'ACTIVE',expiresAt:{gt:new Date()}}});
    if(!current)throw new QrDiningError('QR_SESSION_INACTIVE','The table session has ended.',409);
    const created=await tx.diningGuestToken.create({data:{diningSessionId:current.id,tokenHash:hash(rawToken),expiresAt}});
    await tx.diningSessionEvent.create({data:{diningSessionId:current.id,diningGuestTokenId:created.id,event:'GUEST_ACCESS_ISSUED'}});
    return created;
  },{isolationLevel:'Serializable'});
  return {token:rawToken,tokenId:guestToken.id,expiresAt,table:qr.diningTableRef.label,restaurantId:session.restaurantId};
}

export async function getQrGuestContext(rawToken:string|undefined){
  if(!rawToken)throw new QrDiningError('QR_ACCESS_REQUIRED','Scan the table QR code and start a table session.',401);
  const now=new Date();
  const guestToken=await db.diningGuestToken.findUnique({where:{tokenHash:hash(rawToken)},include:{diningSessionRef:{include:{reservationRef:{select:{id:true,guestProfileId:true,status:true}},diningTableRef:{include:{restaurantRef:true}}}}}});
  const session=guestToken?.diningSessionRef;
  if(!guestToken||guestToken.revokedAt||guestToken.expiresAt<=now||!session||session.status!=='ACTIVE'||session.expiresAt<=now||session.reservationRef.status!=='SEATED'||!session.diningTableRef.active)throw new QrDiningError('QR_ACCESS_EXPIRED','This table session has ended. Scan the QR code again or ask your server for help.',401);
  const occupancy=await db.tableOccupancy.findFirst({where:{restaurantId:session.restaurantId,diningTableId:session.diningTableId,reservationTableRef:{reservationId:session.reservationId},active:true,startsAt:{lte:now},endsAt:{gt:now}},select:{id:true}});
  if(!occupancy)throw new QrDiningError('QR_ACCESS_EXPIRED','This table session has ended. Scan the QR code again or ask your server for help.',401);
  return {guestTokenId:guestToken.id,session,table:session.diningTableRef.label,restaurant:session.diningTableRef.restaurantRef.name,guestProfileId:session.reservationRef.guestProfileId};
}

export async function qrMenu(restaurantId:string){
  const rows=await db.menuItem.findMany({where:{status:'PUBLISHED',menuCategoryRef:{menuRef:{restaurantId,published:true}}},include:{menuCategoryRef:true,MenuItemPrice_menuItemId:{where:{effectiveTo:null},orderBy:{effectiveFrom:'desc'},take:1},MenuItemAllergen_menuItemId:{include:{allergenRef:true}},MenuAvailability_menuItemId:true},orderBy:[{menuCategoryRef:{sortOrder:'asc'}},{name:'asc'}],take:150});
  return rows.map(item=>({id:item.id,slug:item.slug,name:item.name,description:item.description,category:item.menuCategoryRef.name,priceMinor:item.MenuItemPrice_menuItemId[0]?.amountMinor.toString()??null,currency:item.MenuItemPrice_menuItemId[0]?.currency??'INR',vegetarian:item.vegetarian,dietaryLabels:item.dietaryLabels,available:item.MenuAvailability_menuItemId[0]?.available??true,allergens:item.MenuItemAllergen_menuItemId.map(link=>link.allergenRef.name),imageUrl:item.imageUrl}));
}

export async function createQrAssistance(args:{guestTokenId:string;sessionId:string;restaurantId:string;tableId:string;type:'WAITER'|'WATER'|'BILL'|'CUTLERY'}){
  const type=args.type==='CUTLERY'?'OTHER':args.type;
  return db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "DiningSession" WHERE id=${args.sessionId}::uuid AND "restaurantId"=${args.restaurantId}::uuid FOR UPDATE`;
    const session=await tx.diningSession.findFirst({where:{id:args.sessionId,restaurantId:args.restaurantId,diningTableId:args.tableId,status:'ACTIVE',expiresAt:{gt:new Date()},reservationRef:{status:'SEATED'}}});
    const token=await tx.diningGuestToken.findFirst({where:{id:args.guestTokenId,diningSessionId:args.sessionId,revokedAt:null,expiresAt:{gt:new Date()}}});
    if(!session||!token)throw new QrDiningError('QR_ACCESS_EXPIRED','This table session has ended.',401);
    const open=await tx.assistanceRequest.findFirst({where:{diningSessionId:session.id,diningGuestTokenId:token.id,status:'OPEN',type},select:{id:true}});
    if(open)throw new QrDiningError('ASSISTANCE_ALREADY_OPEN','Your request is already with the service team.',409);
    const request=await tx.assistanceRequest.create({data:{restaurantId:args.restaurantId,diningTableId:args.tableId,diningSessionId:session.id,diningGuestTokenId:token.id,type,metadata:{requestType:args.type,source:'QR_GUEST'}}});
    await tx.diningSessionEvent.create({data:{diningSessionId:session.id,diningGuestTokenId:token.id,event:'ASSISTANCE_REQUESTED',metadata:{assistanceRequestId:request.id,requestType:args.type}}});
    return {id:request.id,type:args.type,status:request.status};
  },{isolationLevel:'Serializable'});
}

export async function getQrOrder(args:{orderId:string;sessionId:string;restaurantId:string}){
  const order=await db.order.findFirst({where:{id:args.orderId,restaurantId:args.restaurantId,diningSessionId:args.sessionId,type:'DINE_IN'},include:{OrderItem_orderId:true,KitchenTicket_orderId:{select:{status:true}},diningSessionRef:{include:{diningTableRef:{select:{label:true}}}}}});
  if(!order)throw new QrDiningError('ORDER_NOT_FOUND','Order not found for this table session.',404);
  return {id:order.id,reference:order.reference,status:order.status,createdAt:order.createdAt.toISOString(),table:order.diningSessionRef?.diningTableRef.label??'—',items:order.OrderItem_orderId.map(item=>({name:item.nameSnapshot,quantity:item.quantity,notes:item.notes,allergens:Array.isArray(item.allergenSnapshot)?item.allergenSnapshot:[]})),kitchen:order.KitchenTicket_orderId[0]?.status??'NEW'};
}
