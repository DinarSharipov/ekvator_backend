const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Client } = require("pg");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const url = new URL(
  process.env.TEST_DATABASE_URL || "postgresql://localhost/missing",
);
if (
  !process.env.TEST_DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error(
    "Disposable local TEST_DATABASE_URL ending in _test required",
  );

test("unified role migration preserves populated data and existing effective privileges", async () => {
  const client = new Client({ connectionString: url.toString() });
  const schema = `unified_upgrade_${Date.now()}`;
  const root = join(__dirname, "../prisma/migrations");
  const migration = "20261120040000_unified_roles";
  const manager = [
    "items.create",
    "items.update",
    "items.delete",
    "orders.read",
    "orders.status",
    "orders.schedule",
    "orders.archive",
    "calendar.read",
    "users.read",
    "users.create",
    "users.update",
    "companies.charge",
  ];
  const employee = ["orders.read", "orders.status", "calendar.read"];
  await client.connect();
  const query = (sql, params) => client.query(sql, params);
  async function digest(table, columns = "*", where = "") {
    return (
      await query(
        `SELECT count(*)::int AS count, md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY row_to_json(t)::text)) AS digest FROM (SELECT ${columns} FROM "${table}" ${where}) t`,
      )
    ).rows[0];
  }
  try {
    await query(`CREATE SCHEMA "${schema}"`);
    await query(`SET search_path TO "${schema}"`);
    for (const name of readdirSync(root).sort()) {
      if (name === "migration_lock.toml" || name >= migration) continue;
      await query(readFileSync(join(root, name, "migration.sql"), "utf8"));
    }
    await query(`INSERT INTO "User" (login, name, password, "userRole", role)
      SELECT 'legacy-' || g, 'Legacy ' || g, 'original-hash-' || g,
      (ARRAY['admin','manager','employee','user'])[(g % 4) + 1]::"UserRole", 'old-display-' || g
      FROM generate_series(1,5000) g`);
    await query(`INSERT INTO "ServiceType" (name) VALUES ('Workshop');
      INSERT INTO "ServiceElement" (name,price,type) SELECT 'Catalogue ' || g, 123.45, 1 FROM generate_series(1,10000) g;
      INSERT INTO "UserServiceAssignment" ("userId","serviceTypeId") SELECT id,1 FROM "User";
      INSERT INTO "AccessRole" (name,"updatedAt") VALUES ('Менеджер',now()),('Администратор',now()),('Сотрудник',now());
      INSERT INTO "RolePrivilege" ("roleId",privilege,scope) SELECT id,'users.read','all' FROM "AccessRole";
      INSERT INTO "UserAccessRole" ("userId","roleId") SELECT id,1 FROM "User" WHERE id % 3 = 0`);
    const userColumns =
      'id,name,login,password,surname,phone,"phoneNormalized","phoneVerifiedAt",email,telegram';
    const before = {};
    for (const table of [
      "User",
      "ServiceType",
      "ServiceElement",
      "UserServiceAssignment",
      "RolePrivilege",
      "UserAccessRole",
    ])
      before[table] = await digest(table, table === "User" ? userColumns : "*");
    const oldRoles = (await query('SELECT * FROM "AccessRole" ORDER BY id'))
      .rows;
    const oldUsers = (
      await query('SELECT id, "userRole" FROM "User" ORDER BY id')
    ).rows;
    const oldCounter = (await query('SELECT * FROM "AdministratorState"'))
      .rows[0];
    const isolatedUrl = new URL(url);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const { spawnSync } = require("node:child_process");
    const preflight = () =>
      spawnSync(
        process.execPath,
        [
          join(__dirname, "../scripts/auth-preflight.cjs"),
          "--require-unified-roles",
        ],
        {
          env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
          encoding: "utf8",
        },
      );
    const blocked = preflight();
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /Automatic deployment refused/);
    assert.deepEqual(
      (await query('SELECT * FROM "AccessRole" ORDER BY id')).rows,
      oldRoles,
    );
    // A late dependency failure must undo seeded roles, assignments and triggers too.
    await query(
      'CREATE VIEW legacy_dependency AS SELECT "userRole" FROM "User"',
    );
    await assert.rejects(
      query(readFileSync(join(root, migration, "migration.sql"), "utf8")),
      (error) => error.code === "2BP01",
    );
    await query("ROLLBACK");
    assert.deepEqual(
      (await query('SELECT * FROM "AccessRole" ORDER BY id')).rows,
      oldRoles,
    );
    assert.deepEqual(await digest("UserAccessRole"), before.UserAccessRole);
    assert.deepEqual(
      (await query('SELECT * FROM "AdministratorState"')).rows[0],
      oldCounter,
    );
    await query("DROP VIEW legacy_dependency");
    await query(readFileSync(join(root, migration, "migration.sql"), "utf8"));
    for (const table of [
      "User",
      "ServiceType",
      "ServiceElement",
      "UserServiceAssignment",
    ])
      assert.deepEqual(
        await digest(table, table === "User" ? userColumns : "*"),
        before[table],
      );
    assert.deepEqual(
      (
        await query('SELECT * FROM "AccessRole" WHERE id <= 3 ORDER BY id')
      ).rows.map(({ isAdministrator, ...role }) => role),
      oldRoles,
    );
    assert.deepEqual(
      await digest("RolePrivilege", "*", 'WHERE "roleId" <= 3'),
      before.RolePrivilege,
    );
    assert.deepEqual(
      await digest("UserAccessRole", "*", 'WHERE "roleId" <= 3'),
      before.UserAccessRole,
    );
    assert.deepEqual(
      (await query('SELECT * FROM "AdministratorState"')).rows[0],
      oldCounter,
    );
    const roles = (
      await query(`SELECT r.id, r."isAdministrator", json_agg(json_build_object('privilege', g.privilege, 'scope', g.scope)) AS grants
      FROM "AccessRole" r JOIN "RolePrivilege" g ON g."roleId" = r.id GROUP BY r.id`)
    ).rows;
    const assignments = (await query('SELECT * FROM "UserAccessRole"')).rows;
    const definitions = (
      await query('SELECT key FROM "Privilege" ORDER BY key')
    ).rows;
    const { effectivePrivileges } = require("../dist/auth/privileges");
    const ordered = (grants) =>
      grants.sort((a, b) => a.privilege.localeCompare(b.privilege));
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const assignmentsByUser = new Map();
    for (const assignment of assignments) {
      const entries = assignmentsByUser.get(assignment.userId) ?? [];
      entries.push({ role: rolesById.get(assignment.roleId) });
      assignmentsByUser.set(assignment.userId, entries);
    }
    for (const user of oldUsers) {
      const expected = new Map();
      const keys =
        user.userRole === "admin"
          ? definitions.map(({ key }) => key)
          : user.userRole === "manager"
            ? manager
            : user.userRole === "employee"
              ? employee
              : [];
      for (const key of keys)
        expected.set(key, user.userRole === "admin" ? "all" : "assigned");
      if (user.id % 3 === 0) expected.set("users.read", "all");
      assert.deepEqual(
        ordered(
          effectivePrivileges({
            accessRoles: assignmentsByUser.get(user.id) ?? [],
          }),
        ),
        ordered(
          [...expected].map(([privilege, scope]) => ({ privilege, scope })),
        ),
      );
    }
    assert.equal(
      (
        await query(`SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'User' AND column_name IN ('role','userRole')`)
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await query(`SELECT count(*)::int AS count FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname=current_schema() AND t.typname='UserRole'`)
      ).rows[0].count,
      0,
    );
    assert.equal(roles.filter((role) => role.isAdministrator).length, 1);
    await query(
      'CREATE TABLE "_prisma_migrations" (finished_at timestamp, rolled_back_at timestamp)',
    );
    assert.equal(preflight().status, 0);
    const invariants = spawnSync(
      process.execPath,
      [join(__dirname, "../scripts/data-integrity.cjs"), "invariants"],
      {
        env: { ...process.env, DATABASE_URL: isolatedUrl.toString() },
        encoding: "utf8",
      },
    );
    assert.equal(invariants.status, 0, invariants.stderr);
  } finally {
    await query("ROLLBACK");
    await query(`DROP SCHEMA "${schema}" CASCADE`);
    await client.end();
  }
});

