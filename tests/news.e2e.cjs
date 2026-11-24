const assert = require('node:assert/strict');
const { test } = require('node:test');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { NewsController } = require('../dist/news/news.controller');
const { NewsService, NEWS_REFRESH_MS, retryAfterMs, gdeltNewsUrl } = require('../dist/news/news.service');
const { normalizeArticles } = require('../dist/news/news-normalization');
require('@nestjs/common').Logger.overrideLogger(false);

const article = (extra = {}) => ({ url: 'https://publisher.ru/news/1', title: 'На трассе М-7 в Татарстане ограничили движение', seendate: '20261124T100000Z', domain: 'publisher.ru', sourcecountry: 'Russia', language: 'Russian', ...extra });
function setup(responder = () => Response.json({ articles: [article()] })) {
  let clock = Date.parse('2026-11-24T10:05:00Z');
  const calls = [], waits = [];
  const runtime = { now: () => clock, sleep: async (ms, signal) => { signal.throwIfAborted(); waits.push(ms); clock += ms; },
    fetch: async (url, signal) => { calls.push({ url, at: clock, signal }); return responder(url, calls.length, signal); } };
  const service = new NewsService(runtime);
  return { service, calls, waits, advance: ms => { clock += ms; } };
}

test('normalizes empty forms, rejects HTTP-200 error bodies and malformed schemas', () => {
  assert.deepEqual(normalizeArticles({}, 'all'), []);
  assert.deepEqual(normalizeArticles({ articles: [] }, 'all'), []);
  for (const value of [null, [], 'The specified phrase is too short', { error: 'failed' }, { articles: {} }]) {
    assert.throws(() => normalizeArticles(value, 'all'));
  }
});

test('filters foreign roads, car models, invalid records; canonicalizes, deduplicates and sorts', () => {
  const records = [article({ seendate: '20261123T100000Z', url: 'https://publisher.ru/news/1?utm_source=x#top' }),
    article({ url: 'https://publisher.ru/news/1?utm_medium=y' }),
    article({ url: 'https://publisher.ru/news/2', title: 'На трассе М-7 в Татарстане ограничили движение!' }),
    article({ title: 'На трассе M7 в Ирландии авария' }), article({ title: 'BMW M7 на трассе в России' }),
    article({ title: 'M7 motorway crash in Hungary', sourcecountry: 'Hungary' }),
    article({ title: 'На трассе М-71 ремонт' }), article({ title: 'Новый М7 в продаже' }),
    article({ seendate: '20260230T100000Z' }), article({ url: 'javascript:alert(1)' }),
    article({ url: 'https://evil.example/path' }), article({ title: 'Ремонт трассы М-7 в Казани', url: 'https://publisher.ru/other' })];
  const result = normalizeArticles({ articles: records }, 'traffic');
  assert.equal(result.length, 2);
  assert.equal(result[0].seendate, '20261124T100000Z');
  assert.equal(result.find(a => a.url.endsWith('/news/1')).url, 'https://publisher.ru/news/1');
  assert.equal(normalizeArticles({ articles: [article({ title: 'Трасса М-7 в Татарстане получила новое название' })] }, 'traffic').length, 0);
  assert.equal(normalizeArticles({ articles: [article({ title: 'Трасса М-7 в Татарстане получила новое название' })] }, 'all').length, 1);
});

test('all six keys load sequentially; overlapping cycles coalesce; visitors never fetch', async () => {
  const { service, calls } = setup();
  try {
    assert.throws(() => service.read({ category: 'all', period: '7d' }), e => e.getStatus() === 503);
    const cycle = service.refreshAll();
    assert.equal(service.refreshAll(), cycle);
    await cycle;
    assert.equal(calls.length, 6);
    assert.ok(calls.every(c => c.signal instanceof AbortSignal));
    assert.equal(new Set(calls.map(c => c.url.searchParams.get('query') + c.url.searchParams.get('timespan'))).size, 6);
    for (let i = 1; i < calls.length; i++) assert.ok(calls[i].at - calls[i - 1].at >= 5000);
    for (const category of ['all', 'traffic']) for (const period of ['24h', '7d', '30d']) {
      const result = service.read({ category, period });
      assert.equal(result.stale, false);
      assert.equal(result.articles.length, 1);
    }
    await Promise.all(Array.from({ length: 50 }, () => Promise.resolve(service.read({ category: 'all', period: '7d' }))));
    assert.equal(calls.length, 6);
    assert.equal(calls[0].url.hostname, 'api.gdeltproject.org');
    const altered = service.read({ category: 'all', period: '7d' });
    altered.articles[0].title = 'changed by caller';
    assert.notEqual(service.read({ category: 'all', period: '7d' }).articles[0].title, altered.articles[0].title);
  } finally { await service.onModuleDestroy(); }
});

