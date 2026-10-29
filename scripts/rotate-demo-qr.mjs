import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import pg from 'pg';

const envPath = resolve(process.cwd(), '.env.client-demo');
if (!existsSync(envPath)) throw new Error('Run npm run demo:prepare first.');
const env = dotenv.parse(readFileSync(envPath));
const database = decodeURIComponent(new URL(env.DATABASE_URL || '').pathname.slice(1));
if (!/^savore_client_demo_[a-z0-9_]+$/.test(database)) throw new Error('QR rotation is restricted to the isolated client demo database.');
const oldCode = env.DEMO_QR_T03_TOKEN;
if (!/^[a-f0-9]{64}$/i.test(oldCode || '')) throw new Error('The local T03 QR secret is missing or malformed.');
const newCode = randomBytes(32).toString('hex');
const digest = (value) => createHash('sha256').update(value).digest('hex');
env.DEMO_QR_T03_TOKEN = newCode;
const tempPath = `${envPath}.tmp`;
if (existsSync(tempPath)) throw new Error('A previous secure credential update is pending; inspect the ignored temporary file before retrying.');
writeFileSync(tempPath, `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { flag: 'wx', mode: 0o600 });
if (process.platform === 'win32') {
  const principal = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  const acl = spawnSync('icacls.exe', [tempPath, '/inheritance:r', '/grant:r', `${principal}:(R,W)`, 'NT AUTHORITY\\SYSTEM:(F)'], { encoding: 'utf8', windowsHide: true });
  if (acl.status !== 0) throw new Error('The replacement credential file was written but its ACL could not be restricted; no database token was changed.');
}
const client = new pg.Client({ connectionString: env.DATABASE_URL, application_name: 'savore-client-demo-qr-rotation' });
try {
  await client.connect();
  await client.query('BEGIN');
  const table = await client.query('SELECT id FROM public."DiningTable" WHERE "restaurantId"=$1::uuid AND label=$2', [env.RESTAURANT_ID, 'T03']);
  if (table.rowCount !== 1) throw new Error('Expected exactly one seeded T03 table; no QR credentials were changed.');
  const revoked = await client.query('UPDATE public."TableToken" SET active=false WHERE "diningTableId"=$1::uuid AND "tokenHash"=$2 AND active=true', [table.rows[0].id, digest(oldCode)]);
  if (revoked.rowCount !== 1) throw new Error('The previous T03 token was not the sole active matching fixture; no replacement was made.');
  await client.query('INSERT INTO public."TableToken" ("diningTableId", "tokenHash", active) VALUES ($1::uuid, $2, true)', [table.rows[0].id, digest(newCode)]);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  unlinkSync(tempPath);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}
renameSync(tempPath, envPath);
console.log('Revoked the prior T03 QR token and stored a new secret in ignored .env.client-demo.');
