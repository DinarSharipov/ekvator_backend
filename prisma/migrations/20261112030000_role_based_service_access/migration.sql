-- Keep existing administrators and customers unchanged while introducing
-- least-privilege roles and per-service work assignments.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'employee';

CREATE TABLE "UserServiceAssignment" (
  "userId" INTEGER NOT NULL,
  "serviceTypeId" INTEGER NOT NULL,
  CONSTRAINT "UserServiceAssignment_pkey" PRIMARY KEY ("userId", "serviceTypeId"),
  CONSTRAINT "UserServiceAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserServiceAssignment_serviceTypeId_fkey"
    FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "UserServiceAssignment_serviceTypeId_idx"
  ON "UserServiceAssignment"("serviceTypeId");
