CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE "RoleCode" AS ENUM ('CUSTOMER', 'HOST', 'WAITER', 'CHEF', 'MANAGER', 'OWNER');

CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'AWAITING_PAYMENT', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'SEATED', 'CANCELLED', 'EXPIRED');

CREATE TYPE "MenuItemStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "OrderType" AS ENUM ('PICKUP', 'DELIVERY', 'DINE_IN');

CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COLLECTED', 'DELIVERED', 'CANCELLED', 'REJECTED');

CREATE TYPE "KitchenStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'SIMULATED');

CREATE TYPE "AssistanceType" AS ENUM ('WAITER', 'WATER', 'BILL', 'OTHER');

CREATE TYPE "AssistanceStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "email" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "passwordHash" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "Session" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Role" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code" "RoleCode" NOT NULL UNIQUE,
  "name" TEXT NOT NULL
);

CREATE TABLE "Permission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "description" TEXT
);

CREATE TABLE "RolePermission" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  UNIQUE ("roleId", "permissionId")
);

CREATE TABLE "StaffMembership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL,
  "restaurantId" UUID NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("userId", "restaurantId")
);

CREATE TABLE "StaffRole" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "staffMembershipId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  UNIQUE ("staffMembershipId", "roleId")
);

CREATE TABLE "GuestProfile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID UNIQUE,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "vip" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "GuestPreference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "guestProfileId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "value" TEXT NOT NULL
);

CREATE TABLE "GuestConsent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "guestProfileId" UUID NOT NULL,
  "purpose" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Restaurant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "demoEnvironmentId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "address" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DemoEnvironment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "seedVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DemoSeedRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "demoEnvironmentId" UUID NOT NULL,
  "seedVersion" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ
);

CREATE TABLE "DiningZone" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "DiningTable" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "diningZoneId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "minCapacity" INTEGER NOT NULL DEFAULT 1,
  "maxCapacity" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE ("restaurantId", "label")
);

CREATE TABLE "TableCombination" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "TableCombinationMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "tableCombinationId" UUID NOT NULL,
  "diningTableId" UUID NOT NULL,
  UNIQUE ("tableCombinationId", "diningTableId")
);

CREATE TABLE "ServicePeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "mealType" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "SpecialClosure" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "reason" TEXT NOT NULL
);

CREATE TABLE "BookingPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL UNIQUE,
  "advanceDays" INTEGER NOT NULL DEFAULT 60,
  "durationMinutes" INTEGER NOT NULL DEFAULT 120,
  "turnoverMinutes" INTEGER NOT NULL DEFAULT 15,
  "cutoffMinutes" INTEGER NOT NULL DEFAULT 60,
  "maxPartySize" INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE "Reservation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "guestProfileId" UUID NOT NULL,
  "reference" TEXT NOT NULL UNIQUE,
  "partySize" INTEGER NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "ReservationTable" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "diningTableId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "TableOccupancy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "reservationTableId" UUID NOT NULL UNIQUE,
  "diningTableId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "ReservationHold" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "reservationId" UUID NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "releasedAt" TIMESTAMPTZ
);

CREATE TABLE "ReservationEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "reservationId" UUID NOT NULL,
  "actorUserId" UUID,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB
);

CREATE TABLE "GuestManageToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "reservationId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "revokedAt" TIMESTAMPTZ
);

CREATE TABLE "WaitlistEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "guestProfileId" UUID NOT NULL,
  "partySize" INTEGER NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "quotedMinutes" INTEGER
);

CREATE TABLE "WaitlistEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "waitlistEntryId" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Menu" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "MenuCategory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "MenuItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuCategoryId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "status" "MenuItemStatus" NOT NULL DEFAULT 'DRAFT',
  "vegetarian" BOOLEAN NOT NULL DEFAULT FALSE,
  "imageUrl" TEXT
);

CREATE TABLE "MenuItemPrice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuItemId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "effectiveFrom" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMPTZ
);

CREATE TABLE "Allergen" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL
);

CREATE TABLE "MenuItemAllergen" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuItemId" UUID NOT NULL,
  "allergenId" UUID NOT NULL,
  UNIQUE ("menuItemId", "allergenId")
);

CREATE TABLE "MenuAvailability" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuItemId" UUID NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT TRUE,
  "reason" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  UNIQUE ("menuItemId")
);

CREATE TABLE "MediaAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "storageKey" TEXT NOT NULL UNIQUE,
  "altText" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "MenuItemMedia" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "menuItemId" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "DiningExperience" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priceMinor" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE "ExperienceCourse" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "diningExperienceId" UUID NOT NULL,
  "menuItemId" UUID,
  "sequence" INTEGER NOT NULL,
  "title" TEXT NOT NULL
);

