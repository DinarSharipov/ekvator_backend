const { roleId, roleData } = require("./support/role-fixtures.cjs");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { Client } = require("pg");
const path = require("node:path");

const base = new URL(
  process.env.TEST_DATABASE_URL || "postgresql://localhost/missing",
);
if (
  !process.env.TEST_DATABASE_URL ||
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  !base.pathname.endsWith("_test")
) {
  throw new Error(
    "Disposable local TEST_DATABASE_URL ending in _test required",
  );
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
    execFileSync(
      process.execPath,
      [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
      {
        env: process.env,
        stdio: "pipe",
      },
    );
    require("reflect-metadata");
    const { Test } = require("@nestjs/testing");
    const request = require("supertest");
    const { AppModule } = require("../dist/app.module");
    const { PrismaService } = require("../dist/prisma/prisma.service");
    const { AuthTokensService } = require("../dist/auth/auth-tokens.service");
    prisma = new PrismaService();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication();
    await app.init();
    const http = request(app.getHttpServer());
    const tokens = module.get(AuthTokensService);
    const account = async (login, kind = "user") =>
      prisma.user.create({
        data: {
          login,
          name: login,
          password: "test-password",
          ...(await roleData(prisma, kind)),
        },
      });
    const token = (user) => tokens.sign({ sub: user.id, login: user.login });
    const admin = await account("administrator", "admin");
    const ordinary = await account("operator");
    const adminToken = await token(admin);
    const ordinaryToken = await token(ordinary);
    const auth = (method, url, bearer = adminToken) =>
      http[method](url).auth(bearer, { type: "bearer" });
    const grant = (privilege, scope = "assigned") => ({ privilege, scope });
    const save = async (name, grants) =>
      (await auth("post", "/admin/roles").send({ name, grants }).expect(201))
        .body;
    const assign = (roleIds, userId = ordinary.id) =>
      auth("put", `/admin/users/${userId}/roles`).send({ roleIds }).expect(204);
    const services = await Promise.all(
      ["Workshop", "Hotel"].map((name) =>
        prisma.serviceType.create({ data: { name } }),
      ),
    );
    await prisma.userServiceAssignment.create({
      data: { userId: ordinary.id, serviceTypeId: services[0].id },
    });

    await t.test(
      "administrator is a protected role in the same catalogue",
      async () => {
        const id = await roleId(prisma, "admin");
        const role = (await auth("get", `/admin/roles/${id}`).expect(200)).body;
        assert.equal(role.isAdministrator, true);
        assert.equal(role.grants.length, 28);
        await auth("put", `/admin/roles/${id}`)
          .send({ name: "Changed", grants: [] })
          .expect(409);
        await auth("delete", `/admin/roles/${id}`).expect(409);
        await auth("put", `/admin/users/${admin.id}/roles`)
          .send({ roleIds: [id] })
          .expect(204);
        await auth("put", `/users/${admin.id}`)
          .send({ roleIds: [id], name: "Administrator" })
          .expect(201);
        await assert.rejects(
          prisma.accessRole.update({
            where: { id },
            data: { isAdministrator: false },
          }),
        );
        await assert.rejects(prisma.accessRole.delete({ where: { id } }));
        await assert.rejects(
          prisma.rolePrivilege.deleteMany({ where: { roleId: id } }),
        );
        await assert.rejects(
          prisma.rolePrivilege.updateMany({
            where: { roleId: id },
            data: { scope: "assigned" },
          }),
        );
        for (const table of ["AccessRole", "UserAccessRole", "RolePrivilege"]) {
          await assert.rejects(
            prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`),
          );
        }
      },
    );

    await t.test(
      "role names carry no permissions; migrated staff roles are editable and removable",
      async () => {
        for (const kind of ["employee", "manager"]) {
          const employee = await account(`renamable-${kind}`, kind);
          const employeeToken = await token(employee);
          const id = await roleId(prisma, kind);
          await auth("get", "/admin/orders", employeeToken).expect(200);
          await auth("put", `/admin/roles/${id}`)
            .send({ name: "Changed label", grants: [] })
            .expect(200);
          await auth("get", "/admin/orders", employeeToken).expect(403);
          await auth("put", `/admin/users/${employee.id}/roles`)
            .send({ roleIds: [] })
            .expect(204);
          await auth("delete", `/admin/roles/${id}`).expect(204);
          const fake = await save("admin", []);
          await auth("put", `/admin/users/${employee.id}/roles`)
            .send({ roleIds: [fake.id] })
            .expect(204);
          await auth("get", "/admin/roles", employeeToken).expect(403);
          await auth("get", "/admin/orders", employeeToken).expect(403);
          await prisma.user.delete({ where: { id: employee.id } });
          await auth("delete", `/admin/roles/${fake.id}`).expect(204);
        }
      },
    );

    await t.test(
      "registration and user writes reject obsolete roles and malformed assignments",
      async () => {
        for (const body of [
          { userRole: "admin" },
          { role: "admin" },
          { isAdministrator: true },
          { roleIds: null },
          { serviceTypeIds: null },
        ]) {
          await auth("put", `/users/${ordinary.id}`).send(body).expect(400);
        }
        const profile = (await auth("get", "/auth/me").expect(200)).body;
        assert.equal("userRole" in profile, false);
        assert.equal("role" in profile, false);
        const { JwtService } = require("@nestjs/jwt");
        const forged = module
          .get(JwtService)
          .sign({ sub: ordinary.id, login: ordinary.login, userRole: "admin" });
        await auth("get", "/admin/roles", forged).expect(403);
        const decoded = module.get(JwtService).decode(await token(admin));
        assert.equal("userRole" in decoded, false);
        assert.equal("roleIds" in decoded, false);
      },
    );

    await t.test(
      "catalogue and role management are reserved for administrators",
      async () => {
        const catalogue = (await auth("get", "/admin/privileges").expect(200))
          .body;
        assert.equal(catalogue.length, 28);
        for (const key of [
          "services.update",
          "items.create",
          "orders.status",
          "roles.create",
          "roles.update",
        ]) {
          assert.ok(catalogue.some((entry) => entry.key === key));
        }
        await http.get("/admin/roles").expect(401);
        await auth("get", "/admin/roles", ordinaryToken).expect(403);
        await auth("post", "/admin/roles", ordinaryToken)
          .send({ name: "Forbidden", grants: [] })
          .expect(403);
        for (const grants of [
          [null],
          [grant("unknown")],
          [grant("roles.create", "all")],
          [grant("analytics.read")],
          [grant("items.create"), grant("items.create")],
        ]) {
          await auth("post", "/admin/roles")
            .send({ name: "Invalid", grants })
            .expect(400);
        }
        await auth("post", "/admin/roles")
          .send({ name: "  ", grants: [] })
          .expect(400);
        await auth("post", "/admin/roles")
          .send({ name: "Invalid", grants: [], userRole: "admin" })
          .expect(400);
        const empty = await save("Empty", []);
        await auth("post", "/admin/roles")
          .send({ name: "empty", grants: [] })
          .expect(409);
        await auth("delete", `/admin/roles/${empty.id}`).expect(204);
        await auth("get", `/admin/roles/${empty.id}`).expect(404);
      },
    );

    let scoped;
    let reader;
    await t.test(
      "multiple roles combine grants independently for each operation",
      async () => {
        scoped = await save("Workshop editor", [
          grant("services.update"),
          grant("items.create"),
        ]);
        reader = await save("Global reader", [grant("users.read", "all")]);
        await assign([scoped.id, reader.id]);
        await auth("get", "/users", ordinaryToken).expect(200);
        await auth("put", `/services/${services[0].id}`, ordinaryToken)
          .field("name", "Edited workshop")
          .expect(204);
        await auth("put", `/services/${services[1].id}`, ordinaryToken)
          .field("name", "Forbidden")
          .expect(403);
        await auth(
          "delete",
          `/services/${services[0].id}`,
          ordinaryToken,
        ).expect(403);
        await auth("get", "/admin/roles", ordinaryToken).expect(403);
        await auth("put", `/admin/roles/${scoped.id}`, ordinaryToken)
          .send({ name: "Escalation", grants: [] })
          .expect(403);
        await auth("put", `/admin/users/${ordinary.id}/roles`, ordinaryToken)
          .send({ roleIds: [] })
          .expect(403);
        await auth("delete", `/admin/roles/${scoped.id}`).expect(409);
        await auth("put", `/admin/users/${ordinary.id}/roles`)
          .send({ roleIds: [scoped.id, scoped.id] })
          .expect(400);
        await auth("put", `/admin/users/${ordinary.id}/roles`)
          .send({ roleIds: [999999] })
          .expect(404);
      },
    );

    await t.test(
      "editing grants and removing assignments revoke access with the same JWT",
      async () => {
        await auth("put", `/admin/roles/${scoped.id}`)
          .send({ name: scoped.name, grants: [] })
          .expect(200);
        await auth("put", `/services/${services[0].id}`, ordinaryToken)
          .field("name", "Revoked")
          .expect(403);
        await auth("get", "/users", ordinaryToken).expect(200);
        await assign([]);
        await auth("get", "/users", ordinaryToken).expect(403);
        await auth("delete", `/admin/roles/${scoped.id}`).expect(204);
      },
    );

    await t.test(
      "delegated user management cannot elevate privileges or edit protected accounts",
      async () => {
        const manager = await save("Account operator", [
          grant("users.create", "all"),
          grant("users.update", "all"),
          grant("users.delete", "all"),
        ]);
        await assign([manager.id]);
        await auth("put", `/users/${ordinary.id}`, ordinaryToken)
          .send({ roleIds: [await roleId(prisma, "admin")] })
          .expect(403);
        await auth("put", `/users/${admin.id}`, ordinaryToken)
          .send({ name: "Hijacked" })
          .expect(403);
        await auth("delete", `/users/${admin.id}`, ordinaryToken).expect(403);
        const customer = await account("customer");
        await auth("put", `/users/${customer.id}`, ordinaryToken)
          .send({ name: "Updated customer" })
          .expect(201);
        await auth("put", `/users/${customer.id}`, ordinaryToken)
          .send({ roleIds: [reader.id], serviceTypeIds: [services[0].id] })
          .expect(403);
        await auth("delete", `/users/${customer.id}`, ordinaryToken).expect(
          204,
        );
        await auth("put", `/users/${ordinary.id}`, ordinaryToken)
          .send({ roleIds: [] })
          .expect(403);
        await assign([]);
      },
    );

    await t.test(
      "delegated account editing cannot acquire wider service access through a password change",
      async () => {
        const operatorRole = await save("Scoped account editor", [
          grant("users.update", "all"),
          grant("orders.read"),
          grant("orders.status"),
          grant("calendar.read"),
        ]);
        const workerRole = await save("Worker outside operator services", [
          grant("orders.read"),
        ]);
        await assign([operatorRole.id]);
        const worker = await account("outside-worker");
        await prisma.userServiceAssignment.create({
          data: { userId: worker.id, serviceTypeId: services[1].id },
        });
        await auth("put", `/admin/users/${worker.id}/roles`)
          .send({ roleIds: [workerRole.id] })
          .expect(204);
        await auth("put", `/users/${worker.id}`, ordinaryToken)
          .send({ password: "takeover" })
          .expect(403);
        await prisma.userServiceAssignment.updateMany({
          where: { userId: worker.id },
          data: { serviceTypeId: services[0].id },
        });
        await auth("put", `/users/${worker.id}`, ordinaryToken)
          .send({ name: "Managed worker" })
          .expect(201);
        await auth("put", `/users/${worker.id}`, ordinaryToken)
          .send({ serviceTypeIds: [services[1].id] })
          .expect(403);
        await assign([]);
      },
    );

    await t.test(
      "global order reading does not expand scoped writes or calendar access",
      async () => {
        const role = await save("Order operator", [
          grant("orders.read", "all"),
          grant("orders.status"),
          grant("items.create"),
        ]);
        await assign([role.id]);
        const orders = [];
        for (const service of services) {
          const item = await prisma.serviceElement.create({
            data: { name: service.name, type: service.id, price: 100 },
          });
          orders.push(
            await prisma.preorder.create({
              data: {
                userId: ordinary.id,
                desiredStartAt: new Date(Date.now() + 86400000),
                scheduledStartAt: new Date(Date.now() + 86400000),
                completionDueAt: new Date(Date.now() + 90000000),
                items: {
                  create: {
                    serviceElementId: item.id,
                    serviceTypeId: service.id,
                    name: item.name,
                    price: 100,
                    quantity: 1,
                  },
                },
              },
            }),
          );
        }
        const list = (
          await auth("get", "/admin/orders", ordinaryToken).expect(200)
        ).body;
        assert.equal(list.length, 2);
        await auth(
          "patch",
          `/admin/orders/${orders[1].id}/status`,
          ordinaryToken,
        )
          .send({ status: "cancelled" })
          .expect(403);
        await auth(
          "patch",
          `/admin/orders/${orders[0].id}/status`,
          ordinaryToken,
        )
          .send({ status: "cancelled" })
          .expect(200);
        await auth(
          "patch",
          `/admin/orders/${orders[0].id}/archive`,
          ordinaryToken,
        )
          .send({ isArchived: true })
          .expect(403);
        await auth(
          "get",
          "/admin/calendar/filter-options",
          ordinaryToken,
        ).expect(403);
        await auth("post", "/service-elements", ordinaryToken)
          .field("name", "Scoped item")
          .field("type", String(services[0].id))
          .field("price", "12")
          .expect(201);
        await auth("post", "/service-elements", ordinaryToken)
          .field("name", "Forbidden item")
          .field("type", String(services[1].id))
          .field("price", "12")
          .expect(403);
        const profile = (
          await auth("get", "/auth/me", ordinaryToken).expect(200)
        ).body;
        assert.ok(
          profile.privileges.some(
            (entry) =>
              entry.privilege === "orders.read" && entry.scope === "all",
          ),
        );
        assert.ok(
          profile.privileges.some(
            (entry) =>
              entry.privilege === "orders.status" && entry.scope === "assigned",
          ),
        );
        await prisma.userServiceAssignment.deleteMany({
          where: { userId: ordinary.id },
        });
        await auth("post", "/service-elements", ordinaryToken)
          .field("name", "Revoked item")
          .field("type", String(services[0].id))
          .field("price", "12")
          .expect(403);
        await assign([]);
      },
    );

    await t.test(
      "last administrator cannot be deleted or demoted through HTTP or direct SQL",
      async () => {
        await auth("delete", `/users/${admin.id}`).expect(409);
        await auth("put", `/admin/users/${admin.id}/roles`)
          .send({ roleIds: [] })
          .expect(409);
        await auth("put", `/users/${admin.id}`)
          .send({ roleIds: [] })
          .expect(409);
        await assert.rejects(prisma.user.delete({ where: { id: admin.id } }));
        await assert.rejects(
          prisma.userAccessRole.deleteMany({ where: { userId: admin.id } }),
        );
        const administratorId = await roleId(prisma, "admin");
        await assert.rejects(
          prisma.userAccessRole.update({
            where: {
              userId_roleId: { userId: admin.id, roleId: administratorId },
            },
            data: { roleId: reader.id },
          }),
        );
        await assert.rejects(
          prisma.$executeRawUnsafe('TRUNCATE TABLE "User" CASCADE'),
        );
        assert.equal(
          await prisma.userAccessRole.count({
            where: { role: { isAdministrator: true } },
          }),
          1,
        );
      },
    );

    await t.test(
      "concurrent HTTP demotions retain exactly one administrator",
      async () => {
        const second = await account("second-admin", "admin");
        const secondToken = await token(second);
        const results = await Promise.all([
          auth("put", `/admin/users/${admin.id}/roles`).send({ roleIds: [] }),
          auth("put", `/admin/users/${second.id}/roles`, secondToken).send({
            roleIds: [],
          }),
        ]);
        assert.deepEqual(
          results.map((result) => result.status).sort(),
          [204, 409],
        );
        assert.equal(
          await prisma.userAccessRole.count({
            where: { role: { isAdministrator: true } },
          }),
          1,
        );
      },
    );

    await t.test(
      "database counter serializes concurrent direct demotions and rolls back bulk deletion",
      async () => {
        await account("third-admin", "admin");
        await assert.rejects(
          prisma.userAccessRole.deleteMany({
            where: { role: { isAdministrator: true } },
          }),
        );
        assert.equal(
          await prisma.userAccessRole.count({
            where: { role: { isAdministrator: true } },
          }),
          2,
        );
        await assert.rejects(
          prisma.user.deleteMany({
            where: {
              accessRoles: { some: { role: { isAdministrator: true } } },
            },
          }),
        );
        assert.equal(
          await prisma.userAccessRole.count({
            where: { role: { isAdministrator: true } },
          }),
          2,
        );
        const admins = await prisma.user.findMany({
          where: { accessRoles: { some: { role: { isAdministrator: true } } } },
        });
        const results = await Promise.allSettled(
          admins.map((user) =>
            prisma.userAccessRole.deleteMany({
              where: { userId: user.id, role: { isAdministrator: true } },
            }),
          ),
        );
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        await assert.rejects(
          prisma.user.deleteMany({
            where: {
              accessRoles: { some: { role: { isAdministrator: true } } },
            },
          }),
        );
        assert.equal(
          await prisma.userAccessRole.count({
            where: { role: { isAdministrator: true } },
          }),
          1,
        );
        assert.equal(
          (await prisma.administratorState.findUnique({ where: { id: 1 } }))
            .count,
          1,
        );
        const last = await prisma.user.findFirst({
          where: { accessRoles: { some: { role: { isAdministrator: true } } } },
        });
        const replacement = await account("replacement-admin", "admin");
        await prisma.user.delete({ where: { id: last.id } });
        assert.equal(
          await prisma.userAccessRole.count({
            where: { userId: replacement.id, role: { isAdministrator: true } },
          }),
          1,
        );
      },
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    await control.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [database],
    );
    await control.query(`DROP DATABASE IF EXISTS "${database}"`);
    await control.end();
  }
});
