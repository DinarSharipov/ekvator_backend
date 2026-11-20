BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "ServiceKind" AS ENUM ('goods', 'services');
ALTER TABLE "ServiceType" ADD COLUMN "kind" "ServiceKind" NOT NULL DEFAULT 'goods';
-- Preserve quantity-based appointment orders and existing period bookings.
UPDATE "ServiceType" SET "kind" = 'services' WHERE "bookingMode" = 'duration';
ALTER TABLE "ServiceType" ADD CONSTRAINT "ServiceType_goods_appointment_check"
  CHECK ("kind" <> 'goods' OR "bookingMode" = 'appointment');
COMMIT;