CREATE TABLE "Order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "guestProfileId" UUID NOT NULL,
  "reservationId" UUID,
  "reference" TEXT NOT NULL UNIQUE,
  "type" "OrderType" NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
  "subtotalMinor" BIGINT NOT NULL,
  "taxMinor" BIGINT NOT NULL DEFAULT 0,
  "totalMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "orderId" UUID NOT NULL,
  "menuItemId" UUID NOT NULL,
  "nameSnapshot" TEXT NOT NULL,
  "unitPriceMinor" BIGINT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "lineTotalMinor" BIGINT NOT NULL,
  "notes" TEXT
);

CREATE TABLE "OrderItemModifier" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "orderItemId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL
);

CREATE TABLE "OrderEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "orderId" UUID NOT NULL,
  "actorUserId" UUID,
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "KitchenTicket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "orderId" UUID NOT NULL,
  "station" TEXT NOT NULL,
  "status" "KitchenStatus" NOT NULL DEFAULT 'NEW',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ
);

CREATE TABLE "KitchenTicketItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "kitchenTicketId" UUID NOT NULL,
  "orderItemId" UUID NOT NULL,
  "status" "KitchenStatus" NOT NULL DEFAULT 'NEW'
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "orderId" UUID,
  "reservationId" UUID,
  "provider" TEXT NOT NULL DEFAULT 'DEMO',
  "amountMinor" BIGINT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PaymentAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "paymentId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  "result" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Refund" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "paymentId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "TableToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "diningTableId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "expiresAt" TIMESTAMPTZ
);

CREATE TABLE "AssistanceRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "diningTableId" UUID NOT NULL,
  "type" "AssistanceType" NOT NULL,
  "status" "AssistanceStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ
);

CREATE TABLE "ContentPage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "ContentBlock" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "contentPageId" UUID NOT NULL,
  "blockType" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "GalleryItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "mediaAssetId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "PrivateDiningEnquiry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "guestName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "partySize" INTEGER NOT NULL,
  "preferredAt" TIMESTAMPTZ,
  "status" TEXT NOT NULL DEFAULT 'NEW',
  "message" TEXT
);

CREATE TABLE "Promotion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "demoOnly" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ
);

CREATE TABLE "IdempotencyRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "result" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("scope", "key")
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "restaurantId" UUID,
  "actorUserId" UUID,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Session" ADD CONSTRAINT "fk_Session_userId" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "RolePermission" ADD CONSTRAINT "fk_RolePermission_roleId" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT;

ALTER TABLE "RolePermission" ADD CONSTRAINT "fk_RolePermission_permissionId" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT;

ALTER TABLE "StaffMembership" ADD CONSTRAINT "fk_StaffMembership_userId" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "StaffMembership" ADD CONSTRAINT "fk_StaffMembership_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "StaffRole" ADD CONSTRAINT "fk_StaffRole_staffMembershipId" FOREIGN KEY ("staffMembershipId") REFERENCES "StaffMembership"("id") ON DELETE RESTRICT;

ALTER TABLE "StaffRole" ADD CONSTRAINT "fk_StaffRole_roleId" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT;

ALTER TABLE "GuestPreference" ADD CONSTRAINT "fk_GuestPreference_guestProfileId" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE RESTRICT;

ALTER TABLE "GuestConsent" ADD CONSTRAINT "fk_GuestConsent_guestProfileId" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE RESTRICT;

ALTER TABLE "Restaurant" ADD CONSTRAINT "fk_Restaurant_demoEnvironmentId" FOREIGN KEY ("demoEnvironmentId") REFERENCES "DemoEnvironment"("id") ON DELETE RESTRICT;

ALTER TABLE "DemoSeedRun" ADD CONSTRAINT "fk_DemoSeedRun_demoEnvironmentId" FOREIGN KEY ("demoEnvironmentId") REFERENCES "DemoEnvironment"("id") ON DELETE RESTRICT;

ALTER TABLE "DiningZone" ADD CONSTRAINT "fk_DiningZone_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "DiningTable" ADD CONSTRAINT "fk_DiningTable_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "DiningTable" ADD CONSTRAINT "fk_DiningTable_diningZoneId" FOREIGN KEY ("diningZoneId") REFERENCES "DiningZone"("id") ON DELETE RESTRICT;

ALTER TABLE "TableCombination" ADD CONSTRAINT "fk_TableCombination_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "TableCombinationMember" ADD CONSTRAINT "fk_TableCombinationMember_tableCombinationId" FOREIGN KEY ("tableCombinationId") REFERENCES "TableCombination"("id") ON DELETE RESTRICT;

ALTER TABLE "TableCombinationMember" ADD CONSTRAINT "fk_TableCombinationMember_diningTableId" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT;

