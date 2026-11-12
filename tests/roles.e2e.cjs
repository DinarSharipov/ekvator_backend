const assert = require("node:assert/strict");
const { test } = require("node:test");

const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to a migrated local database whose name ends with _test");
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT = "roles-e2e-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";

require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");

const prefix = `roles-e2e-${Date.now()}`;
const future = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

test("role and service access boundaries work over HTTP", async (t) => {
  const prisma = new PrismaService();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const phone = (suffix) => `+79${String(Date.now()).slice(-8)}${suffix}`;
  let managerToken;
  let employeeToken;

  async function createOrder(userId, service, item) {
    const start = future(4);
    return prisma.preorder.create({
      data: {
        userId,
        desiredStartAt: start,
        scheduledStartAt: start,
        completionDueAt: future(5),
        items: {
          create: {
            serviceElementId: item.id,
            serviceTypeId: service.id,
            name: item.name,
            price: item.price,
            quantity: 1,
          },
        },
      },
    });
  }

  try {
    const admin = await prisma.user.create({
      data: { login: `${prefix}-admin`, name: "Admin", password: "admin-password", userRole: "admin" },
    });
    const services = await Promise.all(["workshop", "hotel", "cafe"].map((name) => prisma.serviceType.create({
      data: { name: `${prefix}-${name}`, acceptsPreorders: true },
    })));
    const [workshop, hotel, cafe] = services;
    const items = await Promise.all(services.map((service) => prisma.serviceElement.create({
      data: { name: `${service.name}-item`, price: 100, type: service.id, preorderAvailable: true },
    })));
    const [workshopItem, hotelItem, cafeItem] = items;
    const adminToken = (await http.post("/auth/login").send({ login: admin.login, password: "admin-password" }).expect(200)).body.access_token;

    await t.test("admin assigns multiple services when creating a manager", async () => {
      const response = await http.post("/users").auth(adminToken, { type: "bearer" }).send({
        login: `${prefix}-manager`, password: "manager-password", name: "Manager", surname: "Test", phone: phone("01"),
        userRole: "manager", serviceTypeIds: [workshop.id, hotel.id],
      }).expect(201);
      assert.equal(response.body.userRole, "manager");
      assert.deepEqual(response.body.serviceAssignments.map((item) => item.serviceTypeId).sort(), [workshop.id, hotel.id].sort());
      managerToken = (await http.post("/auth/login").send({ login: `${prefix}-manager`, password: "manager-password" }).expect(200)).body.access_token;

      await http.post("/users").auth(adminToken, { type: "bearer" }).send({
        login: `${prefix}-invalid-manager`, password: "password", name: "Invalid", surname: "Test", phone: phone("02"), userRole: "manager",
      }).expect(409);
    });

    let managedEmployee;
    await t.test("manager manages only employees whose full assignment is within their services", async () => {
      managedEmployee = (await http.post("/users").auth(managerToken, { type: "bearer" }).send({
        login: `${prefix}-employee`, password: "employee-password", name: "Employee", surname: "Test", phone: phone("03"),
        userRole: "employee", serviceTypeIds: [workshop.id, hotel.id],
      }).expect(201)).body;
      employeeToken = (await http.post("/auth/login").send({ login: `${prefix}-employee`, password: "employee-password" }).expect(200)).body.access_token;

      const outsideEmployee = (await http.post("/users").auth(adminToken, { type: "bearer" }).send({
        login: `${prefix}-outside-employee`, password: "employee-password", name: "Outside", surname: "Test", phone: phone("04"),
        userRole: "employee", serviceTypeIds: [workshop.id, cafe.id],
      }).expect(201)).body;
      const employees = await http.get("/users").auth(managerToken, { type: "bearer" }).expect(200);
      assert.equal(employees.body.some((user) => user.id === managedEmployee.id), true);
      assert.equal(employees.body.some((user) => user.id === outsideEmployee.id), false);
      await http.get(`/users/${managedEmployee.id}`).auth(managerToken, { type: "bearer" }).expect(200);
      await http.get(`/users/${outsideEmployee.id}`).auth(managerToken, { type: "bearer" }).expect(403);
      await http.put(`/users/${managedEmployee.id}`).auth(managerToken, { type: "bearer" }).send({ name: "Updated employee" }).expect(201);
      await http.put(`/users/${managedEmployee.id}`).auth(managerToken, { type: "bearer" }).send({ serviceTypeIds: [cafe.id] }).expect(403);
      await http.post("/users").auth(managerToken, { type: "bearer" }).send({
        login: `${prefix}-manager-escalation`, password: "password", name: "Escalation", surname: "Test", phone: phone("05"), userRole: "manager", serviceTypeIds: [workshop.id],
      }).expect(403);
    });

    await t.test("staff cannot escalate privileges or change the catalogue", async () => {
      const managedItem = await http.post("/service-elements").auth(managerToken, { type: "bearer" }).send({
        name: `${prefix}-manager-item`, price: "1", type: workshop.id, preorderAvailable: true,
      }).expect(201);
      await http.delete(`/service-elements/${managedItem.body.id}`).auth(managerToken, { type: "bearer" }).expect(204);
      await http.post("/users").auth(employeeToken, { type: "bearer" }).send({
        login: `${prefix}-employee-escalation`, password: "password", name: "Escalation", surname: "Test", phone: phone("06"), userRole: "employee", serviceTypeIds: [workshop.id],
      }).expect(403);
      await http.post("/service-elements").auth(employeeToken, { type: "bearer" }).send({ name: "Blocked", price: "1", type: workshop.id }).expect(403);
      await http.post("/services").auth(managerToken, { type: "bearer" }).send({ name: "Blocked" }).expect(403);
      await http.post("/service-elements").auth(managerToken, { type: "bearer" }).send({ name: "Outside", price: "1", type: cafe.id }).expect(403);
    });

    await t.test("manager and employee see and operate only orders for assigned services", async () => {
      const customerA = await prisma.user.create({ data: { login: `${prefix}-customer-a`, name: "Customer A", password: "x" } });
      const customerC = await prisma.user.create({ data: { login: `${prefix}-customer-c`, name: "Customer C", password: "x" } });
      const visibleOrder = await createOrder(customerA.id, workshop, workshopItem);
      const hiddenOrder = await createOrder(customerC.id, cafe, cafeItem);
      const mixedOrder = await prisma.preorder.create({
        data: {
          userId: customerA.id, desiredStartAt: future(6), scheduledStartAt: future(6), completionDueAt: future(7),
          items: { create: [
            { serviceElementId: workshopItem.id, serviceTypeId: workshop.id, name: workshopItem.name, price: workshopItem.price, quantity: 1 },
            { serviceElementId: cafeItem.id, serviceTypeId: cafe.id, name: cafeItem.name, price: cafeItem.price, quantity: 1 },
          ] },
        },
      });
      const orders = await http.get("/admin/orders").auth(managerToken, { type: "bearer" }).expect(200);
      assert.equal(orders.body.some((order) => order.id === visibleOrder.id), true);
      assert.equal(orders.body.some((order) => order.id === hiddenOrder.id || order.id === mixedOrder.id), false);
      await http.patch(`/admin/orders/${visibleOrder.id}/status`).auth(employeeToken, { type: "bearer" }).send({ status: "accepted" }).expect(200);
      await http.post(`/admin/orders/${hiddenOrder.id}/propose-schedule`).auth(managerToken, { type: "bearer" }).send({ scheduledStartAt: future(8).toISOString() }).expect(403);
      await http.patch(`/admin/orders/${hiddenOrder.id}/status`).auth(employeeToken, { type: "bearer" }).send({ status: "accepted" }).expect(403);

      const from = future(1).toISOString();
      const to = future(12).toISOString();
      const calendar = await http.get(`/admin/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).auth(managerToken, { type: "bearer" }).expect(200);
      assert.equal(calendar.body.some((event) => event.orderId === visibleOrder.id), true);
      assert.equal(calendar.body.some((event) => event.orderId === hiddenOrder.id || event.orderId === mixedOrder.id), false);
      const filters = await http.get("/admin/calendar/filter-options").auth(managerToken, { type: "bearer" }).expect(200);
      assert.equal(filters.body.services.some((service) => service.id === workshop.id), true);
      assert.equal(filters.body.services.some((service) => service.id === hotel.id), true);
      assert.equal(filters.body.services.some((service) => service.id === cafe.id), false);
      assert.equal(filters.body.serviceElements.some((item) => item.id === cafeItem.id), false);
      const users = await http.get("/admin/users/filter-options").auth(managerToken, { type: "bearer" }).expect(200);
      assert.equal(users.body.some((user) => user.id === customerA.id), true);
      assert.equal(users.body.some((user) => user.id === customerC.id), false);
    });
  } finally {
    await prisma.preorder.deleteMany({ where: { user: { login: { startsWith: prefix } } } });
    await prisma.cart.deleteMany({ where: { user: { login: { startsWith: prefix } } } });
    await prisma.serviceElement.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.serviceType.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { login: { startsWith: prefix } } });
    await app.close();
    await prisma.$disconnect();
  }
});