test('failure preserves cached data and original fetchedAt; expiry and recovery work', async () => {
  let fail = false;
  const { service, advance } = setup(() => fail ? new Response('The specified phrase is too short') : Response.json({ articles: [article()] }));
  try {
    await service.refreshAll();
    const first = service.read({ category: 'all', period: '7d' });
    fail = true;
    await service.refreshAll();
    assert.deepEqual(service.read({ category: 'all', period: '7d' }), { ...first, stale: true });
    fail = false;
    await service.refreshAll();
    assert.equal(service.read({ category: 'all', period: '7d' }).stale, false);
    advance(NEWS_REFRESH_MS);
    assert.equal(service.read({ category: 'all', period: '7d' }).stale, true);
  } finally { await service.onModuleDestroy(); }
});

test('429 honors Retry-After across keys and retries are bounded; long cooldown never fetches early', async () => {
  const { service, calls, advance } = setup(() => new Response('rate limited', { status: 429, headers: { 'Retry-After': '120' } }));
  try {
    await service.refreshAll();
    assert.equal(calls.length, 1);
    await service.refreshAll();
    assert.equal(calls.length, 1);
    advance(120000);
    await service.refreshAll();
    assert.equal(calls.length, 2);
    assert.equal(retryAfterMs('10', 0), 10000);
    assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:20 GMT', 5000), 15000);
    assert.equal(retryAfterMs('invalid', 0), 0);
  } finally { await service.onModuleDestroy(); }
  const bounded = setup(() => new Response('unavailable', { status: 503 }));
  await bounded.service.refreshAll();
  assert.equal(bounded.calls.length, 12);
  await bounded.service.onModuleDestroy();
  const limited = setup((url, count) => count === 1 ? new Response('limited', { status: 429, headers: { 'Retry-After': '45' } }) : Response.json({}));
  await limited.service.refreshAll();
  assert.equal(limited.calls.length, 7);
  assert.ok(limited.calls[1].at - limited.calls[0].at >= 45000);
  await limited.service.onModuleDestroy();
});

test('startup schedules every 15 minutes and destruction clears the timer', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { service } = setup();
  let cycles = 0;
  service.refreshAll = async () => { cycles++; };
  service.onApplicationBootstrap();
  assert.equal(cycles, 1);
  t.mock.timers.tick(NEWS_REFRESH_MS - 1);
  assert.equal(cycles, 1);
  t.mock.timers.tick(1);
  assert.equal(cycles, 2);
  await service.onModuleDestroy();
  t.mock.timers.tick(NEWS_REFRESH_MS);
  assert.equal(cycles, 2);
});

test('timeouts retry once; successful empty results are cached; shutdown aborts work', async () => {
  const timed = setup(() => { throw new DOMException('timed out', 'TimeoutError'); });
  await timed.service.refreshAll();
  assert.equal(timed.calls.length, 12);
  assert.throws(() => timed.service.read({ category: 'all', period: '7d' }));
  await timed.service.onModuleDestroy();
  const empty = setup(() => Response.json({}));
  await empty.service.refreshAll();
  assert.deepEqual(empty.service.read({ category: 'all', period: '7d' }).articles, []);
  await empty.service.onModuleDestroy();
  const stopped = setup((url, count, signal) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const work = stopped.service.refreshAll();
  await stopped.service.onModuleDestroy();
  await work;
  assert.equal(stopped.calls.length, 1);
});

test('public HTTP validates enums/defaults and exposes OpenAPI without visitor upstream calls', async () => {
  const { service } = setup(() => Response.json({ articles: [] }));
  await service.refreshAll();
  const module = await Test.createTestingModule({ controllers: [NewsController], providers: [{ provide: NewsService, useValue: { read: query => service.read(query) } }] }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    const http = request(app.getHttpServer());
    await http.get('/news/m7').expect(200);
    for (const category of ['all', 'traffic']) for (const period of ['24h', '7d', '30d']) await http.get(`/news/m7?category=${category}&period=${period}`).expect(200);
    for (const query of ['category=x', 'period=1d', 'category=', 'period=', 'url=https://evil.example', 'category=all&category=traffic']) await http.get(`/news/m7?${query}`).expect(400);
    const spec = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    assert.ok(spec.paths['/news/m7'].get.responses['503']);
    assert.ok(spec.components.schemas.M7NewsResponseDto);
    const url = gdeltNewsUrl({ category: 'traffic', period: '30d' });
    assert.equal(url.searchParams.get('timespan'), '30d');
    assert.ok(url.searchParams.get('query').includes('accident'));
  } finally { await app.close(); await service.onModuleDestroy(); }
});
