require("reflect-metadata");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Test } = require("@nestjs/testing");
const { UnauthorizedException } = require("@nestjs/common");
const { DocumentBuilder, SwaggerModule } = require("@nestjs/swagger");
const request = require("supertest");
const url = new URL(process.env.TEST_DATABASE_URL || "postgresql://localhost/missing");
if (!process.env.TEST_DATABASE_URL || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.endsWith("_test"))
  throw new Error("Set TEST_DATABASE_URL to an isolated local database ending in _test");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { PartnersModule } = require("../dist/partners/partners.module");
const { PrismaService } = require("../dist/prisma/prisma.service");
const { AuthGuard } = require("../dist/auth/auth.guard");

test("partners HTTP CRUD with real PostgreSQL and privilege guard", async (t) => {
  const module = await Test.createTestingModule({ imports: [PartnersModule] })
    .overrideGuard(AuthGuard).useValue({ canActivate(context) {
      const req = context.switchToHttp().getRequest();
      if (!req.headers.authorization) throw new UnauthorizedException();
      req.user = { accessRoles: [{ role: { isAdministrator: false, grants: req.headers.authorization === "editor" ? [{ privilege: "settings.update", scope: "all" }] : [] } }] };
      return true;
    } }).compile();
  const app = module.createNestApplication();
  await app.init();
  const prisma = module.get(PrismaService);
  const http = request(app.getHttpServer());
  const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCioAAAAASUVORK5CYII=";
  let id;
  try {
    await t.test("public reads and protected writes", async () => {
      await http.get("/partners").expect(200);
      for (const verb of ["post", "patch", "delete"]) {
        const path = verb === "post" ? "/partners" : "/partners/1";
        await http[verb](path).send({ name: "Test", image }).expect(401);
        await http[verb](path).set("Authorization", "reader").send({ name: "Test", image }).expect(403);
      }
    });
    await t.test("create validates required fields and optional formats", async () => {
      for (const body of [{}, { name: " ", image }, { name: "Test", image: "bad!" }, { name: "Test", image: "data:image/png;base64," }, { name: "Test", image: null }, { name: "Test", image, id: 1 }, { name: "Test", image, email: "bad" }, { name: "Test", image, site: "javascript:alert(1)" }, { name: "Test", image, inn: "123" }, { name: "Test", image: "A".repeat(90004) }])
        await http.post("/partners").set("Authorization", "editor").send(body).expect(400);
      const created = await http.post("/partners").set("Authorization", "editor").send({ name: " Test partner ", image, site: "https://example.com", email: "partner@example.com", phone: "+7 (999) 123-45-67", person: "Contact", inn: "1650123456" }).expect(201);
      id = created.body.id;
      assert.ok(Number.isInteger(id));
      assert.equal(created.body.name, "Test partner");
      assert.equal(created.body.image, image);
      assert.equal(created.body.inn, "1650123456");
    });
    await t.test("read, partial update, nullable fields and image data URL", async () => {
      const read = await http.get("/partners/" + id).expect(200);
      const list = await http.get("/partners").expect(200);
      assert.deepEqual(list.body.find(p => p.id === id), read.body);
      for (const body of [{ name: null }, { image: null }, { image: "" }, { id: 99 }, { name: " " }, { person: 123 }])
        await http.patch("/partners/" + id).set("Authorization", "editor").send(body).expect(400);
      const updated = await http.patch("/partners/" + id).set("Authorization", "editor").send({ name: "Updated", email: null, image: "data:image/png;base64," + image }).expect(200);
      assert.equal(updated.body.email, null);
      assert.equal(updated.body.site, read.body.site);
      assert.equal(updated.body.name, "Updated");
      assert.equal(updated.body.image, "data:image/png;base64," + image);
      const persisted = await prisma.partner.findUnique({ where: { id } });
      assert.deepEqual(persisted, updated.body);
    });
    await t.test("delete and missing resources return correct statuses", async () => {
      for (const invalid of ["not-an-id", "0", "-1", "2147483648", "1.5"]) await http.get("/partners/" + invalid).expect(400);
      await http.delete("/partners/" + id).set("Authorization", "editor").expect(204);
      await http.get("/partners/" + id).expect(404);
      await http.patch("/partners/" + id).set("Authorization", "editor").send({ name: "Missing" }).expect(404);
      await http.delete("/partners/" + id).set("Authorization", "editor").expect(404);
    });
    await t.test("OpenAPI contains CRUD and strict partial DTO", () => {
      const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addBearerAuth().build());
      assert.ok(doc.paths["/partners"].post);
      assert.ok(doc.paths["/partners/{id}"].patch);
      assert.ok(doc.paths["/partners/{id}"].delete);
      assert.ok(doc.components.schemas.CreatePartnerDto.required.includes("image"));
      assert.equal(doc.components.schemas.UpdatePartnerDto.required, undefined);
    });
  } finally {
    if (id) await prisma.partner.deleteMany({ where: { id } });
    await app.close();
    await prisma.$disconnect();
  }
});
