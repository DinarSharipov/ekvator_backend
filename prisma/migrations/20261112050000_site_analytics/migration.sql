BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "AnalyticsEventType" AS ENUM ('page_view', 'click');

CREATE TABLE "AnalyticsEvent" (
  "id" SERIAL NOT NULL,
  "eventId" UUID NOT NULL,
  "visitorId" UUID NOT NULL,
  "userId" INTEGER,
  "type" "AnalyticsEventType" NOT NULL,
  "path" TEXT NOT NULL,
  "target" TEXT,
  "serviceTypeId" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsEvent_eventId_key" ON "AnalyticsEvent"("eventId");
CREATE INDEX "AnalyticsEvent_occurredAt_visitorId_idx" ON "AnalyticsEvent"("occurredAt", "visitorId");
CREATE INDEX "AnalyticsEvent_type_occurredAt_idx" ON "AnalyticsEvent"("type", "occurredAt");
CREATE INDEX "AnalyticsEvent_serviceTypeId_occurredAt_idx" ON "AnalyticsEvent"("serviceTypeId", "occurredAt");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
