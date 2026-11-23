CREATE TABLE "Partner" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "image" TEXT NOT NULL,
  "site" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "person" TEXT,
  "inn" TEXT,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);