ALTER TABLE "ServicePeriod" ADD CONSTRAINT "fk_ServicePeriod_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "SpecialClosure" ADD CONSTRAINT "fk_SpecialClosure_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "Reservation" ADD CONSTRAINT "fk_Reservation_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "Reservation" ADD CONSTRAINT "fk_Reservation_guestProfileId" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE RESTRICT;

ALTER TABLE "ReservationTable" ADD CONSTRAINT "fk_ReservationTable_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "ReservationTable" ADD CONSTRAINT "fk_ReservationTable_reservationId" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

ALTER TABLE "ReservationTable" ADD CONSTRAINT "fk_ReservationTable_diningTableId" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT;

ALTER TABLE "TableOccupancy" ADD CONSTRAINT "fk_TableOccupancy_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "TableOccupancy" ADD CONSTRAINT "fk_TableOccupancy_diningTableId" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT;

ALTER TABLE "ReservationEvent" ADD CONSTRAINT "fk_ReservationEvent_reservationId" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

ALTER TABLE "ReservationEvent" ADD CONSTRAINT "fk_ReservationEvent_actorUserId" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "GuestManageToken" ADD CONSTRAINT "fk_GuestManageToken_reservationId" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "fk_WaitlistEntry_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "fk_WaitlistEntry_guestProfileId" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE RESTRICT;

ALTER TABLE "WaitlistEvent" ADD CONSTRAINT "fk_WaitlistEvent_waitlistEntryId" FOREIGN KEY ("waitlistEntryId") REFERENCES "WaitlistEntry"("id") ON DELETE RESTRICT;

ALTER TABLE "Menu" ADD CONSTRAINT "fk_Menu_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuCategory" ADD CONSTRAINT "fk_MenuCategory_menuId" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItem" ADD CONSTRAINT "fk_MenuItem_menuCategoryId" FOREIGN KEY ("menuCategoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItemPrice" ADD CONSTRAINT "fk_MenuItemPrice_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItemAllergen" ADD CONSTRAINT "fk_MenuItemAllergen_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItemAllergen" ADD CONSTRAINT "fk_MenuItemAllergen_allergenId" FOREIGN KEY ("allergenId") REFERENCES "Allergen"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuAvailability" ADD CONSTRAINT "fk_MenuAvailability_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "MediaAsset" ADD CONSTRAINT "fk_MediaAsset_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItemMedia" ADD CONSTRAINT "fk_MenuItemMedia_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "MenuItemMedia" ADD CONSTRAINT "fk_MenuItemMedia_mediaAssetId" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT;

ALTER TABLE "DiningExperience" ADD CONSTRAINT "fk_DiningExperience_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "ExperienceCourse" ADD CONSTRAINT "fk_ExperienceCourse_diningExperienceId" FOREIGN KEY ("diningExperienceId") REFERENCES "DiningExperience"("id") ON DELETE RESTRICT;

ALTER TABLE "ExperienceCourse" ADD CONSTRAINT "fk_ExperienceCourse_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "Order" ADD CONSTRAINT "fk_Order_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "Order" ADD CONSTRAINT "fk_Order_guestProfileId" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE RESTRICT;

ALTER TABLE "Order" ADD CONSTRAINT "fk_Order_reservationId" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

ALTER TABLE "OrderItem" ADD CONSTRAINT "fk_OrderItem_orderId" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT;

ALTER TABLE "OrderItem" ADD CONSTRAINT "fk_OrderItem_menuItemId" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT;

ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "fk_OrderItemModifier_orderItemId" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT;

ALTER TABLE "OrderEvent" ADD CONSTRAINT "fk_OrderEvent_orderId" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT;

ALTER TABLE "OrderEvent" ADD CONSTRAINT "fk_OrderEvent_actorUserId" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "KitchenTicket" ADD CONSTRAINT "fk_KitchenTicket_orderId" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT;

ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT "fk_KitchenTicketItem_kitchenTicketId" FOREIGN KEY ("kitchenTicketId") REFERENCES "KitchenTicket"("id") ON DELETE RESTRICT;

ALTER TABLE "KitchenTicketItem" ADD CONSTRAINT "fk_KitchenTicketItem_orderItemId" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT;

ALTER TABLE "Payment" ADD CONSTRAINT "fk_Payment_orderId" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT;

ALTER TABLE "Payment" ADD CONSTRAINT "fk_Payment_reservationId" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT;

ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "fk_PaymentAttempt_paymentId" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT;

ALTER TABLE "Refund" ADD CONSTRAINT "fk_Refund_paymentId" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT;

ALTER TABLE "TableToken" ADD CONSTRAINT "fk_TableToken_diningTableId" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT;

ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "fk_AssistanceRequest_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "AssistanceRequest" ADD CONSTRAINT "fk_AssistanceRequest_diningTableId" FOREIGN KEY ("diningTableId") REFERENCES "DiningTable"("id") ON DELETE RESTRICT;

