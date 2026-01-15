/*
  Warnings:

  - You are about to drop the column `showType` on the `ServiceElement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ServiceElement" DROP COLUMN "showType";

-- AlterTable
ALTER TABLE "ServiceType" ADD COLUMN     "showType" TEXT DEFAULT 'table';
