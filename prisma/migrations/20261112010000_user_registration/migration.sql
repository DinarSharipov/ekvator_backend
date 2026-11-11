BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- A constant default assigns admin to old rows without an UPDATE/table rewrite (PostgreSQL 16).
ALTER TABLE "User"
  ADD COLUMN "userRole" "UserRole" NOT NULL DEFAULT 'admin',
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "phoneNormalized" TEXT,
  ALTER COLUMN "role" SET DEFAULT 'user';
ALTER TABLE "User" ALTER COLUMN "userRole" SET DEFAULT 'user';

-- Populate only a new lookup column. Never rewrite original phone, login, password or role values.
WITH phones AS (
  SELECT id, regexp_replace(phone, '[[:space:]()+-]', '', 'g') AS digits
  FROM "User" WHERE phone IS NOT NULL
), normalized AS (
  SELECT id, CASE
    WHEN digits ~ '^8[0-9]{10}$' THEN '+7' || substring(digits FROM 2)
    WHEN digits ~ '^[0-9]{10}$' THEN '+7' || digits
    WHEN digits ~ '^[1-9][0-9]{10,14}$' THEN '+' || digits
    ELSE NULL
  END AS phone_key FROM phones
)
UPDATE "User" AS u SET "phoneNormalized" = n.phone_key
FROM normalized AS n WHERE u.id = n.id AND n.phone_key IS NOT NULL;

-- Abort atomically rather than silently changing or deleting duplicate accounts.
DO $$ BEGIN
  IF EXISTS (SELECT login FROM "User" GROUP BY login HAVING count(*) > 1)
     OR EXISTS (SELECT "phoneNormalized" FROM "User" WHERE "phoneNormalized" IS NOT NULL GROUP BY "phoneNormalized" HAVING count(*) > 1)
  THEN
    RAISE EXCEPTION 'Duplicate logins or normalized phones exist. Resolve duplicates before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
CREATE UNIQUE INDEX "User_phoneNormalized_key" ON "User"("phoneNormalized");
COMMIT;
