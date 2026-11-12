const assert = require("node:assert/strict");
const { test } = require("node:test");

// Refuse to run against application or remote databases.
const url = new URL(
  process.env.TEST_DATABASE_URL || "postgresql://localhost/missing",
);
if (
  !process.env.TEST_DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
) {
  throw new Error(
    "Set TEST_DATABASE_URL to a migrated local database whose name ends with _test",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT = "cart-integration-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";

require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const { PasswordService } = require("../dist/auth/password.service");

const prefix = `auth-test-${Date.now()}`;
const phone = `+7${String(Date.now()).slice(-10)}`;

test("registration, authentication and administrative access over HTTP with PostgreSQL", async (t) => {
  const prisma = new PrismaService();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const body = { login: `${prefix}-user`, phone, password: "a-test-password" };
  const admin = await prisma.user.create({
    data: {
      login: `${prefix}-admin`,
      name: "Existing administrator",
      password: "legacy-password",
      role: "manager",
      userRole: "admin",
    },
  });
  let token;
  let adminToken;
  let userId;
  try {
    await t.test(
      "register returns a user token and safe profile; password is hashed",
      async () => {
        const result = await http.post("/auth/register").send(body).expect(201);
        token = result.body.access_token;
        userId = result.body.user.id;
        assert.equal(result.body.user.userRole, "user");
        assert.equal(result.body.user.phoneVerifiedAt, null);
        assert.equal(result.body.user.name, body.login);
        assert.equal("password" in result.body.user, false);
        assert.ok(token);
        const stored = await prisma.user.findUnique({ where: { id: userId } });
        assert.match(stored.password, /^scrypt\$/);
        assert.notEqual(stored.password, body.password);
      },
    );
    await t.test(
      "public registration cannot set roles or verification state",
      async () => {
        for (const extra of [
          { userRole: "admin" },
          { role: "admin" },
          { phoneVerifiedAt: new Date().toISOString() },
        ]) {
          await http
            .post("/auth/register")
            .send({ ...body, ...extra })
            .expect(400);
        }
      },
    );
    await t.test("malformed or missing credentials are rejected", async () => {
      for (const patch of [
        { phone: "bad" },
        { login: "x" },
        { password: "short" },
        { password: null },
      ]) {
        await http
          .post("/auth/register")
          .send({ ...body, ...patch })
          .expect(400);
      }
      for (const payload of [
        {},
        { login: body.login },
        { password: body.password },
        { login: body.login, phone, password: body.password },
        { login: [], password: body.password },
      ]) {
        await http.post("/auth/login").send(payload).expect(400);
      }
    });
    await t.test(
      "duplicate logins and normalized phones return 409",
      async () => {
        await http.post("/auth/register").send(body).expect(409);
        await http
          .post("/auth/register")
          .send({
            ...body,
            login: `${prefix}-duplicate`,
            phone: `8${phone.slice(2)}`,
          })
          .expect(409);
      },
    );
    await t.test(
      "concurrent duplicate registrations create only one account",
      async () => {
        const payload = {
          ...body,
          login: `${prefix}-race`,
          phone: `+44${phone.slice(2)}`,
        };
        const results = await Promise.all([
          http.post("/auth/register").send(payload),
          http.post("/auth/register").send(payload),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      },
    );
    await t.test("login accepts login or phone and password", async () => {
      for (const identifier of [
        { login: body.login },
        { phone },
        { login: phone },
        { phone: `8 (${phone.slice(2, 5)}) ${phone.slice(5)}` },
      ]) {
        const result = await http
          .post("/auth/login")
          .send({ ...identifier, password: body.password })
          .expect(200);
        assert.equal(result.body.user.id, userId);
        assert.equal("password" in result.body.user, false);
      }
      await http
        .post("/auth/login")
        .send({ login: body.login, password: "wrong-password" })
        .expect(401);
      await http
        .post("/auth/login")
        .send({ login: `${prefix}-missing`, password: body.password })
        .expect(401);
    });
    await t.test(
      "ordinary-user tokens are rejected by the legacy JWT verifier",
      async () => {
        const { JwtService } = require("@nestjs/jwt");
        await assert.rejects(() => module.get(JwtService).verifyAsync(token));
      },
    );
    await t.test(
      "authenticated user can read their own safe profile",
      async () => {
        const result = await http
          .get("/auth/me")
          .auth(token, { type: "bearer" })
          .expect(200);
        assert.equal(result.body.id, userId);
        assert.equal(result.body.userRole, "user");
        assert.equal("password" in result.body, false);
        await http.get("/auth/me").expect(401);
        await http
          .get("/auth/me")
          .auth("invalid", { type: "bearer" })
          .expect(401);
      },
    );
    await t.test(
      "all administrative operations reject ordinary users",
      async () => {
        for (const [method, path] of [
          ["get", "/users"],
          ["get", `/users/${admin.id}`],
          ["post", "/users"],
          ["put", `/users/${admin.id}`],
          ["delete", `/users/${admin.id}`],
          ["post", "/services"],
          ["put", "/services/1"],
          ["delete", "/services/1"],
          ["put", "/services/order"],
          ["get", "/services/order-permission"],
          ["post", "/service-elements"],
          ["put", "/service-elements/1"],
          ["delete", "/service-elements/1"],
        ])
          await http[method](path)
            .auth(token, { type: "bearer" })
            .send({})
            .expect(403);
        await http.get("/users").expect(401);
        await http.get("/services").expect(200);
        await http.get("/service-elements").expect(200);
      },
    );
    await t.test(
      "existing administrator logs in without changing their stored password",
      async () => {
        const result = await http
          .post("/auth/login")
          .send({ login: admin.login, password: "legacy-password" })
          .expect(200);
        adminToken = result.body.access_token;
        const stored = await prisma.user.findUnique({
          where: { id: admin.id },
        });
        assert.equal(stored.password, "legacy-password");
        await http
          .get("/services/order-permission")
          .auth(adminToken, { type: "bearer" })
          .expect(200, { canReorder: true });
        const users = await http
          .get("/users")
          .auth(adminToken, { type: "bearer" })
          .expect(200);
        assert.ok(users.body.every((u) => !("password" in u)));
      },
    );
    await t.test(
      "administrator can create another administrator and update without a password",
      async () => {
        const result = await http
          .post("/users")
          .auth(adminToken, { type: "bearer" })
          .send({
            login: `${prefix}-created`,
            password: "created-password",
            name: "New admin",
            surname: "Test",
            phone: `+9${phone.slice(2)}`,
            role: "staff",
          })
          .expect(201);
        assert.equal(result.body.userRole, "admin");
        assert.equal("password" in result.body, false);
        await http
          .put(`/users/${result.body.id}`)
          .auth(adminToken, { type: "bearer" })
          .send({ name: "Updated" })
          .expect(201);
        await http
          .post("/auth/login")
          .send({ login: `${prefix}-created`, password: "created-password" })
          .expect(200);
      },
    );
    await t.test(
      "role changes take effect immediately for existing tokens",
      async () => {
        await prisma.user.update({
          where: { id: admin.id },
          data: { userRole: "user" },
        });
        await http
          .get("/users")
          .auth(adminToken, { type: "bearer" })
          .expect(403);
        await prisma.user.update({
          where: { id: admin.id },
          data: { userRole: "admin" },
        });
      },
    );
    await t.test(
      "old JWTs without a role still work for migrated administrators",
      async () => {
        const { JwtService } = require("@nestjs/jwt");
        const oldToken = module
          .get(JwtService)
          .sign({ sub: admin.id, login: admin.login });
        await http.get("/users").auth(oldToken, { type: "bearer" }).expect(200);
      },
    );
    await t.test(
      "SMS is disabled by default and fails closed when enabled",
      async () => {
        await http
          .get("/auth/features")
          .expect(200, { smsVerificationEnabled: false });
        process.env.SMS_VERIFICATION_ENABLED = "true";
        try {
          await http
            .get("/auth/features")
            .expect(200, { smsVerificationEnabled: true });
          await http.post("/auth/register").send(body).expect(503);
          await http
            .post("/auth/login")
            .send({ login: body.login, password: body.password })
            .expect(403);
          await http
            .get("/auth/me")
            .auth(token, { type: "bearer" })
            .expect(403);
          await http
            .get("/users")
            .auth(adminToken, { type: "bearer" })
            .expect(200);
          await prisma.user.update({
            where: { id: userId },
            data: { phoneVerifiedAt: new Date() },
          });
          await http
            .get("/auth/me")
            .auth(token, { type: "bearer" })
            .expect(200);
          await http
            .put(`/users/${userId}`)
            .auth(adminToken, { type: "bearer" })
            .send({ phone: `+33${phone.slice(2)}` })
            .expect(201);
          await http
            .get("/auth/me")
            .auth(token, { type: "bearer" })
            .expect(403);
        } finally {
          process.env.SMS_VERIFICATION_ENABLED = "false";
        }
      },
    );
    await t.test(
      "customer checkout, schedule confirmation, postponement and archiving work over HTTP",
      async () => {
        const service = await prisma.serviceType.create({
          data: {
            name: `${prefix} preorder service`,
            acceptsPreorders: true,
            allowMixedCart: true,
            bookingMode: "appointment",
          },
        });
        const element = await prisma.serviceElement.create({
          data: {
            name: `${prefix} preorder item`,
            price: 250,
            type: service.id,
            preorderAvailable: true,
          },
        });
        const desired = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await http
          .post("/cart/items")
          .auth(token, { type: "bearer" })
          .send({ serviceElementId: element.id, quantity: 2 })
          .expect(201);
        const created = await http
          .post("/orders")
          .auth(token, { type: "bearer" })
          .send({ desiredStartAt: desired.toISOString() })
          .expect(201);
        assert.equal(created.body.status, "pending");
        assert.equal(created.body.total, 500);
        const orderId = created.body.id;
        const proposed = new Date(Date.now() + 3 * 60 * 60 * 1000);
        await http
          .post(`/admin/orders/${orderId}/propose-schedule`)
          .auth(adminToken, { type: "bearer" })
          .send({ scheduledStartAt: proposed.toISOString(), note: "Please confirm" })
          .expect(201);
        await http
          .post(`/orders/${orderId}/accept-proposal`)
          .auth(token, { type: "bearer" })
          .expect(201);
        await http
          .patch(`/admin/orders/${orderId}/status`)
          .auth(adminToken, { type: "bearer" })
          .send({ status: "ready" })
          .expect(200);
        const postponed = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await http
          .post(`/orders/${orderId}/postpone`)
          .auth(token, { type: "bearer" })
          .send({ until: postponed.toISOString() })
          .expect(201);
        await http
          .post(`/orders/${orderId}/confirm-completion`)
          .auth(token, { type: "bearer" })
          .expect(201);
        await http
          .patch(`/admin/orders/${orderId}/archive`)
          .auth(adminToken, { type: "bearer" })
          .send({ isArchived: true })
          .expect(200);

        const durationService = await prisma.serviceType.create({
          data: { name: `${prefix} duration service`, acceptsPreorders: true, allowMixedCart: false, bookingMode: "duration" },
        });
        const durationItem = await prisma.serviceElement.create({
          data: { name: `${prefix} duration item`, price: 100, type: durationService.id, preorderAvailable: true },
        });
        await http.post("/cart/items").auth(token, { type: "bearer" }).send({ serviceElementId: durationItem.id, quantity: 1 }).expect(201);
        await http.post("/orders").auth(token, { type: "bearer" }).send({ desiredStartAt: desired.toISOString() }).expect(400);
        await http.post("/orders").auth(token, { type: "bearer" }).send({ desiredStartAt: desired.toISOString(), desiredEndAt: new Date(desired.getTime() + 2 * 60 * 60 * 1000).toISOString() }).expect(201);
      },
    );
    await t.test(
      "deleted accounts lose access even with an unexpired JWT",
      async () => {
        await prisma.user.delete({ where: { id: userId } });
        await http.get("/auth/me").auth(token, { type: "bearer" }).expect(401);
      },
    );
    await t.test("password helper rejects corrupt hashes", async () => {
      assert.equal(
        await module.get(PasswordService).verify("password", "scrypt$bad$bad"),
        false,
      );
    });
  } finally {
    await prisma.preorder.deleteMany({
      where: { items: { some: { name: { startsWith: prefix } } } },
    });
    await prisma.serviceElement.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.serviceType.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { login: { startsWith: prefix } } });
    await app.close();
    await prisma.$disconnect();
  }
});

// Replay the committed history in isolated schemas to check upgrades of existing data.
test("migration preserves populated legacy tables and fails atomically", async (t) => {
  const { Pool } = require("pg");
  const { readFileSync, readdirSync } = require("node:fs");
  const { join } = require("node:path");
  const migrationName = "20261112010000_user_registration";
  const migrationRoot = join(__dirname, "../prisma/migrations");
  const upgrade = readFileSync(
    join(migrationRoot, migrationName, "migration.sql"),
    "utf8",
  );
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  const schemas = [];
  async function legacySchema(suffix) {
    const schema = `auth_upgrade_${Date.now()}_${suffix}`;
    schemas.push(schema);
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of readdirSync(migrationRoot).sort()) {
      if (name === "migration_lock.toml" || name >= migrationName) continue;
      await client.query(
        readFileSync(join(migrationRoot, name, "migration.sql"), "utf8"),
      );
    }
    return schema;
  }
  async function fingerprint(table, columns = "*") {
    const {
      rows: [row],
    } = await client.query(`
      SELECT count(*) AS count, md5(string_agg(md5(row_to_json(t)::text), '' ORDER BY id)) AS fingerprint
      FROM (SELECT ${columns} FROM "${table}") t
    `);
    return row;
  }
  const originalUserColumns =
    "id,name,surname,phone,email,telegram,role,login,password";
  try {
    await t.test(
      "old user fields and 10000 catalogue rows survive unchanged",
      async () => {
        await legacySchema("populated");
        await client.query(`
        INSERT INTO "User" (name,login,password,phone,role)
        SELECT 'Legacy ' || g, 'legacy-' || g, 'original-password-' || g,
          CASE WHEN g = 1 THEN '8 (999) 123-45-67' ELSE '' END,
          'original-role-' || g FROM generate_series(1,5000) g;
        INSERT INTO "ServiceType" (name,description,photo,gallery)
        SELECT 'Service ' || g, 'Description ' || g, repeat(md5(g::text),64), ARRAY[repeat(md5(g::text),64)]
          FROM generate_series(1,6) g;
        INSERT INTO "ServiceElement" (name,description,price,photos,type)
        SELECT 'Item ' || g, 'Description ' || g, 123.45,
          ARRAY[repeat(md5(g::text),64)], (g % 6) + 1 FROM generate_series(1,10000) g;
      `);
        const before = {
          users: await fingerprint("User", originalUserColumns),
          services: await fingerprint("ServiceType"),
          elements: await fingerprint("ServiceElement"),
        };
        await client.query(upgrade);
        assert.deepEqual(
          await fingerprint("User", originalUserColumns),
          before.users,
        );
        assert.deepEqual(await fingerprint("ServiceType"), before.services);
        assert.deepEqual(await fingerprint("ServiceElement"), before.elements);
        const {
          rows: [roles],
        } = await client.query(
          `SELECT count(*)::int AS admins FROM "User" WHERE "userRole"='admin'`,
        );
        assert.equal(roles.admins, 5000);
        const {
          rows: [phoneRow],
        } = await client.query(
          `SELECT phone, "phoneNormalized" FROM "User" WHERE login='legacy-1'`,
        );
        assert.equal(phoneRow.phone, "8 (999) 123-45-67");
        assert.equal(phoneRow.phoneNormalized, "+79991234567");
        const {
          rows: [created],
        } = await client.query(
          `INSERT INTO "User" (name,login,password) VALUES ('New','new-account','hash-placeholder') RETURNING "userRole"`,
        );
        assert.equal(created.userRole, "user");
      },
    );
    await t.test(
      "duplicate identities abort without changing old records or schema",
      async () => {
        await legacySchema("duplicates");
        await client.query(`INSERT INTO "User" (name,login,password,phone,role) VALUES
        ('A','first','password-a','89991234567','staff'),
        ('B','second','password-b','+7 (999) 123-45-67','staff')`);
        const before = await fingerprint("User", originalUserColumns);
        await client.query(
          `CREATE TABLE "_prisma_migrations" (finished_at timestamp, rolled_back_at timestamp)`,
        );
        const testUrl = new URL(process.env.TEST_DATABASE_URL);
        testUrl.searchParams.set("options", `-c search_path=${schemas.at(-1)}`);
        const { spawnSync } = require("node:child_process");
        const preflight = spawnSync(
          process.execPath,
          [join(__dirname, "../scripts/auth-preflight.cjs")],
          {
            env: { ...process.env, DATABASE_URL: testUrl.toString() },
            encoding: "utf8",
          },
        );
        assert.equal(preflight.status, 1);
        assert.match(preflight.stdout, /"duplicate_phones":1/);
        assert.deepEqual(
          await fingerprint("User", originalUserColumns),
          before,
        );
        await assert.rejects(
          () => client.query(upgrade),
          /Duplicate logins or normalized phones exist/,
        );
        await client.query("ROLLBACK");
        assert.deepEqual(
          await fingerprint("User", originalUserColumns),
          before,
        );
        const {
          rows: [state],
        } = await client.query(
          `SELECT count(*)::int AS added_columns FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='User' AND column_name IN ('userRole','phoneNormalized','phoneVerifiedAt')`,
        );
        assert.equal(state.added_columns, 0);
      },
    );
    await t.test(
      "an active reader causes a bounded lock timeout and clean rollback",
      async () => {
        const schema = await legacySchema("locked");
        const reader = await pool.connect();
        try {
          await reader.query("BEGIN");
          await reader.query(`SELECT id FROM "${schema}"."User" LIMIT 1`);
          const start = Date.now();
          await assert.rejects(
            () => client.query(upgrade),
            (error) => error.code === "55P03",
          );
          assert.ok(Date.now() - start < 15000, "Lock wait must be bounded");
          await client.query("ROLLBACK");
          const {
            rows: [state],
          } = await client.query(
            `SELECT count(*)::int AS added_columns FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='User' AND column_name='userRole'`,
          );
          assert.equal(state.added_columns, 0);
        } finally {
          await reader.query("ROLLBACK");
          reader.release();
        }
      },
    );
  } finally {
    await client.query("ROLLBACK");
    for (const schema of schemas)
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
