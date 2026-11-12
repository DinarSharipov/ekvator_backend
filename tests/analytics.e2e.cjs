const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");

const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to a migrated local database whose name ends with _test");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT = "analytics-e2e-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";

require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const { AuthTokensService } = require("../dist/auth/auth-tokens.service");

test("analytics records idempotent privacy-safe events and protects summaries", async (t) => {
  const prisma = new PrismaService();
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const suffix = Date.now();
  const service = await prisma.serviceType.create({ data: { name: `Analytics service ${suffix}` } });
  const admin = await prisma.user.create({ data: { login: `analytics-admin-${suffix}`, name: "Admin", password: "legacy", userRole: "admin" } });
  const ordinary = await prisma.user.create({ data: { login: `analytics-user-${suffix}`, name: "User", password: "legacy" } });
  const tokens = module.get(AuthTokensService);
  const adminToken = await tokens.sign({ sub: admin.id, login: admin.login, userRole: "admin" });
  const userToken = await tokens.sign({ sub: ordinary.id, login: ordinary.login, userRole: "user" });
  const visitorId = randomUUID();
  const now = new Date().toISOString();
  try {
    await t.test("validates an explicit, non-sensitive event contract", async () => {
      await http.post("/analytics/events").send({ visitorId, events: [{ eventId: randomUUID(), type: "page_view", path: "services" }] }).expect(400);
      await http.post("/analytics/events").send({ visitorId, events: [{ eventId: randomUUID(), type: "click", path: "/services?phone=secret", target: "Bad label", occurredAt: now }] }).expect(400);
      await http.post("/analytics/events").send({ visitorId, events: [{ eventId: randomUUID(), type: "click", path: "/", target: "cart.checkout", occurredAt: new Date(Date.now() - 8 * 86400000).toISOString() }] }).expect(400);
    });
    await t.test("accepts anonymous and authenticated batches only once", async () => {
      const duplicate = randomUUID();
      const anonymous = await http.post("/analytics/events").send({ visitorId, events: [
        { eventId: duplicate, type: "page_view", path: "/services", occurredAt: now },
        { eventId: randomUUID(), type: "click", path: "/services", target: "service.open", serviceTypeId: service.id, occurredAt: now },
      ] }).expect(202);
      assert.equal(anonymous.body.accepted, 2);
      await http.post("/analytics/events").send({ visitorId, events: [{ eventId: duplicate, type: "page_view", path: "/services", occurredAt: now }] }).expect(202, { accepted: 0 });
      await http.post("/analytics/events").auth(userToken, { type: "bearer" }).send({ visitorId: randomUUID(), events: [{ eventId: randomUUID(), type: "click", path: "/cart", target: "cart.checkout", occurredAt: now }] }).expect(202, { accepted: 1 });
    });
    await t.test("only admins can inspect aggregate activity", async () => {
      await http.get("/admin/analytics/overview").expect(401);
      await http.get("/admin/analytics/overview").auth(userToken, { type: "bearer" }).expect(403);
      const overview = await http.get(`/admin/analytics/overview?from=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`).auth(adminToken, { type: "bearer" }).expect(200);
      assert.equal(overview.body.totals.pageViews, 1);
      assert.equal(overview.body.totals.clicks, 2);
      assert.equal(overview.body.totals.uniqueVisitors, 2);
      assert.equal(overview.body.totals.authenticatedUsers, 1);
      assert.deepEqual(overview.body.topServices, [{ serviceTypeId: service.id, name: service.name, clicks: 1 }]);
      assert.ok(overview.body.topTargets.some((item) => item.target === "cart.checkout" && item.clicks === 1));
    });
    await t.test("caps reporting periods", async () => {
      await http.get("/admin/analytics/overview?from=2026-01-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z").auth(adminToken, { type: "bearer" }).expect(400);
    });
  } finally {
    await prisma.analyticsEvent.deleteMany({ where: { visitorId } });
    await prisma.analyticsEvent.deleteMany({ where: { userId: ordinary.id } });
    await prisma.serviceType.delete({ where: { id: service.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, ordinary.id] } } });
    await app.close();
    await prisma.$disconnect();
  }
});
