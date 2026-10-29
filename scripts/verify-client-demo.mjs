import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const file = resolve(process.cwd(), '.env.client-demo');
if (!existsSync(file)) throw new Error('Missing ignored .env.client-demo; run npm run demo:prepare.');
const env = dotenv.parse(readFileSync(file));
const database = decodeURIComponent(new URL(env.DATABASE_URL || '').pathname.slice(1));
if (!/^savore_client_demo_[a-z0-9_]+$/.test(database)) throw new Error('Verification is restricted to a savore_client_demo_* database.');
const client = new pg.Client({ connectionString: env.DATABASE_URL, application_name: 'savore-client-demo-verification' });
await client.connect();
const checks = [];
function check(name, passed) { checks.push({ name, passed: Boolean(passed) }); }

try {
  const dbName = await client.query('SELECT current_database() AS name');
  check('connected to dedicated client demo database', dbName.rows[0]?.name === database);
  const migrations = await client.query('SELECT count(*)::int AS applied FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  check('six migrations applied', migrations.rows[0]?.applied === 6);
  const extension = await client.query("SELECT 1 FROM pg_extension WHERE extname='btree_gist'");
  check('btree_gist installed', extension.rowCount === 1);
  const constraint = await client.query("SELECT 1 FROM pg_constraint WHERE conname='occupancy_no_overlap' AND convalidated");
  check('occupancy exclusion constraint validated', constraint.rowCount === 1);
  const limiter = await client.query("SELECT to_regclass('public.\"AuthRateLimit\"') AS table_name");
  check('persistent authentication rate-limit table exists', Boolean(limiter.rows[0]?.table_name));
  const roles = await client.query("SELECT count(DISTINCT u.email)::int AS count FROM public.\"User\" u WHERE u.email = ANY($1::text[])", [[
    'customer.demo@savore.example.test', 'host.demo@savore.example.test', 'waiter.demo@savore.example.test',
    'chef.demo@savore.example.test', 'manager.demo@savore.example.test', 'owner.demo@savore.example.test',
  ]]);
  check('six fictional login accounts exist', roles.rows[0]?.count === 6);
  const services = await client.query('SELECT count(*)::int AS count, bool_or("dayOfWeek"=1) AS monday_open FROM public."ServicePeriod" WHERE "restaurantId"=$1::uuid AND "mealType"=$2 AND active', [env.RESTAURANT_ID, 'DINNER']);
  check('dinner service runs Tuesday through Sunday', services.rows[0]?.count === 6 && services.rows[0]?.monday_open === false);
  const menu = await client.query(`SELECT count(*) FILTER (WHERE i.status='PUBLISHED')::int AS published, count(*) FILTER (WHERE cardinality(i."dietaryLabels") > 0)::int AS labeled
    FROM public."MenuItem" i JOIN public."MenuCategory" c ON c.id=i."menuCategoryId" JOIN public."Menu" m ON m.id=c."menuId"
    WHERE m."restaurantId"=$1::uuid AND i.slug LIKE 'demo-%'`, [env.RESTAURANT_ID]);
  check('demo dishes are published and include dietary labels', menu.rows[0]?.published === 3 && menu.rows[0]?.labeled === 3);
  const counts = await client.query(`
    SELECT
      (SELECT count(*)::int FROM public."DiningTable" WHERE "restaurantId"=$1::uuid) AS tables,
      (SELECT count(*)::int FROM public."MenuItem" i JOIN public."MenuCategory" c ON c.id=i."menuCategoryId" JOIN public."Menu" m ON m.id=c."menuId" WHERE m."restaurantId"=$1::uuid AND i.slug LIKE 'demo-%') AS dishes,
      (SELECT count(*)::int FROM public."Reservation" WHERE "restaurantId"=$1::uuid AND reference LIKE 'DEMO-%') AS reservations,
      (SELECT count(*)::int FROM public."TableOccupancy" WHERE "restaurantId"=$1::uuid AND active) AS active_occupancies,
      (SELECT count(*)::int FROM public."DiningSession" WHERE "restaurantId"=$1::uuid AND status='ACTIVE') AS active_sessions,
      (SELECT count(*)::int FROM public."WaitlistEntry" WHERE id='00000000-0000-4125-8125-000000000001' AND status='WAITING') AS waiting_fixture,
      (SELECT count(*)::int FROM public."Order" WHERE "restaurantId"=$1::uuid AND reference LIKE 'DEMO-DINE-IN-%') AS dine_in_orders,
      (SELECT count(*)::int FROM public."KitchenTicket" k JOIN public."Order" o ON o.id=k."orderId" WHERE o."restaurantId"=$1::uuid AND o.reference LIKE 'DEMO-DINE-IN-%') AS kitchen_tickets,
      (SELECT count(*)::int FROM public."TableToken" t JOIN public."DiningTable" d ON d.id=t."diningTableId" WHERE d."restaurantId"=$1::uuid AND d.label='T03' AND t.active) AS active_qr
  `, [env.RESTAURANT_ID]);
  const result = counts.rows[0];
  check('12 floor tables seeded', result.tables === 12);
  check('3 published demo dishes seeded', result.dishes === 3);
  check('customer and seated reservations seeded', result.reservations >= 2);
  check('one occupied demo table', result.active_occupancies === 1);
  check('one active QR dining session', result.active_sessions === 1);
  check('one waitlist fixture waiting', result.waiting_fixture === 1);
  check('dine-in order and kitchen ticket linked', result.dine_in_orders === 1 && result.kitchen_tickets === 1);
  check('T03 QR token active', result.active_qr === 1);
} finally {
  await client.end();
}

for (const item of checks) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}`);
console.log(`${checks.filter((item) => item.passed).length}/${checks.length} demo data checks passed.`);
if (checks.some((item) => !item.passed)) process.exitCode = 1;
