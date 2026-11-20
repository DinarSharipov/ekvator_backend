BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE "User", "AccessRole", "UserAccessRole", "RolePrivilege" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "AccessRole" ADD COLUMN "isAdministrator" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "AccessRole_single_administrator" ON "AccessRole" ("isAdministrator") WHERE "isAdministrator";

-- Do not reuse names supplied by users: existing custom roles keep their identity.
CREATE TEMP TABLE migrated_roles (kind TEXT PRIMARY KEY, id INTEGER) ON COMMIT DROP;
DO $$
DECLARE kind TEXT; label TEXT; candidate TEXT; new_id INTEGER; suffix INTEGER;
BEGIN
  FOREACH kind IN ARRAY ARRAY['admin', 'manager', 'employee'] LOOP
    label := CASE kind WHEN 'admin' THEN 'Администратор' WHEN 'manager' THEN 'Менеджер' ELSE 'Сотрудник' END;
    candidate := label;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM "AccessRole" WHERE lower("name") = lower(candidate)) LOOP
      suffix := suffix + 1;
      candidate := label || ' (' || suffix || ')';
    END LOOP;
    INSERT INTO "AccessRole" ("name", "isAdministrator", "updatedAt")
      VALUES (candidate, kind = 'admin', CURRENT_TIMESTAMP) RETURNING id INTO new_id;
    INSERT INTO migrated_roles VALUES (kind, new_id);
  END LOOP;
END $$;

DROP TRIGGER "RolePrivilege_validate" ON "RolePrivilege";
CREATE OR REPLACE FUNCTION validate_role_privilege() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition "Privilege"%ROWTYPE; administrator BOOLEAN;
BEGIN
  SELECT * INTO definition FROM "Privilege" WHERE "key" = NEW."privilege";
  SELECT "isAdministrator" INTO administrator FROM "AccessRole" WHERE id = NEW."roleId";
  IF (definition."adminOnly" AND NOT administrator) OR (NOT definition."scoped" AND NEW."scope" <> 'all') THEN
    RAISE EXCEPTION 'Invalid or administrator-only role privilege'
      USING ERRCODE = '23514', CONSTRAINT = 'RolePrivilege_valid_scope';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RolePrivilege_validate" BEFORE INSERT OR UPDATE ON "RolePrivilege"
  FOR EACH ROW EXECUTE FUNCTION validate_role_privilege();

INSERT INTO "RolePrivilege" ("roleId", privilege, scope)
  SELECT r.id, p.key, 'all' FROM migrated_roles r CROSS JOIN "Privilege" p WHERE r.kind = 'admin';
INSERT INTO "RolePrivilege" ("roleId", privilege, scope)
  SELECT r.id, p.key, 'assigned' FROM migrated_roles r CROSS JOIN "Privilege" p
  WHERE (r.kind = 'manager' AND p.key IN ('items.create','items.update','items.delete','orders.read','orders.status',
    'orders.schedule','orders.archive','calendar.read','users.read','users.create','users.update','companies.charge'))
     OR (r.kind = 'employee' AND p.key IN ('orders.read','orders.status','calendar.read'));
INSERT INTO "UserAccessRole" ("userId", "roleId")
  SELECT u.id, r.id FROM "User" u JOIN migrated_roles r ON r.kind = u."userRole"::text;

-- Move the invariant from obsolete account columns to the actual role assignments.
DROP TRIGGER "User_protect_last_administrator" ON "User";
DROP FUNCTION protect_last_administrator();
UPDATE "AdministratorState" SET "count" = (
  SELECT count(*) FROM "UserAccessRole" a JOIN "AccessRole" r ON r.id = a."roleId" WHERE r."isAdministrator"
) WHERE id = 1;
CREATE FUNCTION protect_last_administrator_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE was_admin BOOLEAN := false; now_admin BOOLEAN := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "isAdministrator" INTO was_admin FROM "AccessRole" WHERE id = OLD."roleId";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "isAdministrator" INTO now_admin FROM "AccessRole" WHERE id = NEW."roleId";
  END IF;
  IF now_admin AND NOT was_admin THEN
    UPDATE "AdministratorState" SET "count" = "count" + 1 WHERE id = 1;
  ELSIF was_admin AND NOT now_admin THEN
    UPDATE "AdministratorState" SET "count" = "count" - 1 WHERE id = 1 AND "count" > 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The last administrator assignment cannot be removed'
        USING ERRCODE = '23514', CONSTRAINT = 'User_last_administrator';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "UserAccessRole_protect_last_administrator" AFTER INSERT OR UPDATE OR DELETE ON "UserAccessRole"
  FOR EACH ROW EXECUTE FUNCTION protect_last_administrator_assignment();
CREATE TRIGGER "UserAccessRole_protect_truncate" BEFORE TRUNCATE ON "UserAccessRole"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_administrator_truncate();

CREATE FUNCTION protect_administrator_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."isAdministrator" OR (TG_OP = 'UPDATE' AND NEW."isAdministrator") THEN
    RAISE EXCEPTION 'The administrator role is protected'
      USING ERRCODE = '23514', CONSTRAINT = 'AccessRole_protected_administrator';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AccessRole_protect_administrator" BEFORE UPDATE OR DELETE ON "AccessRole"
  FOR EACH ROW EXECUTE FUNCTION protect_administrator_role();
CREATE FUNCTION protect_administrator_grants() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM "AccessRole" WHERE id = OLD."roleId" AND "isAdministrator") THEN
    RAISE EXCEPTION 'Administrator privileges are protected'
      USING ERRCODE = '23514', CONSTRAINT = 'AccessRole_protected_administrator';
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM "AccessRole" WHERE id = NEW."roleId" AND "isAdministrator") THEN
    RAISE EXCEPTION 'Administrator privileges are protected'
      USING ERRCODE = '23514', CONSTRAINT = 'AccessRole_protected_administrator';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "RolePrivilege_protect_administrator" BEFORE INSERT OR UPDATE OR DELETE ON "RolePrivilege"
  FOR EACH ROW EXECUTE FUNCTION protect_administrator_grants();
-- Truncate bypasses row triggers; protect both catalogue tables even on an empty installation.
CREATE FUNCTION reject_role_catalogue_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Cannot truncate the protected role catalogue'
    USING ERRCODE = '23514', CONSTRAINT = 'AccessRole_protected_administrator';
END $$;
CREATE TRIGGER "AccessRole_protect_truncate" BEFORE TRUNCATE ON "AccessRole"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_role_catalogue_truncate();
CREATE TRIGGER "RolePrivilege_protect_truncate" BEFORE TRUNCATE ON "RolePrivilege"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_role_catalogue_truncate();

ALTER TABLE "User" DROP COLUMN "userRole", DROP COLUMN "role";
DROP TYPE "UserRole";
UPDATE "Privilege" SET description = 'Назначение ролей пользователям' WHERE key = 'roles.assign';
COMMIT;
