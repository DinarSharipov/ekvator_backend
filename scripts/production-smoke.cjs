// Read-only authenticated HTTP checks. Tokens and user identities never leave this process.
const { Pool } = require("pg");
const { JwtService } = require("@nestjs/jwt");
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const { rows: [admin] } = await pool.query(`SELECT u.id, u.login FROM "User" u
      JOIN "UserAccessRole" a ON a."userId" = u.id JOIN "AccessRole" r ON r.id = a."roleId"
      WHERE r."isAdministrator" ORDER BY u.id LIMIT 1`);
    if (!admin) throw new Error("No administrator available");
    const jwt = new JwtService({ secret: process.env.JWT });
    const bearer = await jwt.signAsync({ sub: admin.id, login: admin.login }, { expiresIn: "1m" });
    const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
    for (const [path, authenticated, expected] of [["/api-json", false, 200], ["/services", false, 200], ["/admin/roles", false, 401], ["/admin/privileges", true, 200], ["/auth/me", true, 200]]) {
      const response = await fetch(base + path, { headers: authenticated ? { Authorization: `Bearer ${bearer}` } : {}, signal: AbortSignal.timeout(10000) });
      if (response.status !== expected) throw new Error(`Smoke check failed: ${path} (${response.status})`);
      const body = await response.json();
      if (path === "/admin/privileges" && body.length !== 28) throw new Error("Privilege catalogue mismatch");
      if (path === "/auth/me" && (!Array.isArray(body.privileges) || body.privileges.length !== 28 || !body.accessRoles?.some(({ role }) => role.isAdministrator) || "password" in body || "userRole" in body || "role" in body)) throw new Error("Profile privilege mismatch");
      console.log(`HTTP ${response.status}: ${path}`);
    }
  } finally { await pool.end(); }
}
main().catch((error) => { console.error(error.code ? `Smoke check failed (${error.code}).` : error.message); process.exitCode = 1; });
