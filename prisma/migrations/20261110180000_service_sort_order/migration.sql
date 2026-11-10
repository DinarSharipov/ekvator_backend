ALTER TABLE "ServiceType" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT "id", (ROW_NUMBER() OVER (ORDER BY "name" DESC, "id" ASC) - 1)::INTEGER AS position
  FROM "ServiceType"
)
UPDATE "ServiceType" SET "sortOrder" = ordered.position FROM ordered WHERE "ServiceType"."id" = ordered."id";
