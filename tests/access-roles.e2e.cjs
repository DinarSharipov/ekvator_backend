const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");
const path = require("node:path");

const base = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(base.hostname) || !base.pathname.endsWith("_test")) {
  throw new Error("Disposable local TEST_DATABASE_URL ending in _test required");
}

test("custom privileges and last-administrator integrity", async (t) => {
  // A dedicated database is necessary: other suites retain their own admins.
  const database = `ekvator_access_${Date.now()}_test`;
  const control = new Client({ connectionString: base.toString() });
  await control.connect();
  let prisma;
  let app;
  try {
    await control.query(`CREATE DATABASE "${database}"`);
    const isolated = new URL(base);
    isolated.pathname = `/${database}`;
    process.env.DATABASE_URL = isolated.toString();
    process.env.JWT = "access-roles-isolated-test-secret";
    process.env.SMS_VERIFICATION_ENABLED = "false";
    execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      env: process.env, stdio: "pipe",
    });
    require("reflect-metadata");
    const { Test } = require("@nestjs/testing");
    const request = require("supertest");
    const { AppModule } = require("../dist/app.module");
    const { PrismaService } = require("../dist/prisma/prisma.service");
    const { AuthTokensService } = require("../dist/auth/auth-tokens.service");
    prisma = new PrismaService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    app = module.createNestApplication();
    await app.init();
    const http = request(app.getHttpServer());
    const tokens = module.get(AuthTokensService);
    const account = (login, userRole = "user") => prisma.user.create({ data: { login, name: login, password: "test-password", userRole } });
    const token = (user) => tokens.sign({ sub: user.id, login: user.login, userRole: user.userRole });
    const admin = await account("administrator", "admin");
    const ordinary = await account("operator");
    const adminToken = await token(admin);
    const ordinaryToken = await token(ordinary);
    const auth = (method, url, bearer = adminToken) => http[method](url).auth(bearer, { type: "bearer" });
    const grant = (privilege, scope = "assigned") => ({ privilege, scope });
    const save = async (name, grants) => (await auth("post", "/admin/roles").send({ name, grants }).expect(201)).body;
    const assign = (roleIds, userId = ordinary.id) => auth("put", `/admin/users/${userId}/roles`).send({ roleIds }).expect(204);
    const services = await Promise.all(["Workshop", "Hotel"].map((name) => prisma.serviceType.create({ data: { name } })));
    await prisma.userServiceAssignment.create({ data: { userId: ordinary.id, serviceTypeId: services[0].id } });

    await t.test("catalogue and role management are reserved for administrators", async () => {
      const catalogue = (await auth("get", "/admin/privileges").expect(200)).body;
      assert.equal(catalogue.length, 28);
      for (const key of ["services.update", "items.create", "orders.status", "roles.create", "roles.update"]) {
        assert.ok(catalogue.some((entry) => entry.key === key));
      }
      await http.get("/admin/roles").expect(401);
      await auth("get", "/admin/roles", ordinaryToken).expect(403);
      await auth("post", "/admin/roles", ordinaryToken).send({ name: "Forbidden", grants: [] }).expect(403);
      for (const grants of [[null], [grant("unknown")], [grant("roles.create", "all")], [grant("analytics.read")], [grant("items.create"), grant("items.create")]]) {
        await auth("post", "/admin/roles").send({ name: "Invalid", grants }).expect(400);
      }
      await auth("post", "/admin/roles").send({ name: "  ", grants: [] }).expect(400);
      await auth("post", "/admin/roles").send({ name: "Invalid", grants: [], userRole: "admin" }).expect(400);
      const empty = await save("Empty", []);
      await auth("post", "/admin/roles").send({ name: "empty", grants: [] }).expect(409);
      await auth("delete", `/admin/roles/${empty.id}`).expect(204);
      await auth("get", `/admin/roles/${empty.id}`).expect(404);
    });

    let scoped;
    let reader;
    await t.test("multiple roles combine grants independently for each operation", async () => {
      scoped = await save("Workshop editor", [grant("services.update"), grant("items.create")]);
      reader = await save("Global reader", [grant("users.read", "all")]);
      await assign([scoped.id, reader.id]);
      await auth("get", "/users", ordinaryToken).expect(200);
      await auth("put", `/services/${services[0].id}`, ordinaryToken).field("name", "Edited workshop").expect(204);
      await auth("put", `/services/${services[1].id}`, ordinaryToken).field("name", "Forbidden").expect(403);
      await auth("delete", `/services/${services[0].id}`, ordinaryToken).expect(403);
      await auth("get", "/admin/roles", ordinaryToken).expect(403);
      await auth("put", `/admin/roles/${scoped.id}`, ordinaryToken).send({ name: "Escalation", grants: [] }).expect(403);
      await auth("put", `/admin/users/${ordinary.id}/roles`, ordinaryToken).send({ roleIds: [] }).expect(403);
      await auth("delete", `/admin/roles/${scoped.id}`).expect(409);
      await auth("put", `/admin/users/${ordinary.id}/roles`).send({ roleIds: [scoped.id, scoped.id] }).expect(400);
      await auth("put", `/admin/users/${ordinary.id}/roles`).send({ roleIds: [999999] }).expect(404);
    });

    await t.test("editing grants and removing assignments revoke access with the same JWT", async () => {
      await auth("put", `/admin/roles/${scoped.id}`).send({ name: scoped.name, grants: [] }).expect(200);
      await auth("put", `/services/${services[0].id}`, ordinaryToken).field("name", "Revoked").expect(403);
      await auth("get", "/users", ordinaryToken).expect(200);
      await assign([]);
      await auth("get", "/users", ordinaryToken).expect(403);
      await auth("delete", `/admin/roles/${scoped.id}`).expect(204);
    });

    await t.test("delegated user management cannot elevate privileges or edit protected accounts", async () => {
      const manager = await save("Account operator", [grant("users.create", "all"), grant("users.update", "all"), grant("users.delete", "all")]);
      await assign([manager.id]);
      await auth("put", `/users/${ordinary.id}`, ordinaryToken).send({ userRole: "admin" }).expect(403);
      await auth("put", `/users/${admin.id}`, ordinaryToken).send({ name: "Hijacked" }).expect(403);
      await auth("delete", `/users/${admin.id}`, ordinaryToken).expect(403);
      const customer = await account("customer");
      await auth("put", `/users/${customer.id}`, ordinaryToken).send({ name: "Updated customer" }).expect(201);
      await auth("put", `/users/${customer.id}`, ordinaryToken).send({ userRole: "manager", serviceTypeIds: [services[0].id] }).expect(403);
      await auth("delete", `/users/${customer.id}`, ordinaryToken).expect(204);
      await auth("put", `/users/${ordinary.id}`, ordinaryToken).send({ roleIds: [] }).expect(400);
      await assign([]);
    });

    await t.test("global order reading does not expand scoped writes or calendar access", async () => {
      const role = await save("Order operator", [grant("orders.read", "all"), grant("orders.status"), grant("items.create")]);
      await assign([role.id]);
      const orders = [];
      for (const service of services) {
        const item = await prisma.serviceElement.create({ data: { name: service.name, type: service.id, price: 100 } });
        orders.push(await prisma.preorder.create({ data: {
          userId: ordinary.id,
          desiredStartAt: new Date(Date.now() + 86400000),
          scheduledStartAt: new Date(Date.now() + 86400000),
          completionDueAt: new Date(Date.now() + 90000000),
          items: { create: { serviceElementId: item.id, serviceTypeId: service.id, name: item.name, price: 100, quantity: 1 } },
        } }));
      }
      const list = (await auth("get", "/admin/orders", ordinaryToken).expect(200)).body;
      assert.equal(list.length, 2);
      await auth("patch", `/admin/orders/${orders[1].id}/status`, ordinaryToken).send({ status: "cancelled" }).expect(403);
      await auth("patch", `/admin/orders/${orders[0].id}/status`, ordinaryToken).send({ status: "cancelled" }).expect(200);
      await auth("patch", `/admin/orders/${orders[0].id}/archive`, ordinaryToken).send({ isArchived: true }).expect(403);
      await auth("get", "/admin/calendar/filter-options", ordinaryToken).expect(403);
      await auth("post", "/service-elements", ordinaryToken).field("name", "Scoped item").field("type", String(services[0].id)).field("price", "12").expect(201);
      await auth("post", "/service-elements", ordinaryToken).field("name", "Forbidden item").field("type", String(services[1].id)).field("price", "12").expect(403);
      const profile = (await auth("get", "/auth/me", ordinaryToken).expect(200)).body;
      assert.ok(profile.privileges.some((entry) => entry.privilege === "orders.read" && entry.scope === "all"));
      assert.ok(profile.privileges.some((entry) => entry.privilege === "orders.status" && entry.scope === "assigned"));
      await prisma.userServiceAssignment.deleteMany({ where: { userId: ordinary.id } });
      await auth("post", "/service-elements", ordinaryToken).field("name", "Revoked item").field("type", String(services[0].id)).field("price", "12").expect(403);
      await assign([]);
    });

    await t.test("last administrator cannot be deleted or demoted through HTTP or direct SQL", async () => {
      await auth("delete", `/users/${admin.id}`).expect(409);
      await auth("put", `/users/${admin.id}`).send({ userRole: "user" }).expect(409);
      await assert.rejects(prisma.user.delete({ where: { id: admin.id } }));
      await assert.rejects(prisma.user.update({ where: { id: admin.id }, data: { userRole: "user" } }));
      await assert.rejects(prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE'));
      assert.equal(await prisma.user.count({ where: { userRole: "admin" } }), 1);
    });

    await t.test("concurrent HTTP demotions retain exactly one administrator", async () => {
      const second = await account("second-admin", "admin");
      const secondToken = await token(second);
      const results = await Promise.all([
        auth("put", `/users/${admin.id}`).send({ userRole: "user" }),
        auth("put", `/users/${second.id}`, secondToken).send({ userRole: "user" }),
      ]);
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
      assert.equal(await prisma.user.count({ where: { userRole: "admin" } }), 1);
    });

    await t.test("database counter serializes concurrent direct demotions and rolls back bulk deletion", async () => {
      await account("third-admin", "admin");
      const admins = await prisma.user.findMany({ where: { userRole: "admin" } });
      const results = await Promise.allSettled(admins.map((user) => prisma.user.update({ where: { id: user.id }, data: { userRole: "user" } })));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      await assert.rejects(prisma.user.deleteMany({ where: { userRole: "admin" } }));
      assert.equal(await prisma.user.count({ where: { userRole: "admin" } }), 1);
      assert.equal((await prisma.administratorState.findUnique({ where: { id: 1 } })).count, 1);
      const last = await prisma.user.findFirst({ where: { userRole: "admin" } });
      const replacement = await account("replacement-admin", "admin");
      await prisma.user.delete({ where: { id: last.id } });
      assert.equal((await prisma.user.findUnique({ where: { id: replacement.id } })).userRole, "admin");
    });
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [database]);
    await control.query(`DROP DATABASE IF EXISTS "${database}"`);
    await control.end();
  }
});
