import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const trustedProxyHeaders = new Set(['x-real-ip', 'cf-connecting-ip', 'true-client-ip']);

export function deploymentEnvErrors(env = process.env) {
  const errors = [];
  for (const key of ['DATABASE_URL', 'RESTAURANT_ID', 'SAVORE_TRUSTED_CLIENT_IP_HEADER', 'NEXT_PUBLIC_SITE_URL']) {
    if (!env[key]?.trim()) errors.push(`${key} is required`);
  }

  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
        errors.push('DATABASE_URL must be a PostgreSQL connection URL');
      }
    } catch {
      errors.push('DATABASE_URL must be a PostgreSQL connection URL');
    }
  }

  if (env.SAVORE_TRUSTED_CLIENT_IP_HEADER?.trim() &&
      !trustedProxyHeaders.has(env.SAVORE_TRUSTED_CLIENT_IP_HEADER.trim().toLowerCase())) {
    errors.push('SAVORE_TRUSTED_CLIENT_IP_HEADER must name a supported trusted proxy header');
  }

  if (env.NEXT_PUBLIC_SITE_URL?.trim()) {
    try {
      const url = new URL(env.NEXT_PUBLIC_SITE_URL);
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localHttp) errors.push('NEXT_PUBLIC_SITE_URL must use HTTPS outside local development');
      if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        errors.push('NEXT_PUBLIC_SITE_URL must be a credential-free origin without path, query, or fragment');
      }
    } catch {
      errors.push('NEXT_PUBLIC_SITE_URL must be an absolute HTTPS URL');
    }
  }

  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // For local `npm start`, load ignored .env values. Deployed environments inject
  // settings through the platform secret/environment manager.
  await import('dotenv/config');
  const errors = deploymentEnvErrors();
  if (errors.length) {
    console.error(`Deployment environment validation failed: ${errors.join('; ')}`);
    process.exitCode = 1;
  }
}
