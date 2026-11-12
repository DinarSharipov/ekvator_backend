const assert = require("node:assert/strict");
const { test } = require("node:test");

process.env.JWT = "weather-e2e-test-secret";
require("reflect-metadata");
const { Test } = require("@nestjs/testing");
const request = require("supertest");
const { AppModule } = require("../dist/app.module");
const { PrismaService } = require("../dist/prisma/prisma.service");

const dateAt = (offset) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

test("public weather proxy validates, normalizes and caches provider responses", async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({
      current: { time: `${dateAt(0)}T10:15`, temperature_2m: 5.2, relative_humidity_2m: 81, surface_pressure: 1008.4, weather_code: 3 },
      hourly: { time: [`${dateAt(1)}T08:00`, `${dateAt(1)}T12:00`], temperature_2m: [1, 2], relative_humidity_2m: [61, 62], surface_pressure: [1001, 1002], weather_code: [2, 3] },
    }) };
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  const app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  try {
    await t.test("rejects invalid coordinates and UTC date ranges", async () => {
      await http.get(`/weather?latitude=91&longitude=49&date=${dateAt(0)}`).expect(400);
      await http.get(`/weather?latitude=55&longitude=49&date=${dateAt(-1)}`).expect(400);
      await http.get(`/weather?latitude=55&longitude=49&date=${dateAt(17)}`).expect(400);
    });
    await t.test("uses current data for today and serves repeat request from cache", async () => {
      const path = `/weather?latitude=55.7887&longitude=49.1221&date=${dateAt(0)}`;
      const first = await http.get(path).expect(200);
      assert.deepEqual(first.body, { time: `${dateAt(0)}T10:15`, temperature: 5.2, humidity: 81, pressure: 1008.4, weatherCode: 3, isCurrent: true });
      await http.get(path).expect(200);
      assert.equal(calls, 1);
    });
    await t.test("uses noon for future dates and falls back to first hourly point", async () => {
      const noon = await http.get(`/weather?latitude=56&longitude=50&date=${dateAt(1)}`).expect(200);
      assert.equal(noon.body.time, `${dateAt(1)}T12:00`);
      assert.equal(noon.body.temperature, 2);
      global.fetch = async () => ({ ok: true, json: async () => ({ hourly: { time: [`${dateAt(2)}T08:00`], temperature_2m: [3] } }) });
      const fallback = await http.get(`/weather?latitude=57&longitude=51&date=${dateAt(2)}`).expect(200);
      assert.deepEqual(fallback.body, { time: `${dateAt(2)}T08:00`, temperature: 3, humidity: null, pressure: null, weatherCode: null, isCurrent: false });
    });
    await t.test("does not expose provider failures and reports a stable code", async () => {
      global.fetch = async () => { throw new Error("provider socket reset"); };
      const result = await http.get(`/weather?latitude=58&longitude=52&date=${dateAt(1)}`).expect(502);
      assert.deepEqual(result.body, { statusCode: 502, code: "WEATHER_PROVIDER_UNAVAILABLE", message: "Weather provider is unavailable" });
    });
    await t.test("uses a stable code when the provider has no forecast for a date", async () => {
      global.fetch = async () => ({ ok: true, json: async () => ({ hourly: { time: [], temperature_2m: [] } }) });
      const result = await http.get(`/weather?latitude=59&longitude=53&date=${dateAt(1)}`).expect(404);
      assert.deepEqual(result.body, { statusCode: 404, code: "WEATHER_FORECAST_NOT_FOUND", message: "Weather forecast is unavailable for this date" });
    });
  } finally {
    global.fetch = originalFetch;
    await app.close();
  }
});
