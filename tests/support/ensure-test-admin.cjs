const { randomUUID } = require("node:crypto");

// Persistent only inside the disposable test DB, so suites may clean up their
// own administrators without violating the production last-admin invariant.
module.exports = async function ensureTestAdmin(prisma) {
  const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
  if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Disposable local test database required");
  await prisma.$executeRaw`INSERT INTO "User" ("login", "name", "password", "userRole")
    VALUES ('__test_administrator_sentinel__', 'Test administrator sentinel', ${randomUUID()}, 'admin')
    ON CONFLICT ("login") DO NOTHING`;
};
