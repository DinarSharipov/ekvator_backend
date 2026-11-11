// Read-only checks. Never print credentials, phone numbers, logins or password values.
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    const {
      rows: [duplicates],
    } = await client.query(`
      WITH normalized AS (
        SELECT login, CASE
          WHEN digits ~ '^8[0-9]{10}$' THEN '+7' || substring(digits FROM 2)
          WHEN digits ~ '^[0-9]{10}$' THEN '+7' || digits
          WHEN digits ~ '^[1-9][0-9]{10,14}$' THEN '+' || digits
          ELSE NULL END AS phone_key
        FROM (SELECT login, regexp_replace(phone, '[[:space:]()+-]', '', 'g') digits FROM "User") p
      )
      SELECT
        (SELECT count(*)::int FROM (SELECT login FROM normalized GROUP BY login HAVING count(*) > 1) d) AS duplicate_logins,
        (SELECT count(*)::int FROM (SELECT phone_key FROM normalized WHERE phone_key IS NOT NULL GROUP BY phone_key HAVING count(*) > 1) d) AS duplicate_phones
    `);
    const {
      rows: [history],
    } = await client.query(`
      SELECT count(*)::int AS failed_migrations FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `);
    await client.query("COMMIT");
    console.log(JSON.stringify({ ...duplicates, ...history }));
    if (
      duplicates.duplicate_logins ||
      duplicates.duplicate_phones ||
      history.failed_migrations
    ) {
      throw new Error(
        "Preflight failed. Resolve duplicate identities or failed migration history before deployment. No data was changed.",
      );
    }
    console.log("Authentication migration preflight passed (read-only).");
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  // Database error details can contain record values: only expose SQLSTATE and a generic message.
  console.error(
    error.code
      ? `Preflight database check failed (${error.code}).`
      : error.message,
  );
  process.exitCode = 1;
});