test("release verifier preserves all original tables and rejects changed access or business data", async () => {
  const control = new Client({ connectionString: url.toString() });
  const name = `unified_release_${Date.now()}_test`;
  const isolatedUrl = new URL(url);
  isolatedUrl.pathname = `/${name}`;
  const client = new Client({ connectionString: isolatedUrl.toString() });
  await control.connect();
  await control.query(`CREATE DATABASE "${name}"`);
  try {
    await client.connect();
    const root = join(__dirname, "../prisma/migrations");
    const migration = "20261120040000_unified_roles";
    for (const entry of readdirSync(root).sort()) {
      if (entry === "migration_lock.toml" || entry >= migration) continue;
      await client.query(readFileSync(join(root, entry, "migration.sql"), "utf8"));
    }
    await client.query(`INSERT INTO "User" (login,name,password,"userRole") VALUES
      ('release-admin','Original','original-hash','admin'),
      ('release-manager','Original','original-hash','manager'),
      ('release-employee','Original','original-hash','employee'),
      ('release-guest','Original','original-hash','user');
      INSERT INTO "AccessRole" (name,"updatedAt") VALUES ('Existing custom',now());
      INSERT INTO "RolePrivilege" ("roleId",privilege,scope) VALUES (1,'users.read','all');
      INSERT INTO "UserAccessRole" ("userId","roleId") SELECT id,1 FROM "User"`);
    const run = (mode, input) => spawnSync(process.execPath,
      [join(__dirname, "../scripts/unified-role-integrity.cjs"), mode],
      { env: { ...process.env, DATABASE_URL: isolatedUrl.toString() }, encoding: "utf8", input });
    const before = run("snapshot");
    assert.equal(before.status, 0, before.stderr);
    await client.query(readFileSync(join(root, migration, "migration.sql"), "utf8"));
    assert.equal(run("verify", before.stdout).status, 0);
    await client.query(`BEGIN; UPDATE "User" SET password='changed-hash' WHERE login='release-guest'`);
    // Changes must be committed to be visible to the external read-only verifier.
    await client.query("COMMIT");
    assert.equal(run("verify", before.stdout).status, 1);
    await client.query(`UPDATE "User" SET password='original-hash' WHERE login='release-guest'`);
    assert.equal(run("verify", before.stdout).status, 0);
    await client.query(`UPDATE "RolePrivilege" SET scope='assigned' WHERE "roleId"=1`);
    assert.equal(run("verify", before.stdout).status, 1);
  } finally {
    await client.end();
    await control.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await control.end();
  }
});
