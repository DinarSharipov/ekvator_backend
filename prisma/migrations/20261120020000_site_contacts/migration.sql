CREATE TABLE "SiteContacts" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "phones" TEXT[] NOT NULL,
  "email" TEXT,
  "workingHours" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "mapUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteContacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteContacts_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "SiteContacts_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
