BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE TYPE "AccessScope" AS ENUM ('all', 'assigned');
CREATE TABLE "Privilege" (
  "key" TEXT PRIMARY KEY,
  "description" TEXT NOT NULL,
  "scoped" BOOLEAN NOT NULL DEFAULT false,
  "adminOnly" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE "AccessRole" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AccessRole_name_lower_key" ON "AccessRole" (lower("name"));
CREATE TABLE "RolePrivilege" (
  "roleId" INTEGER NOT NULL REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "privilege" TEXT NOT NULL REFERENCES "Privilege"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scope" "AccessScope" NOT NULL DEFAULT 'assigned',
  PRIMARY KEY ("roleId", "privilege")
);
CREATE TABLE "UserAccessRole" (
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "roleId" INTEGER NOT NULL REFERENCES "AccessRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("userId", "roleId")
);
CREATE INDEX "UserAccessRole_roleId_idx" ON "UserAccessRole"("roleId");

-- The counter row serializes administrator insertions, demotions and deletions,
-- including direct SQL and bulk writes. Rollback restores both user and counter.
LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "AdministratorState" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "count" INTEGER NOT NULL DEFAULT 0 CHECK ("count" >= 0)
);
INSERT INTO "AdministratorState" ("id", "count") SELECT 1, count(*) FROM "User" WHERE "userRole" = 'admin';
CREATE FUNCTION protect_last_administrator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."userRole" = 'admin' THEN
      UPDATE "AdministratorState" SET "count" = "count" + 1 WHERE "id" = 1;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD."userRole" = NEW."userRole" THEN RETURN NEW; END IF;
    IF NEW."userRole" = 'admin' THEN
      UPDATE "AdministratorState" SET "count" = "count" + 1 WHERE "id" = 1;
      RETURN NEW;
    END IF;
  END IF;
  IF OLD."userRole" = 'admin' THEN
    UPDATE "AdministratorState" SET "count" = "count" - 1 WHERE "id" = 1 AND "count" > 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The last administrator cannot be removed or demoted'
        USING ERRCODE = '23514', CONSTRAINT = 'User_last_administrator';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "User_protect_last_administrator"
  AFTER INSERT OR DELETE OR UPDATE OF "userRole" ON "User"
  FOR EACH ROW EXECUTE FUNCTION protect_last_administrator();
CREATE FUNCTION protect_administrator_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AdministratorState" WHERE "count" > 0) THEN
    RAISE EXCEPTION 'Cannot truncate accounts containing an administrator'
      USING ERRCODE = '23514', CONSTRAINT = 'User_last_administrator';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER "User_protect_administrator_truncate" BEFORE TRUNCATE ON "User"
  FOR EACH STATEMENT EXECUTE FUNCTION protect_administrator_truncate();

CREATE FUNCTION validate_role_privilege() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE definition "Privilege"%ROWTYPE;
BEGIN
  SELECT * INTO definition FROM "Privilege" WHERE "key" = NEW."privilege";
  IF definition."adminOnly" OR (NOT definition."scoped" AND NEW."scope" <> 'all') THEN
    RAISE EXCEPTION 'Invalid or administrator-only role privilege'
      USING ERRCODE = '23514', CONSTRAINT = 'RolePrivilege_valid_scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RolePrivilege_validate" BEFORE INSERT OR UPDATE ON "RolePrivilege"
  FOR EACH ROW EXECUTE FUNCTION validate_role_privilege();

-- Catalogue seeds are appended below before COMMIT.
INSERT INTO "Privilege" ("key", "description", "scoped", "adminOnly") VALUES
('services.create', 'Создание направлений', false, false),
('services.update', 'Изменение направлений', true, false),
('services.delete', 'Удаление направлений', false, false),
('services.reorder', 'Изменение порядка направлений', false, false),
('items.create', 'Создание товаров и услуг', true, false),
('items.update', 'Редактирование и архивация товаров и услуг', true, false),
('items.delete', 'Удаление товаров и услуг', true, false),
('orders.read', 'Просмотр рабочих заказов', true, false),
('orders.status', 'Изменение статусов заказов', true, false),
('orders.schedule', 'Согласование времени заказов', true, false),
('orders.archive', 'Архивация заказов', true, false),
('calendar.read', 'Просмотр календаря и его фильтров', true, false),
('users.read', 'Просмотр пользователей', true, false),
('users.create', 'Создание обычных пользователей и сотрудников', true, false),
('users.update', 'Редактирование обычных пользователей и сотрудников', true, false),
('users.delete', 'Удаление обычных пользователей и сотрудников', true, false),
('companies.read', 'Просмотр всех компаний', false, false),
('companies.manage', 'Управление участниками, депозитами и журналом компаний', false, false),
('topups.read', 'Просмотр заявок на пополнение компаний', false, false),
('topups.confirm', 'Подтверждение поступления денег компаний', false, false),
('companies.charge', 'Списание корпоративного депозита по QR', true, false),
('analytics.read', 'Просмотр аналитики', false, false),
('settings.update', 'Редактирование контактов комплекса', false, false),
('roles.read', 'Просмотр ролей и привилегий', false, true),
('roles.create', 'Создание ролей', false, true),
('roles.update', 'Редактирование ролей и их привилегий', false, true),
('roles.delete', 'Удаление ролей', false, true),
('roles.assign', 'Назначение ролей и системных уровней доступа', false, true);
COMMIT;
