// Compare private row digests without printing credentials or record values.
const { Pool } = require("pg");
const fs = require("node:fs");
const quote = (value) => `"${value.replaceAll('"', '""')}"`;

async function digest(client, table) {
  const columns = table.columns.map(quote).join(", ");
  const { rows: [result] } = await client.query(`
    SELECT count(*)::text AS count,
      md5(coalesce(string_agg(row_hash, '' ORDER BY row_hash), '')) AS digest
    FROM (SELECT md5(row_to_json(original)::text) AS row_hash
      FROM (SELECT ${columns} FROM public.${quote(table.name)}) original) hashed
  `);
  return result;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout = '120s'");
    if (process.argv[2] === "snapshot") {
      const { rows } = await client.query(`
        SELECT table_name AS name, array_agg(column_name::text ORDER BY ordinal_position) AS columns
        FROM information_schema.columns WHERE table_schema = 'public'
          AND table_name <> '_prisma_migrations'
        GROUP BY table_name ORDER BY table_name
      `);
      const tables = [];
      for (const table of rows) tables.push({ ...table, ...await digest(client, table) });
      console.log(JSON.stringify({ tables }));
    } else if (process.argv[2] === "verify") {
      const baseline = JSON.parse(fs.readFileSync(0, "utf8"));
      for (const table of baseline.tables) {
        const actual = await digest(client, table);
        if (actual.count !== table.count || actual.digest !== table.digest) throw new Error(`Data integrity mismatch: ${table.name}`);
      }
      console.log(`All original columns and rows preserved in ${baseline.tables.length} tables.`);
    } else if (process.argv[2] === "invariants") {
      const { rows: [state] } = await client.query(`SELECT
        (SELECT count(*)::int FROM "User" WHERE "userRole" = 'admin') AS admins,
        (SELECT "count" FROM "AdministratorState" WHERE id = 1) AS counter,
        (SELECT count(*)::int FROM "Privilege") AS privileges,
        (SELECT count(*)::int FROM pg_trigger WHERE tgname IN ('User_protect_last_administrator', 'User_protect_administrator_truncate', 'RolePrivilege_validate') AND tgenabled = 'O') AS triggers,
        (SELECT count(*)::int FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed
      `);
      if (!state.admins || state.admins !== state.counter || state.privileges !== 28 || state.triggers !== 3 || state.failed) throw new Error("Access or migration invariant failed");
      console.log(JSON.stringify(state));
    } else throw new Error("Expected snapshot, verify or invariants");
    await client.query("COMMIT");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.code ? `Integrity check failed (${error.code}).` : error.message);
  process.exitCode = 1;
});
