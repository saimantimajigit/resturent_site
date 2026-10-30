import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const sourceEnvPath = resolve(root, '.env');
const migrationEnvPath = resolve(root, '.env.migrations');
const adminEnvPath = resolve(root, '.env.savore-admin');
const demoEnvPath = resolve(root, '.env.client-demo');
if (!existsSync(sourceEnvPath) || !existsSync(migrationEnvPath) || !existsSync(adminEnvPath)) {
  throw new Error('The ignored runtime, migration, and administrator environment files are required for local PostgreSQL access.');
}

const baseEnv = dotenv.parse(readFileSync(sourceEnvPath));
const migrationConfig = dotenv.parse(readFileSync(migrationEnvPath));
const adminConfig = dotenv.parse(readFileSync(adminEnvPath));
if (!baseEnv.DATABASE_URL || !migrationConfig.MIGRATION_DATABASE_URL || !adminConfig.SAVORE_ADMIN_DATABASE_URL) {
  throw new Error('The ignored SAVORÉ environment files are incomplete.');
}
const sourceUrl = new URL(baseEnv.DATABASE_URL);
const sourceMigrationUrl = new URL(migrationConfig.MIGRATION_DATABASE_URL);
const adminUrl = new URL(adminConfig.SAVORE_ADMIN_DATABASE_URL);
if (!['localhost', '127.0.0.1', '::1'].includes(sourceUrl.hostname) || sourceUrl.port !== '5433') {
  throw new Error('Demo preparation only supports the local PostgreSQL endpoint at localhost:5433.');
}
if (sourceUrl.username !== 'savore_app' || sourceMigrationUrl.username !== 'savore_migrator') {
  throw new Error('Runtime and migration URLs must use their dedicated least-privilege roles.');
}
if (!['localhost', '127.0.0.1', '::1'].includes(adminUrl.hostname) || adminUrl.port !== '5433' || adminUrl.username !== 'savore' || decodeURIComponent(adminUrl.pathname.slice(1)) !== 'postgres') {
  throw new Error('The protected administrator URL must target the local PostgreSQL maintenance database.');
}
if (sourceMigrationUrl.hostname !== sourceUrl.hostname || sourceMigrationUrl.port !== sourceUrl.port || decodeURIComponent(sourceMigrationUrl.pathname.slice(1)) !== decodeURIComponent(sourceUrl.pathname.slice(1))) {
  throw new Error('Runtime and migration URLs must target the same local database.');
}
const admin = new Client({ connectionString: adminUrl.toString(), application_name: 'savore-client-demo-setup' });
await admin.connect();

function databaseExists(name) {
  return admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]).then((result) => result.rowCount > 0);
}

