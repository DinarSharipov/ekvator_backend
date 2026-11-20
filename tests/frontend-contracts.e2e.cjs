const assert = require("node:assert/strict");
const { test } = require("node:test");
const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to a migrated local database whose name ends with _test");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT = "frontend-contracts-test-secret";
process.env.SMS_VERIFICATION_ENABLED = "false";
require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const { DocumentBuilder, SwaggerModule } = require("@nestjs/swagger");
const request = require("supertest");
const sharp = require("sharp");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const prefix = `contracts-${Date.now()}`;

test("frontend contracts: multipart, service kinds, admin lists and contacts", async (t) => {
  const prisma = new PrismaService();
  await require("./support/ensure-test-admin.cjs")(prisma);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prisma).compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const users = [];
  const services = [];
  const companies = [];
  let topUpId;
  let goods, service;
  const previousContacts = await prisma.siteContacts.findUnique({ where: { id: 1 } });
  async function account(role) {
    const registered = await http.post("/auth/register").send({ login: `${prefix}-${role}`, phone: `+7999${String(Date.now()).slice(-6)}${users.length}`, password: "test-password-123" }).expect(201);
    const id = registered.body.user.id;
    users.push(id);
    await prisma.user.update({ where: { id }, data: { userRole: role } });
    const login = await http.post("/auth/login").send({ login: `${prefix}-${role}`, password: "test-password-123" }).expect(200);
    return { id, token: login.body.access_token };
  }
  const start = new Date(Date.now() + 86400000).toISOString();
  const end = new Date(Date.now() + 90000000).toISOString();
  try {
    const admin = await account("admin");
    const customer = await account("user");
    const manager = await account("manager");
    const employee = await account("employee");
    const auth = (operation, actor = admin) => operation.auth(actor.token, { type: "bearer" });
    await t.test("multipart create stores capacity, strict booleans, display mode and optional images in one request", async () => {
      const created = await auth(http.post("/services")).field("name", `${prefix}-goods`).field("kind", "goods")
        .field("bookingCapacity", "3").field("showType", "blocks").field("acceptsPreorders", "true")
        .field("allowMixedCart", "false").field("showInMain", "false").expect(201);
      goods = created.body;
      services.push(goods.id);
      assert.equal(goods.bookingCapacity, 3);
      assert.equal(goods.kind, "goods");
      assert.equal(goods.showType, "blocks");
      assert.equal(goods.acceptsPreorders, true);
      assert.equal(goods.allowMixedCart, false);
      assert.equal(goods.showInMain, false);
      assert.equal(goods.photo, null);
      const minimal = await auth(http.post("/services")).field("name", `${prefix}-minimal`).expect(201);
      services.push(minimal.body.id);
      assert.equal(minimal.body.bookingCapacity, 1);
      assert.equal(minimal.body.allowMixedCart, true);
      const createdService = await auth(http.post("/services")).field("name", `${prefix}-services`).field("kind", "services")
        .field("bookingMode", "duration").field("bookingCapacity", "1").field("acceptsPreorders", "true").expect(201);
      service = createdService.body;
      services.push(service.id);
      const legacy = await auth(http.post("/services")).field("name", `${prefix}-legacy-duration`).field("bookingMode", "duration").expect(201);
      services.push(legacy.body.id);
      assert.equal(legacy.body.kind, "services");
    });

    await t.test("invalid multipart values and images return 400 without creating records", async () => {
      const before = await prisma.serviceType.count({ where: { name: { startsWith: prefix } } });
      await auth(http.post("/services")).field("showInMain", "false").expect(400);
      await auth(http.post("/services")).field("name", "   ").expect(400);
      for (const capacity of ["", "abc", "0", "1.5", "-1", "2147483648"]) {
        await auth(http.post("/services")).field("name", prefix).field("bookingCapacity", capacity).expect(400);
      }
      for (const value of ["yes", "1", "TRUE", ""]) {
        await auth(http.post("/services")).field("name", prefix).field("acceptsPreorders", value).expect(400);
      }
      await auth(http.post("/services")).field("name", prefix).field("showType", "invalid").expect(400);
      await auth(http.post("/services")).field("name", prefix).field("unexpected", "true").expect(400);
      await auth(http.post("/services")).send({ name: prefix, bookingCapacity: null }).expect(400);
      await auth(http.post("/services")).field("name", prefix).field("kind", "goods").field("bookingMode", "duration").expect(400);
      await auth(http.post("/services")).field("name", prefix).attach("photo", Buffer.from("not an image"), "invalid.png").expect(400);
      assert.equal(await prisma.serviceType.count({ where: { name: { startsWith: prefix } } }), before);
    });

    await t.test("image round trip, gallery clearing and validated update preserve omitted flags", async () => {
      const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
      await auth(http.put(`/services/${goods.id}`)).field("name", `${prefix}-goods`).field("bookingCapacity", "4")
        .attach("photo", image, "cover.png").attach("gallery", image, "gallery.png").expect(204);
      const read = await http.get(`/services/${goods.id}`).expect(200);
      assert.equal(read.body.bookingCapacity, 4);
      assert.equal(read.body.acceptsPreorders, true);
      assert.equal(read.body.allowMixedCart, false);
      assert.equal(read.body.gallery.length, 1);
      assert.equal((await sharp(Buffer.from(read.body.photo, "base64")).metadata()).format, "webp");
      await auth(http.put(`/services/${goods.id}`)).field("name", `${prefix}-goods`).field("bookingCapacity", "bad").expect(400);
      await auth(http.put(`/services/${goods.id}`)).field("name", `${prefix}-goods`).attach("photo", image, "cover.png").expect(204);
      assert.deepEqual((await http.get(`/services/${goods.id}`).expect(200)).body.gallery, []);
      let oversizedGallery = auth(http.post("/services")).field("name", prefix);
      for (let i = 0; i < 11; i++) oversizedGallery = oversizedGallery.attach("gallery", image, `image-${i}.png`);
      await oversizedGallery.expect(400);
    });

    await t.test("goods support quantities, services support multiple distinct selections, and capacity remains protected", async () => {
      const items = await Promise.all([goods, service, service].map((type, i) => prisma.serviceElement.create({ data: { name: `${prefix}-item-${i}`, price: 100, type: type.id, preorderAvailable: true } })));
      await auth(http.post("/cart/items"), customer).send({ serviceElementId: items[0].id, quantity: 3 }).expect(201);
      await auth(http.post("/orders"), customer).send({ desiredStartAt: start, desiredEndAt: end }).expect(400);
      const placedGoods = await auth(http.post("/orders"), customer).send({ desiredStartAt: start }).expect(201);
      assert.equal(placedGoods.body.items[0].quantity, 3);
      assert.equal(placedGoods.body.items[0].serviceType.kind, "goods");
      await auth(http.post("/cart/items"), customer).send({ serviceElementId: items[1].id, quantity: 2 }).expect(400);
      const draft = await auth(http.post("/cart/items"), customer).send({ serviceElementId: items[1].id, quantity: 1 }).expect(201);
      await auth(http.patch(`/cart/items/${draft.body.items[0].id}`), customer).send({ quantity: 2 }).expect(400);
      await auth(http.post("/cart/items"), customer).send({ serviceElementId: items[2].id, quantity: 1 }).expect(201);
      await auth(http.post("/orders"), customer).send({ desiredStartAt: start }).expect(400);
      const booking = await auth(http.post("/orders"), customer).send({ desiredStartAt: start, desiredEndAt: end }).expect(201);
      assert.equal(booking.body.items.length, 2);
      assert.ok(booking.body.items.every((item) => item.quantity === 1));
      await auth(http.post("/cart/items"), admin).send({ serviceElementId: items[1].id, quantity: 1 }).expect(201);
      await auth(http.post("/orders"), admin).send({ desiredStartAt: start, desiredEndAt: end }).expect(409);
      // Recheck quantities on placement if an administrator reclassified a draft's service.
      const another = await auth(http.post("/cart/items"), customer).send({ serviceElementId: items[0].id, quantity: 3 }).expect(201);
      await auth(http.put(`/services/${goods.id}`)).field("name", `${prefix}-goods`).field("kind", "services").expect(204);
      await auth(http.post("/orders"), customer).send({ desiredStartAt: start }).expect(400);
      await auth(http.patch(`/cart/items/${another.body.items[0].id}`), customer).send({ quantity: 1 }).expect(200);
      const appointment = await auth(http.post("/orders"), customer).send({ desiredStartAt: start }).expect(201);
      assert.equal(appointment.body.items[0].serviceType.kind, "services");
      await auth(http.put(`/services/${service.id}`)).field("name", `${prefix}-services`).field("kind", "goods").expect(400);
      // Both transactions compete for the last slot; only one may reserve it.
      for (const actor of [admin, customer]) {
        await auth(http.post("/cart/items"), actor).send({ serviceElementId: items[1].id, quantity: 1 }).expect(201);
      }
      const interval = {
        desiredStartAt: new Date(Date.now() + 172800000).toISOString(),
        desiredEndAt: new Date(Date.now() + 176400000).toISOString(),
      };
      const simultaneous = await Promise.all([admin, customer].map((actor) => auth(http.post("/orders"), actor).send(interval)));
      assert.deepEqual(simultaneous.map((response) => response.status).sort(), [201, 409]);
    });

    await t.test("admin lists are paginated, searchable, role protected and omit QR tokens", async () => {
      for (const name of ["Alpha", "Beta"]) {
        const response = await auth(http.post("/companies"), customer).send({ name: `${prefix}-${name}`, inn: name === "Alpha" ? "1234567890" : "9876543210" }).expect(201);
        companies.push(response.body.id);
      }
      const topUp = await auth(http.post(`/companies/${companies[0]}/top-ups`), customer).send({ amountMinor: 10000 }).expect(201);
      topUpId = topUp.body.id;
      for (const route of ["/admin/companies", "/admin/company-top-ups"]) {
        await http.get(route).expect(401);
        for (const actor of [customer, manager, employee]) await auth(http.get(route), actor).expect(403);
        for (const query of ["page=0", "limit=101", "page=1.5", "extra=1"]) await auth(http.get(`${route}?${query}`)).expect(400);
      }
      const first = await auth(http.get(`/admin/companies?query=${prefix.toUpperCase()}&limit=1`)).expect(200);
      const second = await auth(http.get(`/admin/companies?query=${prefix}&limit=1&page=2`)).expect(200);
      assert.equal(first.body.total, 2);
      assert.equal(first.body.items.length, 1);
      assert.notEqual(first.body.items[0].id, second.body.items[0].id);
      assert.equal(JSON.stringify(first.body).includes("qrToken"), false);
      const innSearch = await auth(http.get("/admin/companies?query=1234567890")).expect(200);
      assert.ok(innSearch.body.items.some((item) => item.id === companies[0]));
      const pending = await auth(http.get(`/admin/company-top-ups?status=pending&companyId=${companies[0]}&query=${prefix}`)).expect(200);
      assert.equal(pending.body.total, 1);
      assert.equal(pending.body.items[0].id, topUpId);
      assert.equal(pending.body.items[0].company.name, `${prefix}-Alpha`);
      await auth(http.get("/admin/company-top-ups?status=invalid")).expect(400);
      await auth(http.post(`/admin/company-top-ups/${topUpId}/confirm`)).expect(200);
      assert.equal((await auth(http.get(`/admin/company-top-ups?status=pending&companyId=${companies[0]}`)).expect(200)).body.total, 0);
    });

    await t.test("contacts persist, read publicly, replace atomically and reject unauthorized or invalid writes", async () => {
      const data = { name: "Test complex", address: "M-7", phones: ["+79991234567"], workingHours: "24/7", latitude: 55.64, longitude: 52.83, email: "contact@example.com", mapUrl: "https://example.com/map" };
      await http.put("/admin/settings/contacts").send(data).expect(401);
      for (const actor of [customer, manager, employee]) await auth(http.put("/admin/settings/contacts"), actor).send(data).expect(403);
      if (!previousContacts) await http.get("/settings/contacts").expect(404);
      await auth(http.put("/admin/settings/contacts")).send(data).expect(200);
      const read = await http.get("/settings/contacts").expect(200);
      assert.equal(read.body.name, data.name);
      assert.equal(read.body.email, data.email);
      assert.deepEqual(read.body.phones, data.phones);
      for (const invalid of [{ latitude: 91 }, { longitude: null }, { phones: [] }, { phones: ["bad"] }, { mapUrl: "javascript:alert(1)" }, { name: " " }, { unknown: true }]) {
        await auth(http.put("/admin/settings/contacts")).send({ ...data, ...invalid }).expect(400);
      }
      assert.equal((await http.get("/settings/contacts").expect(200)).body.latitude, data.latitude);
      const { email, mapUrl, ...withoutOptional } = data;
      const replaced = await auth(http.put("/admin/settings/contacts")).send(withoutOptional).expect(200);
      assert.equal(replaced.body.email, null);
      assert.equal(replaced.body.mapUrl, null);
    });

    await t.test("OpenAPI accurately describes service creation and new read/write contracts", () => {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("test").setVersion("1").build());
      const schema = document.paths["/services"].post.requestBody.content["multipart/form-data"].schema;
      assert.deepEqual(schema.required, ["name"]);
      assert.deepEqual(schema.properties.kind.enum, ["goods", "services"]);
      assert.deepEqual(schema.properties.showType.enum, ["table", "blocks"]);
      assert.equal(schema.properties.bookingCapacity.type, "integer");
      for (const path of ["/admin/companies", "/admin/company-top-ups", "/settings/contacts", "/admin/settings/contacts"]) assert.ok(document.paths[path]);
    });
  } finally {
    await prisma.companyLedgerEntry.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.companyTopUp.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.companyMember.deleteMany({ where: { companyId: { in: companies } } });
    await prisma.company.deleteMany({ where: { id: { in: companies } } });
    await prisma.preorderItem.deleteMany({ where: { preorder: { userId: { in: users } } } });
    await prisma.preorder.deleteMany({ where: { userId: { in: users } } });
    await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: users } } } });
    await prisma.cart.deleteMany({ where: { userId: { in: users } } });
    await prisma.serviceElement.deleteMany({ where: { type: { in: services } } });
    await prisma.serviceType.deleteMany({ where: { id: { in: services } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousContacts) await prisma.siteContacts.update({ where: { id: 1 }, data: previousContacts });
    else await prisma.siteContacts.deleteMany({ where: { id: 1 } });
    await app.close();
    await prisma.$disconnect();
  }
});

