import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';

const databaseUrl = process.env.DATABASE_URL;
const restaurantId = process.env.RESTAURANT_ID;
const requiredSecrets = [
  'DEMO_CUSTOMER_PASSWORD', 'DEMO_HOST_PASSWORD', 'DEMO_WAITER_PASSWORD',
  'DEMO_CHEF_PASSWORD', 'DEMO_MANAGER_PASSWORD', 'DEMO_OWNER_PASSWORD',
  'DEMO_QR_T03_TOKEN',
] as const;

if (!databaseUrl || !restaurantId || requiredSecrets.some((key) => !process.env[key])) {
  throw new Error('Client demo environment is incomplete. Run npm run demo:prepare.');
}

const target = new URL(databaseUrl);
if (!/^savore_client_demo_[a-z0-9_]+$/.test(decodeURIComponent(target.pathname.slice(1)))) {
  throw new Error('Client demo seed is restricted to a savore_client_demo_* database.');
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const version = '12.5.0';
const dayKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');

async function main() {
  const run = await db.demoSeedRun.create({ data: { demoEnvironmentId: await getEnvironmentId(), seedVersion: version } });

  try {
    const environment = await db.demoEnvironment.upsert({
      where: { name: 'phase-12.5-client-demo' },
      create: { name: 'phase-12.5-client-demo', seedVersion: version },
      update: { seedVersion: version },
    });

    // The seed run is created after migrations, but before the environment exists on first run.
    await db.demoSeedRun.update({ where: { id: run.id }, data: { demoEnvironmentId: environment.id } });

    const restaurant = await db.restaurant.upsert({
      where: { id: restaurantId! },
      create: {
        id: restaurantId!, demoEnvironmentId: environment.id, name: 'SAVORÉ — Client Demo',
        slug: 'savore-client-demo', timezone: 'Asia/Kolkata', currency: 'INR',
        address: { locality: 'Bengaluru', note: 'Fictional demonstration location' },
      },
      update: { demoEnvironmentId: environment.id },
    });
    await db.bookingPolicy.upsert({ where: { restaurantId: restaurant.id }, create: { restaurantId: restaurant.id }, update: {} });

    const roleLabels = [
      ['CUSTOMER', 'Customer'], ['HOST', 'Host'], ['WAITER', 'Waiter'],
      ['CHEF', 'Chef'], ['MANAGER', 'Manager'], ['OWNER', 'Owner'],
    ] as const;
    const roleByCode = new Map<string, string>();
    for (const [code, name] of roleLabels) {
      const role = await db.role.upsert({ where: { code }, create: { code, name }, update: { name } });
      roleByCode.set(code, role.id);
    }

    const accountSpecs = [
      { role: 'CUSTOMER', name: 'Aarav Mehta', email: 'customer.demo@savore.example.test', passwordKey: 'DEMO_CUSTOMER_PASSWORD' },
      { role: 'HOST', name: 'Mira Shah', email: 'host.demo@savore.example.test', passwordKey: 'DEMO_HOST_PASSWORD' },
      { role: 'WAITER', name: 'Rohan Iyer', email: 'waiter.demo@savore.example.test', passwordKey: 'DEMO_WAITER_PASSWORD' },
      { role: 'CHEF', name: 'Anaya Rao', email: 'chef.demo@savore.example.test', passwordKey: 'DEMO_CHEF_PASSWORD' },
      { role: 'MANAGER', name: 'Kavya Nair', email: 'manager.demo@savore.example.test', passwordKey: 'DEMO_MANAGER_PASSWORD' },
      { role: 'OWNER', name: 'Devika Sen', email: 'owner.demo@savore.example.test', passwordKey: 'DEMO_OWNER_PASSWORD' },
    ] as const;
    const accounts = new Map<string, { id: string; guestProfileId: string | null; membershipId: string | null }>();
    for (const account of accountSpecs) {
      const password = process.env[account.passwordKey]!;
      if (password.length < 20) throw new Error(`${account.passwordKey} must contain at least 20 characters.`);
      const passwordHash = await hash(password, 12);
      const user = await db.user.upsert({
        where: { email: account.email },
        create: { email: account.email, name: account.name, status: 'ACTIVE', passwordHash },
        update: { name: account.name },
      });
      let guestProfileId: string | null = null;
      let membershipId: string | null = null;
      if (account.role === 'CUSTOMER') {
        const guest = await db.guestProfile.upsert({
          where: { userId: user.id },
          create: { userId: user.id, name: account.name, email: account.email, phone: '+91 90000 12500' },
          update: { name: account.name, email: account.email },
        });
        guestProfileId = guest.id;
      } else {
        const membership = await db.staffMembership.upsert({
          where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } },
          create: { userId: user.id, restaurantId: restaurant.id, status: 'ACTIVE' },
          update: {},
        });
        membershipId = membership.id;
        const roleId = roleByCode.get(account.role)!;
        await db.staffRole.upsert({
          where: { staffMembershipId_roleId: { staffMembershipId: membership.id, roleId } },
          create: { staffMembershipId: membership.id, roleId }, update: {},
        });
      }
      accounts.set(account.role, { id: user.id, guestProfileId, membershipId });
    }

    const guest = await db.guestProfile.findUniqueOrThrow({ where: { userId: accounts.get('CUSTOMER')!.id } });
    const zone = await db.diningZone.findFirst({ where: { restaurantId: restaurant.id, name: 'Main Dining' } })
      ?? await db.diningZone.create({ data: { restaurantId: restaurant.id, name: 'Main Dining', sortOrder: 1 } });
    const tables = new Map<string, string>();
    for (let index = 1; index <= 12; index++) {
      const label = `T${String(index).padStart(2, '0')}`;
      const table = await db.diningTable.upsert({
        where: { restaurantId_label: { restaurantId: restaurant.id, label } },
        create: { restaurantId: restaurant.id, diningZoneId: zone.id, label, minCapacity: 1, maxCapacity: index % 3 === 0 ? 6 : 4, x: (index - 1) % 4, y: Math.floor((index - 1) / 4) },
        update: {},
      });
      tables.set(label, table.id);
    }
    for (const dayOfWeek of [0, 2, 3, 4, 5, 6]) {
      if (!await db.servicePeriod.findFirst({ where: { restaurantId: restaurant.id, dayOfWeek, mealType: 'DINNER' } })) {
        await db.servicePeriod.create({ data: { restaurantId: restaurant.id, dayOfWeek, mealType: 'DINNER', startMinute: 1080, endMinute: 1380, active: true } });
      }
    }
    // Keep the demo schedule consistent with the customer-facing Tuesday–Sunday policy.
    await db.servicePeriod.updateMany({ where: { restaurantId: restaurant.id, dayOfWeek: 1, mealType: 'DINNER', active: true }, data: { active: false } });

    let menu = await db.menu.findFirst({ where: { restaurantId: restaurant.id, name: 'Client Demo — À La Carte' } });
    if (!menu) menu = await db.menu.create({ data: { restaurantId: restaurant.id, name: 'Client Demo — À La Carte', published: true } });
    const category = await db.menuCategory.findFirst({ where: { menuId: menu.id, name: 'Signatures' } })
      ?? await db.menuCategory.create({ data: { menuId: menu.id, name: 'Signatures', sortOrder: 1 } });
    const dishes = [
      { slug: 'demo-truffle-risotto', name: 'Truffle Wild Mushroom Risotto', price: 185000, vegetarian: true, labels: ['Vegetarian', 'Contains dairy'] },
      { slug: 'demo-seared-scallops', name: 'Seared Sea Scallops', price: 210000, vegetarian: false, labels: ['Contains shellfish'] },
      { slug: 'demo-dark-chocolate-tart', name: 'Dark Chocolate Tart', price: 95000, vegetarian: true, labels: ['Vegetarian'] },
    ];
    const dishIds = new Map<string, string>();
    for (const dish of dishes) {
      let item = await db.menuItem.findFirst({ where: { menuCategoryId: category.id, slug: dish.slug } });
      if (!item) item = await db.menuItem.create({ data: { menuCategoryId: category.id, slug: dish.slug, name: dish.name, description: 'Fictional client demonstration dish.', status: 'PUBLISHED', vegetarian: dish.vegetarian, dietaryLabels: dish.labels } });
      await db.menuAvailability.upsert({ where: { menuItemId: item.id }, create: { menuItemId: item.id, available: true }, update: {} });
      if (!await db.menuItemPrice.findFirst({ where: { menuItemId: item.id, effectiveTo: null } })) {
        await db.menuItemPrice.create({ data: { menuItemId: item.id, amountMinor: BigInt(dish.price), currency: 'INR' } });
      }
      dishIds.set(dish.slug, item.id);
    }

    const customerStart = new Date();
    customerStart.setUTCDate(customerStart.getUTCDate() + 1);
    customerStart.setUTCHours(13, 30, 0, 0);
    const customerEnd = new Date(customerStart.getTime() + 2 * 60 * 60 * 1000);
    const customerReservation = await db.reservation.upsert({
      where: { reference: `DEMO-CUSTOMER-${dayKey}` },
      create: { restaurantId: restaurant.id, guestProfileId: guest.id, reference: `DEMO-CUSTOMER-${dayKey}`, partySize: 2, startsAt: customerStart, endsAt: customerEnd, status: 'CONFIRMED', notes: 'Seeded customer journey example.' },
      update: {},
    });
    if (!await db.reservationEvent.findFirst({ where: { reservationId: customerReservation.id, toStatus: customerReservation.status } })) {
      await db.reservationEvent.create({ data: { reservationId: customerReservation.id, toStatus: customerReservation.status, metadata: { demoFixture: 'phase-12.5', kind: 'customer-reservation' } } });
    }

    const seatedStart = new Date(Date.now() - 30 * 60 * 1000);
    const seatedEnd = new Date(Date.now() + 90 * 60 * 1000);
    const seatedReservation = await db.reservation.upsert({
      where: { reference: `DEMO-SEATED-${dayKey}` },
      create: { restaurantId: restaurant.id, guestProfileId: guest.id, reference: `DEMO-SEATED-${dayKey}`, partySize: 2, startsAt: seatedStart, endsAt: seatedEnd, status: 'SEATED', notes: 'Seeded active table service example.' },
      update: {},
    });
    const qrTableId = tables.get('T03')!;
    let reservationTable = await db.reservationTable.findFirst({ where: { reservationId: seatedReservation.id } });
    if (!reservationTable && seatedReservation.status === 'SEATED') {
      reservationTable = await db.reservationTable.create({ data: { restaurantId: restaurant.id, reservationId: seatedReservation.id, diningTableId: qrTableId, waiterMembershipId: accounts.get('WAITER')!.membershipId, startsAt: seatedStart, endsAt: seatedEnd } });
    }
    let diningSession = null;
    if (seatedReservation.status === 'SEATED' && reservationTable) {
      if (!await db.tableOccupancy.findUnique({ where: { reservationTableId: reservationTable.id } })) {
        await db.tableOccupancy.create({ data: { restaurantId: restaurant.id, reservationTableId: reservationTable.id, diningTableId: reservationTable.diningTableId, startsAt: reservationTable.startsAt, endsAt: reservationTable.endsAt, active: true } });
      }
      if (!await db.reservationEvent.findFirst({ where: { reservationId: seatedReservation.id, toStatus: 'SEATED' } })) {
        await db.reservationEvent.create({ data: { reservationId: seatedReservation.id, actorUserId: accounts.get('HOST')!.id, fromStatus: 'CONFIRMED', toStatus: 'SEATED', metadata: { demoFixture: 'phase-12.5' } } });
      }
      diningSession = await db.diningSession.findFirst({ where: { reservationId: seatedReservation.id, diningTableId: reservationTable.diningTableId } });
      if (!diningSession) {
        diningSession = await db.diningSession.create({ data: { restaurantId: restaurant.id, diningTableId: reservationTable.diningTableId, reservationId: seatedReservation.id, activatedByUserId: accounts.get('HOST')!.id, activatedAt: reservationTable.startsAt, expiresAt: reservationTable.endsAt, status: 'ACTIVE' } });
      }
      if (!await db.diningSessionEvent.findFirst({ where: { diningSessionId: diningSession.id, event: 'QR_SESSION_ACTIVATED' } })) {
        await db.diningSessionEvent.create({ data: { diningSessionId: diningSession.id, actorUserId: accounts.get('HOST')!.id, event: 'QR_SESSION_ACTIVATED', metadata: { demoFixture: 'phase-12.5' } } });
      }
    } else {
      diningSession = await db.diningSession.findFirst({ where: { reservationId: seatedReservation.id } });
    }
    const qrRawToken = process.env.DEMO_QR_T03_TOKEN!;
    if (!/^[a-f0-9]{64}$/i.test(qrRawToken)) throw new Error('DEMO_QR_T03_TOKEN must be a 64-character hex token.');
    const tokenHash = createHash('sha256').update(qrRawToken).digest('hex');
    const tableToken = await db.tableToken.findUnique({ where: { tokenHash } });
    if (!tableToken && seatedReservation.status === 'SEATED' && reservationTable?.diningTableId === qrTableId) await db.tableToken.create({ data: { diningTableId: qrTableId, tokenHash, active: true } });
    else if (tableToken && tableToken.diningTableId !== qrTableId) throw new Error('The client demo QR fixture token is attached to an unexpected table.');

    const waitlistId = '00000000-0000-4125-8125-000000000001';
    const waitGuestId = await db.guestProfile.upsert({
      where: { id: '00000000-0000-4125-8125-000000000002' },
      create: { id: '00000000-0000-4125-8125-000000000002', name: 'Nisha Kapoor', email: 'walk-in.demo@savore.example.test', phone: '+91 90000 12501' },
      update: { name: 'Nisha Kapoor', email: 'walk-in.demo@savore.example.test' },
    }).then((profile) => profile.id);
    const waitlist = await db.waitlistEntry.upsert({
      where: { id: waitlistId },
      create: { id: waitlistId, restaurantId: restaurant.id, guestProfileId: waitGuestId, partySize: 3, status: 'WAITING', quotedMinutes: 20 },
      update: {},
    });
    if (!await db.waitlistEvent.findFirst({ where: { waitlistEntryId: waitlist.id, status: 'WAITING' } })) {
      await db.waitlistEvent.create({ data: { waitlistEntryId: waitlist.id, actorUserId: accounts.get('HOST')!.id, status: 'WAITING', metadata: { demoFixture: 'phase-12.5' } } });
    }

    const demoOrderRef = `DEMO-DINE-IN-${dayKey}`;
    let order = await db.order.findUnique({ where: { reference: demoOrderRef } });
    if (!order && seatedReservation.status === 'SEATED' && diningSession) {
      const itemId = dishIds.get('demo-truffle-risotto')!;
      const lineAmount = 185000n;
      const tax = 16650n;
      order = await db.order.create({
        data: {
          restaurantId: restaurant.id, guestProfileId: guest.id, reservationId: seatedReservation.id, diningSessionId: diningSession.id,
          reference: demoOrderRef, idempotencyKey: `phase125-${dayKey}`, type: 'DINE_IN', status: 'PREPARING',
          subtotalMinor: lineAmount, taxMinor: tax, totalMinor: lineAmount + tax, currency: 'INR',
          OrderItem_orderId: { create: { menuItemId: itemId, nameSnapshot: 'Truffle Wild Mushroom Risotto', unitPriceMinor: lineAmount, quantity: 1, lineTotalMinor: lineAmount, allergenSnapshot: ['dairy'] } },
          OrderEvent_orderId: { create: { fromStatus: null, toStatus: 'PREPARING', metadata: { demoFixture: 'phase-12.5' } } },
          KitchenTicket_orderId: { create: { station: 'HOT', status: 'PREPARING' } },
        },
      });
    }

    await db.demoSeedRun.update({ where: { id: run.id }, data: { completedAt: new Date(), seedVersion: version } });
    console.log('Client demo seed completed: six role accounts, menu, reservations, floor/waitlist, QR session, and dine-in kitchen order.');
  } catch (error) {
    await db.demoSeedRun.update({ where: { id: run.id }, data: { completedAt: new Date() } }).catch(() => undefined);
    throw error;
  }

  async function getEnvironmentId() {
    const environment = await db.demoEnvironment.findUnique({ where: { name: 'phase-12.5-client-demo' } });
    if (!environment) {
      // A temporary, valid parent row allows the seed-run ledger to remain auditable on first setup.
      return (await db.demoEnvironment.create({ data: { name: 'phase-12.5-client-demo', seedVersion: version } })).id;
    }
    return environment.id;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Client demo seed failed.');
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
