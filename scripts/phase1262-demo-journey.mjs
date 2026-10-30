import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const envPath = resolve(process.cwd(), '.env.client-demo');
if (!existsSync(envPath)) throw new Error('Run npm run demo:prepare before preparing the connected demo.');
const env = dotenv.parse(readFileSync(envPath));
const base = process.env.SAVORE_DEMO_BASE_URL || env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3015';
const origin = new URL(base);
const database = decodeURIComponent(new URL(env.DATABASE_URL || '').pathname.slice(1));
if (!/^savore_client_demo_[a-z0-9_]+$/.test(database) || origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(origin.hostname)) {
  throw new Error('The connected demo requires the isolated local demo database and a loopback HTTP origin.');
}

const client = new pg.Client({ connectionString: env.DATABASE_URL, application_name: 'savore-phase1262-demo-journey' });
await client.connect();
const cookies = new Map();
const idempotencyKey = `phase1262-${randomUUID()}`;
const fixturePrefix = 'Phase 12.6.2 guided demo';
const prepareOnly = process.argv.includes('--prepare-only');

function check(label, condition) {
  if (!condition) throw new Error(`Connected demo step failed: ${label}`);
  console.log(`PASS ${label}`);
}

async function request(path, { method = 'GET', role, cookie, body, headers = {}, redirect = 'manual' } = {}) {
  const values = { ...headers };
  if (body !== undefined) values['Content-Type'] = 'application/json';
  if (method !== 'GET') values.Origin = origin.origin;
  const activeCookie = cookie || (role ? cookies.get(role) : undefined);
  if (activeCookie) values.Cookie = activeCookie;
  const response = await fetch(new URL(path, origin), {
    method, headers: values, redirect,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}

function setCookie(response, name) {
  const header = response.headers.getSetCookie?.().find((value) => value.startsWith(`${name}=`));
  return header?.split(';', 1)[0] || '';
}

async function json(response, expected, label) {
  const value = await response.json().catch(() => ({}));
  check(label, response.status === expected);
  if (!response.ok) throw new Error(`Connected demo step failed: ${label} (HTTP ${response.status})`);
  return value.data ?? value;
}

async function login(role, email, password, staff = false) {
  const response2 = staff
    ? await fetch(new URL('/api/v1/auth/login', origin), {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin.origin },
      body: new URLSearchParams({ email, password }), redirect: 'manual',
    })
    : await request('/api/v1/customer/login', { method: 'POST', body: { email, password } });
  const expected = staff ? 303 : 200;
  const session = setCookie(response2, 'savore_session');
  if (response2.status !== expected || !session) {
    throw new Error(`Connected demo step failed: ${role} authentication returned HTTP ${response2.status}.`);
  }
  check(`${role} authentication`, true);
  cookies.set(role, session);
}

function kolkataDate(daysAhead) {
  const shifted = new Date(Date.now() + 330 * 60_000);
  shifted.setUTCDate(shifted.getUTCDate() + daysAhead);
  return shifted.toISOString().slice(0, 10);
}

function persistQrEnvironment(updates) {
  let contents = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const assignment = `${key}=${JSON.stringify(value)}`;
    const matcher = new RegExp(`^${key}=.*$`, 'm');
    contents = matcher.test(contents)
      ? contents.replace(matcher, assignment)
      : `${contents.replace(/\s*$/, '')}\n${assignment}\n`;
  }
  writeFileSync(envPath, contents, { mode: 0o600 });
}

async function currentFreeTable(partySize = 2, reservationId = null) {
  const available = await client.query(
    `SELECT t.id, t.label FROM "DiningTable" t
     JOIN "DiningZone" z ON z.id=t."diningZoneId" AND z.active
     WHERE t."restaurantId"=$1::uuid AND t.active AND t."minCapacity"<=$2 AND t."maxCapacity">=$2
       AND NOT EXISTS (
         SELECT 1 FROM "TableOccupancy" o JOIN "ReservationTable" a ON a.id=o."reservationTableId"
         WHERE o."diningTableId"=t.id AND o.active AND (
           (o."startsAt"<=now() AND o."endsAt">now())
           OR ($3::uuid IS NOT NULL AND a."reservationId"<>$3::uuid
             AND o."startsAt"<(SELECT "endsAt" FROM "Reservation" WHERE id=$3::uuid)
             AND o."endsAt">(SELECT "startsAt" FROM "Reservation" WHERE id=$3::uuid))
         )
       )
     ORDER BY t.label LIMIT 1`, [env.RESTAURANT_ID, partySize, reservationId],
  );
  return available.rows[0];
}

