const assert = require("node:assert/strict");
const { test } = require("node:test");

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
process.env.JWT = "preorders-e2e-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";

require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");

const prefix = `preorders-e2e-${Date.now()}`;
const future = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

test("cart and preorder HTTP workflows with PostgreSQL", async (t) => {
  const prisma = new PrismaService();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const users = {};
  const catalogue = {};

  async function register(name) {
    const result = await http
      .post("/auth/register")
      .send({
        login: `${prefix}-${name}`,
        phone: `+7999${String(Date.now()).slice(-7)}${name.length}`,
        password: "a-test-password",
        name,
      })
      .expect(201);
    return { id: result.body.user.id, token: result.body.access_token };
  }

  async function createService(name, options = {}) {
    const service = await prisma.serviceType.create({
      data: {
        name: `${prefix}-${name}`,
        acceptsPreorders: true,
        allowMixedCart: true,
        bookingMode: "appointment",
        bookingCapacity: 1,
        ...options,
      },
    });
    const item = await prisma.serviceElement.create({
      data: {
        name: `${prefix}-${name}-item`,
        price: 100,
        type: service.id,
        preorderAvailable: true,
      },
    });
    return { service, item };
  }

  function as(user) {
    return { type: "bearer", token: user.token };
  }

  try {
    users.customer = await register("customer");
    users.otherCustomer = await register("other-customer");
    const admin = await prisma.user.create({
      data: {
        login: `${prefix}-admin`,
        name: "Administrator",
        password: "legacy-admin-password",
        role: "admin",
        userRole: "admin",
      },
    });
    const adminLogin = await http
      .post("/auth/login")
      .send({ login: admin.login, password: "legacy-admin-password" })
      .expect(200);
    users.admin = { id: admin.id, token: adminLogin.body.access_token };

    catalogue.appointment = await createService("appointment");
    catalogue.secondAppointment = await createService("second-appointment");
    catalogue.duration = await createService("duration", {
      bookingMode: "duration",
      allowMixedCart: false,
      bookingCapacity: 1,
    });
    catalogue.exclusive = await createService("exclusive", {
      allowMixedCart: false,
    });
    catalogue.disabledService = await createService("disabled-service", {
      acceptsPreorders: false,
    });
    catalogue.disabledItem = await createService("disabled-item");
    await prisma.serviceElement.update({
      where: { id: catalogue.disabledItem.item.id },
      data: { preorderAvailable: false },
    });

    await t.test("requires an authenticated account and validates cart input", async () => {
      await http.get("/cart").expect(401);
      await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.appointment.item.id, quantity: 0 })
        .expect(400);
      await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.appointment.item.id, quantity: 1, extra: true })
        .expect(400);
      await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: 999999999, quantity: 1 })
        .expect(404);
    });

    await t.test("keeps carts isolated and supports add, replace quantity, remove and empty state", async () => {
      const initial = await http
        .get("/cart")
        .auth(users.customer.token, { type: "bearer" })
        .expect(200);
      assert.deepEqual(initial.body.items, []);

      const added = await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.appointment.item.id, quantity: 2 })
        .expect(201);
      const cartItemId = added.body.items[0].id;
      assert.equal(added.body.items[0].quantity, 2);

      const replaced = await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.appointment.item.id, quantity: 4 })
        .expect(201);
      assert.equal(replaced.body.items.length, 1);
      assert.equal(replaced.body.items[0].quantity, 4);

      await http
        .patch(`/cart/items/${cartItemId}`)
        .auth(users.otherCustomer.token, { type: "bearer" })
        .send({ quantity: 1 })
        .expect(404);
      await http
        .delete(`/cart/items/${cartItemId}`)
        .auth(users.otherCustomer.token, { type: "bearer" })
        .expect(404);
      await http
        .patch(`/cart/items/${cartItemId}`)
        .auth(users.customer.token, { type: "bearer" })
        .send({ quantity: 3 })
        .expect(200);
      await http
        .delete(`/cart/items/${cartItemId}`)
        .auth(users.customer.token, { type: "bearer" })
        .expect(204);
      const emptyCart = await http
        .get("/cart")
        .auth(users.customer.token, { type: "bearer" })
        .expect(200);
      assert.deepEqual(emptyCart.body.items, []);
      await http.post("/orders").auth(users.customer.token, { type: "bearer" }).send({ desiredStartAt: future(2).toISOString() }).expect(400);
    });

    await t.test("rejects unavailable services and incompatible carts without changing saved items", async () => {
      for (const item of [catalogue.disabledService.item, catalogue.disabledItem.item]) {
        await http
          .post("/cart/items")
          .auth(users.customer.token, { type: "bearer" })
          .send({ serviceElementId: item.id, quantity: 1 })
          .expect(409);
      }
      await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.exclusive.item.id, quantity: 1 })
        .expect(201);
      await http
        .post("/cart/items")
        .auth(users.customer.token, { type: "bearer" })
        .send({ serviceElementId: catalogue.appointment.item.id, quantity: 1 })
        .expect(409);
      const savedCart = await http
        .get("/cart")
        .auth(users.customer.token, { type: "bearer" })
        .expect(200);
      assert.equal(savedCart.body.items.length, 1);
      assert.equal(savedCart.body.items[0].serviceElementId, catalogue.exclusive.item.id);
      const exclusiveCart = await http.get("/cart").auth(users.customer.token, { type: "bearer" }).expect(200);
      await http.delete(`/cart/items/${exclusiveCart.body.items[0].id}`).auth(users.customer.token, { type: "bearer" }).expect(204);
    });

    await t.test("checks out appointment orders, snapshots price and clears the cart", async () => {
      await http.post("/cart/items").auth(users.customer.token, { type: "bearer" }).send({ serviceElementId: catalogue.appointment.item.id, quantity: 2 }).expect(201);
      const requestedStart = future(3);
      const created = await http
        .post("/orders")
        .auth(users.customer.token, { type: "bearer" })
        .send({ desiredStartAt: requestedStart.toISOString(), customerNote: "Please call first" })
        .expect(201);
      catalogue.appointmentOrderId = created.body.id;
      assert.equal(created.body.status, "pending");
      assert.equal(created.body.total, 200);
      assert.equal(created.body.items[0].name, catalogue.appointment.item.name);
      assert.equal(created.body.items[0].price, 100);
      const clearedCart = await http
        .get("/cart")
        .auth(users.customer.token, { type: "bearer" })
        .expect(200);
      assert.deepEqual(clearedCart.body.items, []);

      await prisma.serviceElement.update({ where: { id: catalogue.appointment.item.id }, data: { name: "Changed after checkout", price: 999 } });
      const mine = await http.get("/orders/me").auth(users.customer.token, { type: "bearer" }).expect(200);
      const persisted = mine.body.find((order) => order.id === created.body.id);
      assert.equal(persisted.items[0].name, catalogue.appointment.item.name);
      assert.equal(persisted.items[0].price, 100);
      assert.equal(persisted.total, 200);
      const otherOrders = await http
        .get("/orders/me")
        .auth(users.otherCustomer.token, { type: "bearer" })
        .expect(200);
      assert.equal(otherOrders.body.some((order) => order.id === created.body.id), false);
    });

    await t.test("enforces schedule ownership, role access and lifecycle transitions", async () => {
      const orderId = catalogue.appointmentOrderId;
      await http.get("/admin/orders").auth(users.customer.token, { type: "bearer" }).expect(403);
      await http.post(`/orders/${orderId}/accept-proposal`).auth(users.otherCustomer.token, { type: "bearer" }).expect(403);
      await http.patch(`/admin/orders/${orderId}/status`).auth(users.admin.token, { type: "bearer" }).send({ status: "ready" }).expect(409);

      const proposedStart = future(4);
      const proposal = await http
        .post(`/admin/orders/${orderId}/propose-schedule`)
        .auth(users.admin.token, { type: "bearer" })
        .send({ scheduledStartAt: proposedStart.toISOString(), note: "Available at this time" })
        .expect(201);
      assert.equal(proposal.body.status, "needs_confirmation");
      await http.post(`/orders/${orderId}/reject-proposal`).auth(users.otherCustomer.token, { type: "bearer" }).expect(403);
      const accepted = await http.post(`/orders/${orderId}/accept-proposal`).auth(users.customer.token, { type: "bearer" }).expect(201);
      assert.equal(accepted.body.status, "accepted");
      assert.equal(accepted.body.proposedStartAt, null);
      await http.patch(`/admin/orders/${orderId}/status`).auth(users.admin.token, { type: "bearer" }).send({ status: "in_progress" }).expect(200);
      await http.patch(`/admin/orders/${orderId}/status`).auth(users.admin.token, { type: "bearer" }).send({ status: "ready" }).expect(200);
      const postponed = await http.post(`/orders/${orderId}/postpone`).auth(users.customer.token, { type: "bearer" }).send({ until: future(6).toISOString() }).expect(201);
      assert.equal(postponed.body.postponementUsed, true);
      await http.post(`/orders/${orderId}/postpone`).auth(users.customer.token, { type: "bearer" }).send({ until: future(7).toISOString() }).expect(409);
      const completed = await http
        .post(`/orders/${orderId}/confirm-completion`)
        .auth(users.customer.token, { type: "bearer" })
        .expect(201);
      assert.equal(completed.body.status, "completed");
      await http.patch(`/admin/orders/${orderId}/archive`).auth(users.admin.token, { type: "bearer" }).send({ isArchived: true }).expect(200);
      const activeOrders = await http
        .get("/admin/orders")
        .auth(users.admin.token, { type: "bearer" })
        .expect(200);
      assert.equal(activeOrders.body.some((order) => order.id === orderId), false);
      const allOrders = await http
        .get("/admin/orders?includeArchived=true")
        .auth(users.admin.token, { type: "bearer" })
        .expect(200);
      assert.ok(allOrders.body.some((order) => order.id === orderId));
    });

    await t.test("validates duration bookings and prevents overlapping reservations at capacity", async () => {
      const start = future(10);
      const end = future(12);
      await http.post("/cart/items").auth(users.customer.token, { type: "bearer" }).send({ serviceElementId: catalogue.duration.item.id, quantity: 1 }).expect(201);
      await http.post("/orders").auth(users.customer.token, { type: "bearer" }).send({ desiredStartAt: start.toISOString() }).expect(400);
      await http.post("/orders").auth(users.customer.token, { type: "bearer" }).send({ desiredStartAt: start.toISOString(), desiredEndAt: end.toISOString() }).expect(201);
      const cart = await http
        .get("/cart")
        .auth(users.otherCustomer.token, { type: "bearer" })
        .expect(200);
      assert.deepEqual(cart.body.items, []);
      await http.post("/cart/items").auth(users.otherCustomer.token, { type: "bearer" }).send({ serviceElementId: catalogue.duration.item.id, quantity: 1 }).expect(201);
      await http.post("/orders").auth(users.otherCustomer.token, { type: "bearer" }).send({ desiredStartAt: future(11).toISOString(), desiredEndAt: future(13).toISOString() }).expect(409);
      await http.post("/orders").auth(users.otherCustomer.token, { type: "bearer" }).send({ desiredStartAt: future(13).toISOString(), desiredEndAt: future(14).toISOString() }).expect(201);
    });

    await t.test("completes overdue accepted orders before returning them", async () => {
      const order = await prisma.preorder.create({
        data: {
          userId: users.customer.id,
          status: "accepted",
          desiredStartAt: future(1),
          scheduledStartAt: future(1),
          completionDueAt: new Date(Date.now() - 1000),
          items: { create: [{ serviceElementId: catalogue.secondAppointment.item.id, serviceTypeId: catalogue.secondAppointment.service.id, name: "Overdue item", price: 50, quantity: 1 }] },
        },
      });
      const orders = await http
        .get("/orders/me")
        .auth(users.customer.token, { type: "bearer" })
        .expect(200);
      assert.equal(orders.body.find((item) => item.id === order.id).status, "completed");
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