ALTER TABLE "ContentPage" ADD CONSTRAINT "fk_ContentPage_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "ContentBlock" ADD CONSTRAINT "fk_ContentBlock_contentPageId" FOREIGN KEY ("contentPageId") REFERENCES "ContentPage"("id") ON DELETE RESTRICT;

ALTER TABLE "GalleryItem" ADD CONSTRAINT "fk_GalleryItem_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "GalleryItem" ADD CONSTRAINT "fk_GalleryItem_mediaAssetId" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT;

ALTER TABLE "PrivateDiningEnquiry" ADD CONSTRAINT "fk_PrivateDiningEnquiry_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "Promotion" ADD CONSTRAINT "fk_Promotion_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "Notification" ADD CONSTRAINT "fk_Notification_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "OutboxEvent" ADD CONSTRAINT "fk_OutboxEvent_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "AuditLog" ADD CONSTRAINT "fk_AuditLog_restaurantId" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT;

ALTER TABLE "AuditLog" ADD CONSTRAINT "fk_AuditLog_actorUserId" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE INDEX "idx_StaffMembership_restaurantId" ON "StaffMembership" ("restaurantId");

CREATE INDEX "idx_DiningZone_restaurantId" ON "DiningZone" ("restaurantId");

CREATE INDEX "idx_DiningTable_restaurantId" ON "DiningTable" ("restaurantId");

CREATE INDEX "idx_TableCombination_restaurantId" ON "TableCombination" ("restaurantId");

CREATE INDEX "idx_ServicePeriod_restaurantId" ON "ServicePeriod" ("restaurantId");

CREATE INDEX "idx_SpecialClosure_restaurantId" ON "SpecialClosure" ("restaurantId");

CREATE INDEX "idx_BookingPolicy_restaurantId" ON "BookingPolicy" ("restaurantId");

CREATE INDEX "idx_Reservation_restaurantId" ON "Reservation" ("restaurantId");

CREATE INDEX "idx_Reservation_restaurantId_startsAt_status" ON "Reservation" ("restaurantId", "startsAt", "status");

CREATE INDEX "idx_ReservationTable_restaurantId" ON "ReservationTable" ("restaurantId");

CREATE INDEX "idx_TableOccupancy_restaurantId" ON "TableOccupancy" ("restaurantId");

CREATE INDEX "idx_TableOccupancy_diningTableId_startsAt" ON "TableOccupancy" ("diningTableId", "startsAt");

CREATE INDEX "idx_WaitlistEntry_restaurantId" ON "WaitlistEntry" ("restaurantId");

CREATE INDEX "idx_Menu_restaurantId" ON "Menu" ("restaurantId");

CREATE INDEX "idx_MediaAsset_restaurantId" ON "MediaAsset" ("restaurantId");

CREATE INDEX "idx_DiningExperience_restaurantId" ON "DiningExperience" ("restaurantId");

CREATE INDEX "idx_Order_restaurantId" ON "Order" ("restaurantId");

CREATE INDEX "idx_Order_restaurantId_createdAt" ON "Order" ("restaurantId", "createdAt");

CREATE INDEX "idx_KitchenTicket_status_createdAt" ON "KitchenTicket" ("status", "createdAt");

CREATE INDEX "idx_AssistanceRequest_restaurantId" ON "AssistanceRequest" ("restaurantId");

CREATE INDEX "idx_ContentPage_restaurantId" ON "ContentPage" ("restaurantId");

CREATE INDEX "idx_GalleryItem_restaurantId" ON "GalleryItem" ("restaurantId");

CREATE INDEX "idx_PrivateDiningEnquiry_restaurantId" ON "PrivateDiningEnquiry" ("restaurantId");

CREATE INDEX "idx_Promotion_restaurantId" ON "Promotion" ("restaurantId");

CREATE INDEX "idx_Notification_restaurantId" ON "Notification" ("restaurantId");

CREATE INDEX "idx_OutboxEvent_restaurantId" ON "OutboxEvent" ("restaurantId");

CREATE INDEX "idx_AuditLog_restaurantId" ON "AuditLog" ("restaurantId");

ALTER TABLE "DiningTable" ADD CONSTRAINT table_capacity_check CHECK ("minCapacity" >= 1 AND "maxCapacity" >= "minCapacity");

ALTER TABLE "Reservation" ADD CONSTRAINT reservation_times_check CHECK ("endsAt" > "startsAt" AND "partySize" > 0);

ALTER TABLE "TableOccupancy" ADD CONSTRAINT occupancy_times_check CHECK ("endsAt" > "startsAt");

ALTER TABLE "TableOccupancy" ADD CONSTRAINT occupancy_no_overlap EXCLUDE USING gist ("diningTableId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&) WHERE ("active" = TRUE);