test("service kind migration preserves existing catalogue data and enforces goods scheduling", async () => {
  const { Client } = require("pg");
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `service_kinds_${Date.now()}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "ServiceType" (id INTEGER PRIMARY KEY, name TEXT NOT NULL, "bookingMode" TEXT NOT NULL, photo TEXT, gallery TEXT[])');
    await client.query('INSERT INTO "ServiceType" VALUES (1, $1, $2, $3, $4), (2, $5, $6, $3, $4)', ["Cafe", "appointment", "original-photo", ["original-gallery"], "Hotel", "duration"]);
    const before = await client.query('SELECT * FROM "ServiceType" ORDER BY id');
    await client.query(readFileSync(join(__dirname, "../prisma/migrations/20261120010000_service_kinds/migration.sql"), "utf8"));
    const after = await client.query('SELECT * FROM "ServiceType" ORDER BY id');
    assert.deepEqual(after.rows.map(({ kind, ...row }) => row), before.rows);
    assert.deepEqual(after.rows.map((row) => row.kind), ["goods", "services"]);
    await assert.rejects(client.query('UPDATE "ServiceType" SET "bookingMode" = $1 WHERE id = 1', ["duration"]), (error) => error.code === "23514");
    await client.query('UPDATE "ServiceType" SET kind = $1, "bookingMode" = $2 WHERE id = 1', ["services", "duration"]);
  } finally {
    await client.query("ROLLBACK");
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});
