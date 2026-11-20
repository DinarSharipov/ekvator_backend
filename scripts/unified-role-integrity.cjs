// Dedicated, read-only verifier for the one-time legacy-to-unified role cutover.
// Snapshots contain digests and role IDs only; keep them in the private release directory.
const { Pool } = require("pg");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const quote = (value) => `"${value.replaceAll('"', '""')}"`;
const manager = ["items.create", "items.update", "items.delete", "orders.read", "orders.status", "orders.schedule", "orders.archive", "calendar.read", "users.read", "users.create", "users.update", "companies.charge"];
const employee = ["orders.read", "orders.status", "calendar.read"];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '120s'");
    async function digest(sql, params = []) {
      return (await client.query(`SELECT count(*)::text AS count,
        md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS digest
        FROM (${sql}) t`, params)).rows[0];
    }
    async function tableDigest(table, roleIds) {
      const condition = table.name === "AccessRole" ? " WHERE id = ANY($1::int[])"
        : ["UserAccessRole", "RolePrivilege"].includes(table.name) ? ' WHERE "roleId" = ANY($1::int[])' : "";
      // The migration deliberately updates this one catalogue description.
      const columns = table.columns.map((column) => table.name === "Privilege" && column === "description"
        ? `CASE WHEN key='roles.assign' THEN 'Назначение ролей пользователям' ELSE description END AS description` : quote(column));
      return digest(`SELECT ${columns.join(",")} FROM public.${quote(table.name)}${condition}`, condition ? [roleIds] : []);
    }
    async function accessDigest(legacy) {
      // This mirrors the preceding release's explicit defaults and scope merge.
      return digest(`WITH grants AS (
        SELECT a."userId", g.privilege, g.scope::text AS scope
        FROM "UserAccessRole" a JOIN "RolePrivilege" g ON g."roleId"=a."roleId"
        JOIN "Privilege" p ON p.key=g.privilege JOIN "AccessRole" r ON r.id=a."roleId"
        WHERE NOT p."adminOnly" ${legacy ? "" : 'OR r."isAdministrator"'}
        ${legacy ? `UNION ALL
        SELECT u.id, p.key, CASE WHEN u."userRole"='admin' THEN 'all' ELSE 'assigned' END
        FROM "User" u CROSS JOIN "Privilege" p
        WHERE u."userRole"='admin' OR (u."userRole"='manager' AND p.key=ANY($1::text[]))
          OR (u."userRole"='employee' AND p.key=ANY($2::text[]))` : ""}
      ), merged AS (
        SELECT "userId", privilege, CASE WHEN bool_or(scope='all') THEN 'all' ELSE 'assigned' END AS scope
        FROM grants GROUP BY "userId", privilege
      ) SELECT u.id, ${legacy ? 'u."userRole"=\'admin\'' : 'EXISTS (SELECT 1 FROM "UserAccessRole" a JOIN "AccessRole" r ON r.id=a."roleId" WHERE a."userId"=u.id AND r."isAdministrator")'} AS administrator,
        coalesce((SELECT jsonb_agg(jsonb_build_object('privilege',privilege,'scope',scope) ORDER BY privilege)
          FROM merged m WHERE m."userId"=u.id),'[]'::jsonb) AS privileges
        FROM "User" u`, legacy ? [manager, employee] : []);
    }
    if (process.argv[2] === "snapshot") {
      const { rows: columns } = await client.query(`SELECT table_name AS name,
        array_agg(column_name::text ORDER BY ordinal_position) FILTER (
          WHERE NOT (table_name='User' AND column_name IN ('role','userRole'))) AS columns
        FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations'
        GROUP BY table_name ORDER BY table_name`);
      const roleIds = (await client.query('SELECT id FROM "AccessRole" ORDER BY id')).rows.map(({ id }) => id);
      const tables = [];
      for (const table of columns) tables.push({ ...table, ...await tableDigest(table, roleIds) });
      console.log(JSON.stringify({ version: 1, roleIds, tables, access: await accessDigest(true) }));
    } else if (process.argv[2] === "verify") {
      const baseline = JSON.parse(fs.readFileSync(0, "utf8"));
      assert.equal(baseline.version, 1);
      for (const table of baseline.tables) {
        assert.deepEqual(await tableDigest(table, baseline.roleIds), { count: table.count, digest: table.digest }, `Changed original data: ${table.name}`);
      }
      assert.deepEqual(await accessDigest(false), baseline.access, "Effective privileges or administrator membership changed");
      const { rows: [shape] } = await client.query(`SELECT
        (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name IN ('role','userRole')) AS legacy_columns,
        (SELECT count(*)::int FROM "AccessRole" WHERE id <> ALL($1::int[])) AS new_roles,
        (SELECT count(*)::int FROM "AccessRole" WHERE "isAdministrator") AS protected_roles,
        (SELECT count(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='UserRole') AS legacy_types`, [baseline.roleIds]);
      assert.deepEqual(shape, { legacy_columns: 0, new_roles: 3, protected_roles: 1, legacy_types: 0 });
      console.log(`Unified role cutover verified: original records in ${baseline.tables.length} tables and effective access for ${baseline.access.count} accounts preserved.`);
    } else throw new Error("Expected snapshot or verify");
    await client.query("COMMIT");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  // Assertion values and database error details may contain private data.
  console.error(error.code ? `Unified cutover verification failed (${error.code}).` : "Unified cutover verification failed; production must remain stopped.");
  process.exitCode = 1;
});
