require("reflect-metadata");
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Test } = require("@nestjs/testing");
const { UnauthorizedException } = require("@nestjs/common");
const request = require("supertest");
const { ServiceElementsController } = require("../dist/service-elements/service-element.controller");
const { ServiceElementService } = require("../dist/service-elements/service-element.service");
const { ServiceAccessService } = require("../dist/auth/service-access.service");
const { AuthGuard } = require("../dist/auth/auth.guard");
const { PrismaService } = require("../dist/prisma/prisma.service");

test("bulk availability HTTP validation, grants and all-or-nothing selection", async (t) => {
  const items = [
    { id: 1, type: 10, preorderAvailable: false, isArchive: false, price: 100, photos: ["photo"] },
    { id: 2, type: 20, preorderAvailable: false, isArchive: true, price: 200, photos: [] },
  ];
  const original = structuredClone(items);
  const tx = {
    $queryRaw: async () => [],
    serviceElement: {
      findMany: async ({ where }) => items.filter((item) => where.id.in.includes(item.id)),
      updateMany: async ({ where, data }) => {
        for (const item of items) if (where.id.in.includes(item.id)) Object.assign(item, data);
      },
    },
  };
  const module = await Test.createTestingModule({
    controllers: [ServiceElementsController],
    providers: [ServiceElementService, ServiceAccessService, { provide: PrismaService, useValue: { $transaction: (run) => run(tx) } }],
  }).overrideGuard(AuthGuard).useValue({
    canActivate(context) {
      const req = context.switchToHttp().getRequest();
      const actor = req.headers.authorization;
      if (!actor) throw new UnauthorizedException();
      req.user = {
        id: 1, serviceAssignments: [{ serviceTypeId: 10 }],
        accessRoles: [{ role: { isAdministrator: false, grants: actor === "none" ? [] : [{ privilege: "items.update", scope: actor === "all" ? "all" : "assigned" }] } }],
      };
      return true;
    },
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  const patch = (body, actor = "all") => http.patch("/service-elements/preorder-availability").set("Authorization", actor).send(body);
  try {
    await t.test("rejects anonymous and users without update privilege", async () => {
      await http.patch("/service-elements/preorder-availability").send({ ids: [1], preorderAvailable: true }).expect(401);
      await patch({ ids: [1], preorderAvailable: true }, "none").expect(403);
    });
    await t.test("rejects malformed payloads including string booleans and duplicate IDs", async () => {
      for (const body of [
        { ids: [], preorderAvailable: true }, { ids: [1, 1], preorderAvailable: true },
        { ids: ["1"], preorderAvailable: true }, { ids: [0], preorderAvailable: true },
        { ids: [1.5], preorderAvailable: true }, { ids: [2147483648], preorderAvailable: true },
        { ids: Array.from({ length: 1001 }, (_, i) => i + 1), preorderAvailable: true },
        { ids: [1], preorderAvailable: "false" }, { ids: [1] },
        { ids: [1], preorderAvailable: true, isArchive: false },
      ]) await patch(body).expect(400);
    });
    await t.test("missing or unauthorized member prevents the entire batch", async () => {
      await patch({ ids: [1, 99], preorderAvailable: true }).expect(404);
      await patch({ ids: [1, 2], preorderAvailable: true }, "assigned").expect(403);
      assert.deepEqual(items, original);
    });
    await t.test("supports assigned scope, cross-service global scope and true/false without altering other fields", async () => {
      await patch({ ids: [1], preorderAvailable: true }, "assigned").expect(204);
      assert.equal(items[0].preorderAvailable, true);
      assert.equal(items[1].preorderAvailable, false);
      await patch({ ids: [1, 2], preorderAvailable: true }).expect(204);
      assert.ok(items.every((item) => item.preorderAvailable));
      await patch({ ids: [1, 2], preorderAvailable: true }).expect(204);
      await patch({ ids: [1, 2], preorderAvailable: false }).expect(204);
      assert.deepEqual(items, original);
    });
  } finally { await app.close(); }
});
