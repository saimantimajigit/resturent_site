import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

const envPath = resolve(process.cwd(), '.env.client-demo');
if (!existsSync(envPath)) throw new Error('Run npm run demo:prepare before starting the client demo.');
const demoEnv = dotenv.parse(readFileSync(envPath));
const database = new URL(demoEnv.DATABASE_URL || '').pathname.slice(1);
if (!/^savore_client_demo_[a-z0-9_]+$/.test(decodeURIComponent(database))) throw new Error('Refusing to start outside the isolated client demo database.');
const childEnv = {
  ...process.env,
  ...demoEnv,
  NODE_ENV: 'development',
  SAVORE_NEXT_DEV_DIST_DIR: '.next-dev-phase125',
};
delete childEnv.MIGRATION_DATABASE_URL;
delete childEnv.SAVORE_ADMIN_DATABASE_URL;
const server = spawn(process.execPath, [resolve(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '-p', '3015', '-H', '127.0.0.1'], {
  cwd: process.cwd(), env: childEnv, stdio: 'inherit', windowsHide: true,
});
server.on('error', (error) => { console.error('Could not start the local demo server:', error.message); process.exitCode = 1; });
server.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