try {
  await login('customer', 'customer.demo@savore.example.test', env.DEMO_CUSTOMER_PASSWORD);
  await login('host', 'host.demo@savore.example.test', env.DEMO_HOST_PASSWORD, true);
  if (!prepareOnly) {
    await login('waiter', 'waiter.demo@savore.example.test', env.DEMO_WAITER_PASSWORD, true);
    await login('chef', 'chef.demo@savore.example.test', env.DEMO_CHEF_PASSWORD, true);
    await login('manager', 'manager.demo@savore.example.test', env.DEMO_MANAGER_PASSWORD, true);
    await login('owner', 'owner.demo@savore.example.test', env.DEMO_OWNER_PASSWORD, true);
  }

  const hostView = await request('/staff/host', { role: 'host' });
  check('host dashboard authorization and response', hostView.status === 200);
  if (!prepareOnly) {
    const ownerView = await request('/staff/admin/team', { role: 'owner' });
    check('owner staff-management screen authorization and response', ownerView.status === 200);
    const managerView = await request('/api/v1/staff/admin/reports', { role: 'manager' });
    check('manager reporting API authorization and response', managerView.status === 200);
  }

  let fixture = await client.query(
    `SELECT r.id, r.status, r.notes, r."startsAt", r."endsAt", a.id AS assignment_id,
            a."diningTableId" AS table_id, a."waiterMembershipId" AS waiter_id, t.label AS table_label,
            o.id AS occupancy_id, o.active AS occupancy_active,
            (o."startsAt" <= now() AND o."endsAt" > now()) AS occupancy_current,
            s.id AS session_id, s.status AS session_status, s."expiresAt" AS session_expires,
            (s."expiresAt" > now()) AS session_current
     FROM "Reservation" r
     LEFT JOIN LATERAL (
       SELECT a.* FROM "ReservationTable" a LEFT JOIN "TableOccupancy" ao ON ao."reservationTableId"=a.id
       WHERE a."reservationId"=r.id
       ORDER BY (ao.active AND ao."startsAt"<=now() AND ao."endsAt">now()) DESC, a."startsAt" DESC LIMIT 1
     ) a ON true
     LEFT JOIN "DiningTable" t ON t.id=a."diningTableId"
     LEFT JOIN "TableOccupancy" o ON o."reservationTableId"=a.id
     LEFT JOIN LATERAL (SELECT * FROM "DiningSession" WHERE "reservationId"=r.id ORDER BY "activatedAt" DESC LIMIT 1) s ON true
     WHERE r."restaurantId"=$1::uuid AND r.notes LIKE $2
       AND r.status IN ('CONFIRMED','ARRIVED','SEATED')
     ORDER BY r."createdAt" DESC LIMIT 1`, [env.RESTAURANT_ID, `${fixturePrefix}%`],
  );
  fixture = fixture.rows[0];

  let hasCurrentFixture = fixture?.status === 'SEATED' && fixture.occupancy_active
    && fixture.occupancy_current;

  if (!hasCurrentFixture && fixture?.status === 'SEATED') {
    // An expired fixture is historical. Keep it intact and provision a new reservation.
    fixture = undefined;
  }

  if (!fixture) {
    const date = kolkataDate(1);
    const booking = await json(await request('/api/v1/reservations', {
      method: 'POST', role: 'customer',
      body: { date, time: '18:00', partySize: 2, name: 'Aarav Mehta', email: 'customer.demo@savore.example.test', notes: `${fixturePrefix} ${idempotencyKey}` },
    }), 201, 'customer creates a policy-valid next-service-day reservation');
    const reservationId = booking.id;
    const assignment = await client.query(
      `SELECT a.id, a."diningTableId" AS table_id, t.label AS table_label
       FROM "ReservationTable" a JOIN "DiningTable" t ON t.id=a."diningTableId"
       WHERE a."reservationId"=$1::uuid ORDER BY a."startsAt" DESC LIMIT 1`, [reservationId],
    );
    if (!assignment.rowCount) throw new Error('New reservation has no table assignment.');
    fixture = { id: reservationId, ...assignment.rows[0], status: booking.status };
    const waiter = await client.query(
      `SELECT m.id FROM "StaffMembership" m JOIN "User" u ON u.id=m."userId"
       WHERE m."restaurantId"=$1::uuid AND m.status='ACTIVE' AND u.email=$2 LIMIT 1`,
      [env.RESTAURANT_ID, 'waiter.demo@savore.example.test'],
    );
    if (!waiter.rowCount) throw new Error('The active demo waiter membership is missing.');
    const freeTable = await currentFreeTable(2, fixture.id);
    if (!freeTable) throw new Error('No currently free two-person table is available for the demo fixture; existing occupancy was preserved.');
    const assigned = await request(`/api/v1/staff/reservations/${reservationId}`, {
      method: 'PATCH', role: 'host', body: { action: 'ASSIGN_TABLE', tableId: freeTable.id, waiterMembershipId: waiter.rows[0].id },
    });
    await json(assigned, 200, 'host confirms table assignment and waiter ownership');
    fixture.table_id = freeTable.id;
    fixture.table_label = freeTable.label;
    fixture.waiter_id = waiter.rows[0].id;
    const arrived = await request(`/api/v1/staff/reservations/${reservationId}/status`, { method: 'POST', role: 'host', body: { status: 'ARRIVED' } });
    await json(arrived, 200, 'host checks in the customer reservation');
    const seated = await request(`/api/v1/staff/reservations/${reservationId}/status`, { method: 'POST', role: 'host', body: { status: 'SEATED' } });
    await json(seated, 200, 'host seats the guest through the reservation workflow');
    const current = await client.query(
      `SELECT o.id, o."startsAt", o."endsAt", t.label,
              (o."startsAt" <= now() AND o."endsAt" > now()) AS is_current FROM "TableOccupancy" o
       JOIN "ReservationTable" a ON a.id=o."reservationTableId" JOIN "DiningTable" t ON t.id=o."diningTableId"
       WHERE a."reservationId"=$1::uuid AND o.active ORDER BY o."startsAt" DESC LIMIT 1`, [reservationId],
    );
    if (!current.rowCount || !current.rows[0].is_current) {
      throw new Error('Host seating did not produce a current valid occupancy window.');
    }
    fixture.table_label = current.rows[0].label;
    fixture.occupancy_id = current.rows[0].id;
    hasCurrentFixture = true;
  } else if (fixture.status !== 'SEATED') {
    if (fixture.status === 'CONFIRMED') {
      const arrived = await request(`/api/v1/staff/reservations/${fixture.id}/status`, { method: 'POST', role: 'host', body: { status: 'ARRIVED' } });
      await json(arrived, 200, 'host resumes check-in for the marked demo reservation');
    }
    const freeTable = await currentFreeTable(2, fixture.id);
    if (!freeTable) throw new Error('No currently free two-person table is available for the marked demo seating; existing occupancy was preserved.');
    if (freeTable.id !== fixture.table_id) {
      const reassigned = await request(`/api/v1/staff/reservations/${fixture.id}`, {
        method: 'PATCH', role: 'host', body: { action: 'ASSIGN_TABLE', tableId: freeTable.id },
      });
      await json(reassigned, 200, 'host assigns a currently free table before seating');
      fixture.table_id = freeTable.id;
      fixture.table_label = freeTable.label;
    }
    const seated = await request(`/api/v1/staff/reservations/${fixture.id}/status`, { method: 'POST', role: 'host', body: { status: 'SEATED' } });
    await json(seated, 200, 'host seats the marked demo reservation');
    hasCurrentFixture = true;
  }

  if (!hasCurrentFixture) throw new Error('No current, policy-valid seated demo reservation is available.');

  const currentWaiter = await client.query(
    `SELECT m.id FROM "StaffMembership" m JOIN "User" u ON u.id=m."userId"
     WHERE m."restaurantId"=$1::uuid AND m.status='ACTIVE' AND u.email=$2 LIMIT 1`,
    [env.RESTAURANT_ID, 'waiter.demo@savore.example.test'],
  );
  if (!currentWaiter.rowCount) throw new Error('The active demo waiter membership is missing.');
  if (fixture.waiter_id !== currentWaiter.rows[0].id) {
    const assignedWaiter = await request(`/api/v1/staff/reservations/${fixture.id}`, {
      method: 'PATCH', role: 'host', body: { action: 'ASSIGN_TABLE', tableId: fixture.table_id, waiterMembershipId: currentWaiter.rows[0].id },
    });
    await json(assignedWaiter, 200, 'host assigns the current table to the demo waiter');
    fixture.waiter_id = currentWaiter.rows[0].id;
  }

  const tokenMatchesTable = env.DEMO_QR_ACTIVE_TABLE_ID === fixture.table_id;
  if (!fixture.session_id || fixture.session_status !== 'ACTIVE' || !fixture.session_current || !tokenMatchesTable) {
    const qr = await request(`/api/v1/staff/qr/tables/${fixture.table_id}`, { method: 'POST', role: 'host', body: { action: 'ROTATE_QR' } });
    const provisioned = await json(qr, 200, 'host rotates the demo table QR identity');
    const code = String(provisioned.url || '').split('/').pop();
    if (!/^[a-f0-9]{64}$/i.test(code)) throw new Error('QR activation did not return a valid local QR identity.');
    const activated = await request(`/api/v1/staff/qr/tables/${fixture.table_id}`, { method: 'POST', role: 'host', body: { action: 'ACTIVATE_SESSION' } });
    const session = await json(activated, 200, 'host activates QR ordering for the currently occupied table');
    env.DEMO_QR_ACTIVE_TOKEN = code;
    env.DEMO_QR_ACTIVE_TABLE_ID = fixture.table_id;
    env.DEMO_QR_ACTIVE_TABLE_LABEL = fixture.table_label;
    persistQrEnvironment({
      DEMO_QR_ACTIVE_TOKEN: code,
      DEMO_QR_ACTIVE_TABLE_ID: fixture.table_id,
      DEMO_QR_ACTIVE_TABLE_LABEL: fixture.table_label,
    });
    fixture.session_id = session.id;
    fixture.session_status = 'ACTIVE';
    console.log('PASS rotated QR token stored in the ignored demo environment file (value withheld)');
  }

  const guestCode = env.DEMO_QR_ACTIVE_TOKEN || env.DEMO_QR_T03_TOKEN;
  if (!/^[a-f0-9]{64}$/i.test(guestCode || '')) throw new Error('No local demo QR token is configured; prepare a fresh one through staff QR management.');
  const qrPage = await request(`/qr/${guestCode}`);
  check('fresh QR welcome page responds', qrPage.status === 200);
  const claim = await request('/api/v1/qr/claim', { method: 'POST', body: { code: guestCode } });
  const guestCookie = setCookie(claim, 'savore_qr_access');
  const claimData = await json(claim, 200, 'guest claims the currently active table QR session');
  if (!guestCookie || !claimData) throw new Error('QR guest access was not issued.');
  const menu = await json(await request('/api/v1/qr/menu', { cookie: guestCookie }), 200, 'guest reads the QR menu');

  if (prepareOnly) {
    console.log(`QR demo ready for ${fixture.table_label}; current occupancy and staff activation verified. Token and URL withheld.`);
    process.exitCode = 0;
  } else {
    let orderRow = await client.query(
      `SELECT id, status FROM "Order" WHERE "diningSessionId"=$1::uuid AND "idempotencyKey" LIKE 'phase1262-%'
       ORDER BY "createdAt" DESC LIMIT 1`, [fixture.session_id],
    );
    let orderId = orderRow.rows[0]?.id;
    let orderStatus = orderRow.rows[0]?.status;
    if (!orderId) {
      const chosen = menu.items?.find((item) => item.available && item.priceMinor) || menu.items?.[0];
      if (!chosen) throw new Error('The QR menu has no orderable item.');
      const order = await json(await request('/api/v1/qr/orders', {
        method: 'POST', cookie: guestCookie, headers: { 'Idempotency-Key': idempotencyKey },
        body: { items: [{ menuItemId: chosen.id, quantity: 1 }] },
      }), 201, 'guest submits a tableside order');
      orderId = order.id;
      orderStatus = order.status;
    } else {
      console.log('Resuming the marked demo order from its current persisted status.');
    }
    const ticket = await client.query('SELECT id FROM "KitchenTicket" WHERE "orderId"=$1::uuid', [orderId]);
    check('order created a linked kitchen ticket in PostgreSQL', ticket.rowCount === 1);
    if (orderStatus === 'PLACED') {
      await json(await request(`/api/v1/staff/orders/${orderId}/status`, { method: 'POST', role: 'manager', body: { status: 'ACCEPTED' } }), 200, 'manager accepts the order');
      orderStatus = 'ACCEPTED';
    }
    if (orderStatus === 'ACCEPTED') {
      await json(await request(`/api/v1/staff/orders/${orderId}/status`, { method: 'POST', role: 'chef', body: { status: 'PREPARING' } }), 200, 'chef starts preparation');
      orderStatus = 'PREPARING';
    }
    if (orderStatus === 'PREPARING') {
      await json(await request(`/api/v1/staff/orders/${orderId}/status`, { method: 'POST', role: 'chef', body: { status: 'READY' } }), 200, 'chef marks the kitchen ticket ready');
      orderStatus = 'READY';
    }
    let assistanceRow = await client.query(
      `SELECT id, status FROM "AssistanceRequest" WHERE "diningSessionId"=$1::uuid AND type='WAITER' ORDER BY "createdAt" DESC LIMIT 1`,
      [fixture.session_id],
    );
    if (!assistanceRow.rowCount) {
      const assistance = await json(await request('/api/v1/qr/assistance', { method: 'POST', cookie: guestCookie, body: { type: 'WAITER' } }), 201, 'guest requests waiter assistance');
      assistanceRow = { rows: [{ id: assistance.id, status: 'OPEN' }], rowCount: 1 };
    }
    if (assistanceRow.rows[0].status === 'OPEN') {
      const handled = await request(`/api/v1/staff/service/assistance/${assistanceRow.rows[0].id}`, { method: 'PATCH', role: 'waiter', body: { status: 'COMPLETED' } });
      await json(handled, 200, 'waiter completes the assistance request');
    }
    if (orderStatus !== 'SERVED') {
      await json(await request(`/api/v1/staff/orders/${orderId}/status`, { method: 'POST', role: 'manager', body: { status: 'SERVED' } }), 200, 'manager records order service completion');
      orderStatus = 'SERVED';
    }
    const tracking = await json(await request(`/api/v1/qr/orders/${orderId}`, { cookie: guestCookie }), 200, 'guest tracking reflects kitchen and service updates');
    check('guest tracking shows served order and ready kitchen state', tracking.status === 'SERVED' && tracking.kitchen === 'READY');
    await json(await request(`/api/v1/staff/reservations/${fixture.id}/status`, { method: 'POST', role: 'host', body: { status: 'COMPLETED' } }), 200, 'host records guest departure and releases occupancy');
    const persisted = await client.query(
      `SELECT r.status AS reservation_status, o.status AS order_status,
              k.status AS kitchen_status, a.status AS assistance_status,
              s.status AS session_status, occ.active AS occupancy_active
       FROM "Reservation" r
       JOIN "Order" o ON o."reservationId"=r.id
       JOIN "KitchenTicket" k ON k."orderId"=o.id
       JOIN "AssistanceRequest" a ON a."diningSessionId"=o."diningSessionId"
       JOIN "DiningSession" s ON s.id=o."diningSessionId"
       JOIN "ReservationTable" rt ON rt."reservationId"=r.id
       JOIN "TableOccupancy" occ ON occ."reservationTableId"=rt.id
       WHERE r.id=$1::uuid AND o.id=$2::uuid AND a.id=$3::uuid`, [fixture.id, orderId, assistanceRow.rows[0].id],
    );
    const state = persisted.rows[0];
    check('final persisted state records guest departure and closes occupancy/session', state?.reservation_status === 'COMPLETED' && state.order_status === 'SERVED' && state.kitchen_status === 'READY' && state.assistance_status === 'COMPLETED' && state.session_status === 'CLOSED' && state.occupancy_active === false);
    await json(await request('/api/v1/staff/admin/reports', { role: 'manager' }), 200, 'manager report remains available after service');
    console.log(`Connected journey completed. Reservation ${fixture.id}; order ${orderId}; database state verified. QR token withheld.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Connected demo failed.');
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
