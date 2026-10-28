-- Add staff-activated table sessions and revocable guest access for QR dining.
CREATE TYPE "DiningSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

CREATE TABLE "DiningSession" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "restaurantId" UUID NOT NULL,
  "diningTableId" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "status" "DiningSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "activatedByUserId" UUID NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "DiningSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiningSession_valid_expiry_check" CHECK ("expiresAt" > "activatedAt")
);
CREATE INDEX "DiningSession_restaurantId_status_expiresAt_idx"
  ON "DiningSession" ("restaurantId", "status", "expiresAt");
CREATE INDEX "DiningSession_diningTableId_status_idx"
  ON "DiningSession" ("diningTableId", "status");
CREATE INDEX "DiningSession_reservationId_status_idx"
  ON "DiningSession" ("reservationId", "status");
CREATE UNIQUE INDEX "DiningSession_one_active_table_idx"
  ON "DiningSession" ("restaurantId", "diningTableId") WHERE "status" = 'ACTIVE';
ALTER TABLE "DiningSession"
  ADD CONSTRAINT "DiningSession_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiningSession_diningTableId_fkey" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiningSession_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiningSession_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DiningGuestToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "diningSessionId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "DiningGuestToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiningGuestToken_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "DiningGuestToken_valid_expiry_check" CHECK ("expiresAt" > "issuedAt")
);
CREATE INDEX "DiningGuestToken_diningSessionId_expiresAt_idx"
  ON "DiningGuestToken" ("diningSessionId", "expiresAt");
ALTER TABLE "DiningGuestToken"
  ADD CONSTRAINT "DiningGuestToken_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DiningSessionEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "diningSessionId" UUID NOT NULL,
  "actorUserId" UUID,
  "diningGuestTokenId" UUID,
  "event" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiningSessionEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DiningSessionEvent_diningSessionId_createdAt_idx"
  ON "DiningSessionEvent" ("diningSessionId", "createdAt");
ALTER TABLE "DiningSessionEvent"
  ADD CONSTRAINT "DiningSessionEvent_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiningSessionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DiningSessionEvent_diningGuestTokenId_fkey" FOREIGN KEY ("diningGuestTokenId") REFERENCES "DiningGuestToken" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "diningSessionId" UUID;
CREATE INDEX "Order_diningSessionId_idx" ON "Order" ("diningSessionId");
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssistanceRequest"
  ADD COLUMN "diningSessionId" UUID,
  ADD COLUMN "diningGuestTokenId" UUID,
  ADD COLUMN "metadata" JSONB;
CREATE INDEX "AssistanceRequest_diningSessionId_idx" ON "AssistanceRequest" ("diningSessionId");
ALTER TABLE "AssistanceRequest"
  ADD CONSTRAINT "AssistanceRequest_diningSessionId_fkey" FOREIGN KEY ("diningSessionId") REFERENCES "DiningSession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AssistanceRequest_diningGuestTokenId_fkey" FOREIGN KEY ("diningGuestTokenId") REFERENCES "DiningGuestToken" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