let demoEnv;
let demoDatabase;
let markedDemoDatabase = false;
if (existsSync(demoEnvPath)) {
  demoEnv = dotenv.parse(readFileSync(demoEnvPath));
  if (!demoEnv.DATABASE_URL || !demoEnv.MIGRATION_DATABASE_URL || !demoEnv.RESTAURANT_ID) throw new Error('Existing .env.client-demo is incomplete; it was preserved for review.');
  const demoUrl = new URL(demoEnv.DATABASE_URL);
  const demoMigrationUrl = new URL(demoEnv.MIGRATION_DATABASE_URL);
  demoDatabase = decodeURIComponent(demoUrl.pathname.slice(1));
  if (!/^savore_client_demo_[a-z0-9_]+$/.test(demoDatabase) || demoUrl.protocol !== sourceUrl.protocol || demoUrl.hostname !== sourceUrl.hostname || demoUrl.port !== sourceUrl.port) {
    throw new Error('Existing .env.client-demo must target a local savore_client_demo_* database; it was preserved.');
  }
  if (demoUrl.username !== sourceUrl.username || demoUrl.password !== sourceUrl.password || demoMigrationUrl.username !== sourceMigrationUrl.username || demoMigrationUrl.password !== sourceMigrationUrl.password) {
    throw new Error('Demo and local PostgreSQL role credentials differ; existing demo credentials were preserved.');
  }
  if (decodeURIComponent(demoMigrationUrl.pathname.slice(1)) !== demoDatabase || demoMigrationUrl.hostname !== demoUrl.hostname || demoMigrationUrl.port !== demoUrl.port) {
    throw new Error('Demo runtime and migration URLs must target the same isolated database.');
  }
  if (await databaseExists(demoDatabase)) {
    const targetClient = new Client({ connectionString: demoEnv.DATABASE_URL, application_name: 'savore-client-demo-preflight' });
    await targetClient.connect();
    try {
      const check = await targetClient.query(
        `SELECT to_regclass('public."DemoEnvironment"') AS env_table`,
      );
      if (check.rows[0]?.env_table) {
        const seeded = await targetClient.query('SELECT 1 FROM public."DemoEnvironment" WHERE name = $1 LIMIT 1', ['phase-12.5-client-demo']);
        if (!seeded.rowCount) throw new Error('Target database contains non-demo data or an incomplete demo marker; it was preserved and not migrated.');
        markedDemoDatabase = true;
      } else {
        const tables = await targetClient.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
        if (tables.rows[0].count !== 0) throw new Error('Target database is non-empty without the Phase 12.5 demo marker; it was preserved.');
      }
    } finally {
      await targetClient.end();
    }
  }
} else {
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '_');
  let suffix = 1;
  do { demoDatabase = `savore_client_demo_${day}_${suffix++}`; } while (await databaseExists(demoDatabase));
  const demoUrl = new URL(sourceUrl);
  demoUrl.pathname = `/${demoDatabase}`;
  demoUrl.searchParams.set('schema', 'public');
  const demoMigrationUrl = new URL(sourceMigrationUrl);
  demoMigrationUrl.pathname = `/${demoDatabase}`;
  demoMigrationUrl.searchParams.set('schema', 'public');
  demoEnv = {
    DATABASE_URL: demoUrl.toString(),
    MIGRATION_DATABASE_URL: demoMigrationUrl.toString(),
    RESTAURANT_ID: baseEnv.RESTAURANT_ID || randomUUID(),
    NEXT_PUBLIC_SITE_URL: 'http://localhost:3015',
    SAVORE_TRUSTED_CLIENT_IP_HEADER: 'x-real-ip',
    DEMO_CUSTOMER_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_HOST_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_WAITER_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_CHEF_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_MANAGER_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_OWNER_PASSWORD: randomBytes(24).toString('base64url'),
    DEMO_QR_T03_TOKEN: randomBytes(32).toString('hex'),
  };
  try {
    writeFileSync(demoEnvPath, `${Object.entries(demoEnv).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    throw new Error(`Unable to create ignored .env.client-demo securely: ${error instanceof Error ? error.message : 'write failed'}`);
  }
  if (process.platform === 'win32') {
    const principal = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
    const acl = spawnSync('icacls.exe', [demoEnvPath, '/inheritance:r', '/grant:r', `${principal}:(R,W)`, 'NT AUTHORITY\\SYSTEM:(F)'], { encoding: 'utf8', windowsHide: true });
    if (acl.status !== 0) throw new Error('.env.client-demo was written but its Windows ACL could not be restricted. Restrict access before continuing.');
  }
}

try {
  if (!await databaseExists(demoDatabase)) {
    if (!/^savore_client_demo_[a-z0-9_]+$/.test(demoDatabase)) throw new Error('Refusing to create a database outside the dedicated demo name prefix.');
    await admin.query(`CREATE DATABASE "${demoDatabase}"`);
    console.log('Created a new isolated client demo database.');
  } else {
    console.log(markedDemoDatabase
      ? 'Found the marked isolated client demo database; no database was reset.'
      : 'Found the previously created empty demo target; no existing records were changed.');
  }
  const targetAdminUrl = new URL(adminUrl);
  targetAdminUrl.pathname = `/${demoDatabase}`;
  const targetAdmin = new Client({ connectionString: targetAdminUrl.toString(), application_name: 'savore-client-demo-database-bootstrap' });
  await targetAdmin.connect();
  try {
    await targetAdmin.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await targetAdmin.query(`GRANT CONNECT ON DATABASE "${demoDatabase}" TO savore_app, savore_migrator`);
    await targetAdmin.query('GRANT USAGE, CREATE ON SCHEMA public TO savore_migrator');
    await targetAdmin.query('ALTER DEFAULT PRIVILEGES FOR ROLE savore_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO savore_app');
    await targetAdmin.query('ALTER DEFAULT PRIVILEGES FOR ROLE savore_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO savore_app');
  } finally {
    await targetAdmin.end();
  }
} finally {
  await admin.end();
}

const migrationChildEnv = { ...process.env, ...demoEnv };
delete migrationChildEnv.DATABASE_URL;
delete migrationChildEnv.SAVORE_ADMIN_DATABASE_URL;
const runtimeChildEnv = { ...process.env, ...demoEnv };
delete runtimeChildEnv.MIGRATION_DATABASE_URL;
delete runtimeChildEnv.SAVORE_ADMIN_DATABASE_URL;
function run(command, args, childEnv) {
  const result = spawnSync(command, args, { cwd: root, env: childEnv, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  const redact = (value) => {
    let safe = value || '';
    for (const secret of [demoEnv.DATABASE_URL, demoEnv.MIGRATION_DATABASE_URL, ...Object.entries(demoEnv).filter(([key]) => key.endsWith('_PASSWORD') || key.endsWith('_TOKEN')).map(([, value]) => value)]) {
      if (secret) safe = safe.split(secret).join('[REDACTED]');
    }
    return safe;
  };
  if (result.stdout) process.stdout.write(redact(result.stdout));
  if (result.stderr) process.stderr.write(redact(result.stderr));
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}. Demo database and environment were preserved.`);
}

const node = process.execPath;
run(node, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], migrationChildEnv);
run(node, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'status'], migrationChildEnv);
run(node, [resolve(root, 'node_modules/prisma/build/index.js'), 'generate'], runtimeChildEnv);
run(node, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), 'prisma/seed-client-demo.ts'], runtimeChildEnv);
console.log('Setup complete. Demo account and QR secrets remain in ignored .env.client-demo; database role credentials remain in separate ignored files. No credential was printed.');
