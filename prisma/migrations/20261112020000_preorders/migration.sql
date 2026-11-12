BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "BookingMode" AS ENUM ('appointment', 'duration');
CREATE TYPE "PreorderStatus" AS ENUM ('pending', 'needs_confirmation', 'accepted', 'in_progress', 'ready', 'completed', 'rejected', 'cancelled');
CREATE TYPE "PaymentStatus" AS ENUM ('not_required', 'pending', 'paid', 'refunded');

ALTER TABLE "ServiceType"
  ADD COLUMN "acceptsPreorders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowMixedCart" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "bookingMode" "BookingMode" NOT NULL DEFAULT 'appointment',
  ADD COLUMN "bookingCapacity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "prepaymentEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Existing rows receive the safe default. NOT VALID avoids a long table scan during deployment
-- while still enforcing the invariant for all future writes.
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_bookingCapacity_check" CHECK ("bookingCapacity" > 0) NOT VALID;

ALTER TABLE "ServiceElement"
  ADD COLUMN "preorderAvailable" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Cart" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CartItem" (
  "id" SERIAL NOT NULL,
  "cartId" INTEGER NOT NULL,
  "serviceElementId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CartItem_cartId_serviceElementId_key" ON "CartItem"("cartId", "serviceElementId");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_serviceElementId_fkey" FOREIGN KEY ("serviceElementId") REFERENCES "ServiceElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Preorder" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "status" "PreorderStatus" NOT NULL DEFAULT 'pending',
  "desiredStartAt" TIMESTAMP(3) NOT NULL,
  "desiredEndAt" TIMESTAMP(3),
  "scheduledStartAt" TIMESTAMP(3) NOT NULL,
  "scheduledEndAt" TIMESTAMP(3),
  "completionDueAt" TIMESTAMP(3) NOT NULL,
  "postponedUntil" TIMESTAMP(3),
  "postponementUsed" BOOLEAN NOT NULL DEFAULT false,
  "customerNote" TEXT,
  "adminNote" TEXT,
  "proposedStartAt" TIMESTAMP(3),
  "proposedEndAt" TIMESTAMP(3),
  "proposalNote" TEXT,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'not_required',
  "paymentFeatureEnabled" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Preorder_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Preorder" ADD CONSTRAINT "Preorder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Preorder_userId_createdAt_idx" ON "Preorder"("userId", "createdAt");
CREATE INDEX "Preorder_status_isArchived_scheduledStartAt_idx" ON "Preorder"("status", "isArchived", "scheduledStartAt");
CREATE INDEX "Preorder_completionDueAt_status_idx" ON "Preorder"("completionDueAt", "status");

CREATE TABLE "PreorderItem" (
  "id" SERIAL NOT NULL,
  "preorderId" INTEGER NOT NULL,
  "serviceElementId" INTEGER NOT NULL,
  "serviceTypeId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "PreorderItem_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PreorderItem" ADD CONSTRAINT "PreorderItem_preorderId_fkey" FOREIGN KEY ("preorderId") REFERENCES "Preorder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreorderItem" ADD CONSTRAINT "PreorderItem_serviceElementId_fkey" FOREIGN KEY ("serviceElementId") REFERENCES "ServiceElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PreorderItem" ADD CONSTRAINT "PreorderItem_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "PreorderItem_preorderId_idx" ON "PreorderItem"("preorderId");

COMMIT;
