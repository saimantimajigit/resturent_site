import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

const config = (phase: string): NextConfig => {
  const isDevelopment = phase === PHASE_DEVELOPMENT_SERVER;
  const isProduction =
    phase === PHASE_PRODUCTION_BUILD || phase === PHASE_PRODUCTION_SERVER;

  const isolatedDevDistDir = process.env.SAVORE_NEXT_DEV_DIST_DIR;
  if (isolatedDevDistDir && !/^\.next-dev(?:-[a-z0-9-]+)?$/i.test(isolatedDevDistDir)) {
    throw new Error('SAVORE_NEXT_DEV_DIST_DIR must be a repository-local .next-dev directory name.');
  }

  const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'" },
  ];

  return {
    reactStrictMode: true,
    poweredByHeader: false,
    outputFileTracingRoot: process.cwd(),
    // Keep a running dev server's incremental Webpack output separate from
    // production build artifacts. Both modes previously wrote into `.next`.
    distDir: isDevelopment ? isolatedDevDistDir ?? ".next-dev" : isProduction ? ".next-prod" : ".next",
    async headers() {
      return [
        { source: '/:path*', headers: securityHeaders },
        { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }] },
      ];
    },
  };
};

export default config;
