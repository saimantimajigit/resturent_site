import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { deploymentEnvErrors } from '../scripts/validate-deployment-env.mjs';

const valid = {
  DATABASE_URL: 'postgresql://app:placeholder@db.example.test:5432/savore?schema=public',
  RESTAURANT_ID: 'restaurant-id',
  SAVORE_TRUSTED_CLIENT_IP_HEADER: 'x-real-ip',
  NEXT_PUBLIC_SITE_URL: 'https://savore.example.test',
};

test('production env contract accepts HTTPS and supported proxy configuration', () => {
  assert.deepEqual(deploymentEnvErrors(valid), []);
});

test('production env contract rejects missing, malformed, and unsafe values without echoing them', () => {
  assert.match(deploymentEnvErrors({}).join(' '), /DATABASE_URL.*RESTAURANT_ID/);
  assert.match(deploymentEnvErrors({ ...valid, SAVORE_TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for' }).join(' '), /SAVORE_TRUSTED_CLIENT_IP_HEADER/);
  assert.match(deploymentEnvErrors({ ...valid, NEXT_PUBLIC_SITE_URL: 'http://public.example.test' }).join(' '), /NEXT_PUBLIC_SITE_URL/);
  assert.match(deploymentEnvErrors({ ...valid, NEXT_PUBLIC_SITE_URL: 'https://user:secret@public.example.test' }).join(' '), /credential-free origin/);
  const secret = 'do-not-print-this-secret';
  const result = spawnSync(process.execPath, ['scripts/validate-deployment-env.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      DATABASE_URL: `postgresql://app:${secret}@db.example.test:5432/savore`,
      RESTAURANT_ID: valid.RESTAURANT_ID,
      SAVORE_TRUSTED_CLIENT_IP_HEADER: 'x-forwarded-for',
      NEXT_PUBLIC_SITE_URL: valid.NEXT_PUBLIC_SITE_URL,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SAVORE_TRUSTED_CLIENT_IP_HEADER/);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
});

test('local production smoke testing permits HTTP only for loopback hosts', () => {
  assert.deepEqual(deploymentEnvErrors({ ...valid, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }), []);
});
