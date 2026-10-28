-- Extend existing reservation, seating and waitlist records with floor-service ownership.
ALTER TABLE "ReservationTable"
  ADD COLUMN "waiterMembershipId" UUID;
CREATE INDEX "ReservationTable_waiterMembershipId_idx"
  ON "ReservationTable" ("waiterMembershipId");
ALTER TABLE "ReservationTable"
  ADD CONSTRAINT "ReservationTable_waiterMembershipId_fkey"
  FOREIGN KEY ("waiterMembershipId") REFERENCES "StaffMembership" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TableOccupancy"
  ADD CONSTRAINT "TableOccupancy_reservationTableId_fkey"
  FOREIGN KEY ("reservationTableId") REFERENCES "ReservationTable" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WaitlistEntry"
  ADD COLUMN "calledAt" TIMESTAMP(3),
  ADD COLUMN "seatedAt" TIMESTAMP(3),
  ADD COLUMN "reservationId" UUID;
CREATE UNIQUE INDEX "WaitlistEntry_reservationId_key"
  ON "WaitlistEntry" ("reservationId");
CREATE INDEX "WaitlistEntry_restaurantId_status_createdAt_idx"
  ON "WaitlistEntry" ("restaurantId", "status", "createdAt");
ALTER TABLE "WaitlistEntry"
  ADD CONSTRAINT "WaitlistEntry_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry"
  ADD CONSTRAINT "waitlist_party_and_quote_check"
  CHECK ("partySize" > 0 AND ("quotedMinutes" IS NULL OR "quotedMinutes" >= 0));

ALTER TABLE "WaitlistEvent"
  ADD COLUMN "actorUserId" UUID,
  ADD COLUMN "metadata" JSONB;
CREATE INDEX "WaitlistEvent_waitlistEntryId_createdAt_idx"
  ON "WaitlistEvent" ("waitlistEntryId", "createdAt");
ALTER TABLE "WaitlistEvent"
  ADD CONSTRAINT "WaitlistEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
