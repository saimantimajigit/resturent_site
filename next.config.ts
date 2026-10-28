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

  return {
    reactStrictMode: true,
    outputFileTracingRoot: process.cwd(),
    // Keep a running dev server's incremental Webpack output separate from
    // production build artifacts. Both modes previously wrote into `.next`.
    distDir: isDevelopment ? ".next-dev" : isProduction ? ".next-prod" : ".next",
  };
};

export default config;
