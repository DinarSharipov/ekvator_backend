BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "CompanyMemberRole" AS ENUM ('owner', 'employee');
CREATE TYPE "CompanyTopUpStatus" AS ENUM ('pending', 'confirmed', 'cancelled');
CREATE TYPE "CompanyLedgerKind" AS ENUM ('top_up', 'allocation', 'release', 'spend', 'refund');

CREATE TABLE "Company" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "inn" TEXT,
  "balanceMinor" INTEGER NOT NULL DEFAULT 0,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Company_balanceMinor_nonnegative" CHECK ("balanceMinor" >= 0)
);

CREATE TABLE "CompanyMember" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "role" "CompanyMemberRole" NOT NULL DEFAULT 'employee',
  "balanceMinor" INTEGER NOT NULL DEFAULT 0,
  "qrToken" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyMember_balanceMinor_nonnegative" CHECK ("balanceMinor" >= 0)
);

CREATE TABLE "CompanyTopUp" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "status" "CompanyTopUpStatus" NOT NULL DEFAULT 'pending',
  "createdById" INTEGER NOT NULL,
  "confirmedById" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyTopUp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyTopUp_amount_positive" CHECK ("amountMinor" > 0)
);

CREATE TABLE "CompanyLedgerEntry" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "companyMemberId" INTEGER,
  "kind" "CompanyLedgerKind" NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "transferId" TEXT,
  "reference" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyLedgerEntry_amount_nonzero" CHECK ("amountMinor" <> 0)
);

CREATE UNIQUE INDEX "CompanyMember_companyId_userId_key" ON "CompanyMember"("companyId", "userId");
CREATE UNIQUE INDEX "CompanyMember_qrToken_key" ON "CompanyMember"("qrToken");
CREATE INDEX "Company_createdById_idx" ON "Company"("createdById");
CREATE INDEX "CompanyMember_userId_isActive_idx" ON "CompanyMember"("userId", "isActive");
CREATE INDEX "CompanyTopUp_companyId_status_createdAt_idx" ON "CompanyTopUp"("companyId", "status", "createdAt");
CREATE INDEX "CompanyLedgerEntry_companyId_createdAt_idx" ON "CompanyLedgerEntry"("companyId", "createdAt");
CREATE INDEX "CompanyLedgerEntry_companyMemberId_createdAt_idx" ON "CompanyLedgerEntry"("companyMemberId", "createdAt");
CREATE INDEX "CompanyLedgerEntry_transferId_idx" ON "CompanyLedgerEntry"("transferId");

ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMember" ADD CONSTRAINT "CompanyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyTopUp" ADD CONSTRAINT "CompanyTopUp_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyTopUp" ADD CONSTRAINT "CompanyTopUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyTopUp" ADD CONSTRAINT "CompanyTopUp_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyLedgerEntry" ADD CONSTRAINT "CompanyLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyLedgerEntry" ADD CONSTRAINT "CompanyLedgerEntry_companyMemberId_fkey" FOREIGN KEY ("companyMemberId") REFERENCES "CompanyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyLedgerEntry" ADD CONSTRAINT "CompanyLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
