const assert = require("node:assert/strict");
const { test } = require("node:test");
const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Set TEST_DATABASE_URL to a migrated local database whose name ends with _test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT = "companies-e2e-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";
require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const prefix = `companies-e2e-${Date.now()}`;

test("company deposits, permissions, QR charging and ledger HTTP workflow", async () => {
  const prisma = new PrismaService();
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const createdUserIds = [];
  let companyId;
  let phoneSuffix = 0;
  async function register(name) {
    phoneSuffix += 1;
    const phone = `+79${String(Date.now()).slice(-8)}${phoneSuffix}`;
    const response = await http.post("/auth/register").send({ login: `${prefix}-${name}`, phone, password: "safe-test-password", name }).expect(201);
    createdUserIds.push(response.body.user.id);
    return { ...response.body.user, token: response.body.access_token };
  }
  try {
    await http.get("/companies/me").expect(401);
    const owner = await register("owner");
    await http.post("/companies").auth(owner.token, { type: "bearer" }).send({ name: "" }).expect(400);
    const admin = await prisma.user.create({ data: { login: `${prefix}-admin`, password: "legacy-admin-password", name: "Admin", role: "admin", userRole: "admin" } });
    createdUserIds.push(admin.id);
    const adminLogin = await http.post("/auth/login").send({ login: admin.login, password: "legacy-admin-password" }).expect(200);
    const company = await http.post("/companies").auth(owner.token, { type: "bearer" }).send({ name: "ООО Тестовый перевозчик", inn: "1234567890" }).expect(201);
    companyId = company.body.id;
    assert.equal(company.body.balanceMinor, 0);
    assert.equal(company.body.members.length, 1);
    assert.equal(company.body.members[0].role, "owner");
    const outsider = await register("outsider");
    await http.get(`/companies/${companyId}`).auth(outsider.token, { type: "bearer" }).expect(403);
    await http.get("/companies/me").auth(outsider.token, { type: "bearer" }).expect(200).expect([]);
    const employee = await http.post(`/companies/${companyId}/employees`).auth(owner.token, { type: "bearer" }).send({ login: `${prefix}-driver`, password: "safe-test-password", name: "Driver" }).expect(201);
    createdUserIds.push(employee.body.user.id);
    const memberId = employee.body.id;
    await http.post(`/companies/${companyId}/employees`).auth(owner.token, { type: "bearer" }).send({ userId: employee.body.user.id }).expect(409);
    await http.post(`/companies/${companyId}/employees`).auth(owner.token, { type: "bearer" }).send({ userId: 2_000_000_000 }).expect(404);
    const topUp = await http.post(`/companies/${companyId}/top-ups`).auth(owner.token, { type: "bearer" }).send({ amountMinor: 1000000 }).expect(201);
    await http.post(`/companies/${companyId}/top-ups`).auth(owner.token, { type: "bearer" }).send({ amountMinor: 2_147_483_648 }).expect(400);
    await http.post(`/companies/${companyId}/employees/${memberId}/allocations`).auth(owner.token, { type: "bearer" }).send({ amountMinor: 1 }).expect(409);
    await http.post(`/admin/company-top-ups/${topUp.body.id}/confirm`).auth(owner.token, { type: "bearer" }).expect(403);
    await http.post(`/admin/company-top-ups/${topUp.body.id}/confirm`).auth(adminLogin.body.access_token, { type: "bearer" }).expect(200);
    await http.post(`/admin/company-top-ups/${topUp.body.id}/confirm`).auth(adminLogin.body.access_token, { type: "bearer" }).expect(409);
    const allocation = await http.post(`/companies/${companyId}/employees/${memberId}/allocations`).auth(owner.token, { type: "bearer" }).send({ amountMinor: 50000 }).expect(201);
    assert.equal(allocation.body.memberBalanceMinor, 50000);
    const driverLogin = await http.post("/auth/login").send({ login: `${prefix}-driver`, password: "safe-test-password" }).expect(200);
    const qr = await http.get(`/companies/${companyId}/employees/${memberId}/qr`).auth(driverLogin.body.access_token, { type: "bearer" }).expect(200);
    const employeeCompanies = await http.get("/companies/me").auth(driverLogin.body.access_token, { type: "bearer" }).expect(200);
    assert.equal(employeeCompanies.body.length, 1);
    await http.get(`/companies/${companyId}`).auth(driverLogin.body.access_token, { type: "bearer" }).expect(200);
    await http.get(`/companies/${companyId}/top-ups`).auth(driverLogin.body.access_token, { type: "bearer" }).expect(200);
    await http.post(`/companies/${companyId}/employees`).auth(driverLogin.body.access_token, { type: "bearer" }).send({ userId: outsider.id }).expect(403);
    await http.post(`/companies/${companyId}/top-ups`).auth(driverLogin.body.access_token, { type: "bearer" }).send({ amountMinor: 1 }).expect(403);
    await http.post(`/companies/${companyId}/employees/${memberId}/allocations`).auth(driverLogin.body.access_token, { type: "bearer" }).send({ amountMinor: 1 }).expect(403);
    await http.get(`/companies/${companyId}/ledger`).auth(driverLogin.body.access_token, { type: "bearer" }).expect(403);
    await http.get(`/companies/${companyId}/employees/${memberId}/qr`).auth(outsider.token, { type: "bearer" }).expect(403);
    const service = await prisma.serviceType.create({ data: { name: `${prefix}-service` } });
    const item = await prisma.serviceElement.create({ data: { name: `${prefix}-item`, price: 123.45, type: service.id } });
    const manager = await prisma.user.create({ data: { login: `${prefix}-manager`, password: "legacy-manager-password", name: "Manager", role: "manager", userRole: "manager", serviceAssignments: { create: { serviceTypeId: service.id } } } });
    createdUserIds.push(manager.id);
    const managerLogin = await http.post("/auth/login").send({ login: manager.login, password: "legacy-manager-password" }).expect(200);
    const charge = await http.post("/admin/company-qr/charges").auth(managerLogin.body.access_token, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id, quantity: 2 }).expect(201);
    assert.equal(charge.body.amountMinor, 24690);
    assert.equal(charge.body.memberBalanceMinor, 25310);
    await http.post("/admin/company-qr/charges").auth(driverLogin.body.access_token, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id }).expect(403);
    await http.post("/admin/company-qr/charges").auth(managerLogin.body.access_token, { type: "bearer" }).send({ qrToken: "unknown", serviceElementId: item.id }).expect(404);
    await http.post("/admin/company-qr/charges").auth(managerLogin.body.access_token, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id, quantity: 2_147_483_648 }).expect(400);
    await http.post("/admin/company-qr/charges").auth(managerLogin.body.access_token, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id, quantity: 3 }).expect(409);
    await prisma.serviceElement.update({ where: { id: item.id }, data: { isArchive: true } });
    await http.post("/admin/company-qr/charges").auth(managerLogin.body.access_token, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id }).expect(404);
    await prisma.serviceElement.update({ where: { id: item.id }, data: { isArchive: false } });
    const unassignedManager = await prisma.user.create({ data: { login: `${prefix}-unassigned-manager`, password: "manager-password", name: "Unassigned manager", role: "manager", userRole: "manager" } });
    createdUserIds.push(unassignedManager.id);
    const unassignedManagerToken = (await http.post("/auth/login").send({ login: unassignedManager.login, password: "manager-password" }).expect(200)).body.access_token;
    await http.post("/admin/company-qr/charges").auth(unassignedManagerToken, { type: "bearer" }).send({ qrToken: qr.body.qrToken, serviceElementId: item.id }).expect(403);
    const concurrentTopUp = await http.post(`/companies/${companyId}/top-ups`).auth(owner.token, { type: "bearer" }).send({ amountMinor: 500 }).expect(201);
    const confirmations = await Promise.all([
      http.post(`/admin/company-top-ups/${concurrentTopUp.body.id}/confirm`).auth(adminLogin.body.access_token, { type: "bearer" }),
      http.post(`/admin/company-top-ups/${concurrentTopUp.body.id}/confirm`).auth(adminLogin.body.access_token, { type: "bearer" }),
    ]);
    assert.deepEqual(confirmations.map((response) => response.status).sort(), [200, 409]);
    const adminCompanies = await http.get("/companies/me").auth(adminLogin.body.access_token, { type: "bearer" }).expect(200);
    assert.equal(adminCompanies.body.some((entry) => entry.id === companyId), true);
    const ledger = await http.get(`/companies/${companyId}/ledger`).auth(owner.token, { type: "bearer" }).expect(200);
    assert.deepEqual(ledger.body.map((entry) => entry.amountMinor).sort((a, b) => a - b), [-50000, -24690, 500, 50000, 1000000]);
  } finally {
    if (companyId) {
      await prisma.companyLedgerEntry.deleteMany({ where: { companyId } });
      await prisma.companyTopUp.deleteMany({ where: { companyId } });
      await prisma.companyMember.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    await prisma.serviceElement.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.userServiceAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.serviceType.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
    await prisma.$disconnect();
  }
});
