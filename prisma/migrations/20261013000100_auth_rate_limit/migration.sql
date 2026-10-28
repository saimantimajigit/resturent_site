CREATE TABLE "AuthRateLimit" (
  "key" VARCHAR(64) NOT NULL,
  "windowStartedAt" TIMESTAMPTZ(6) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "AuthRateLimit_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "AuthRateLimit_updatedAt_idx" ON "AuthRateLimit"("updatedAt");
