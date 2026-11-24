# M-7 news backend

`GET /news/m7?category=all&period=7d` is public. `category` is `all` (default) or `traffic`; `period` is `24h`, `7d` (default), or `30d`. Unknown values, repeated values and unknown query parameters return 400.

```json
{"articles":[{"url":"https://publisher.example/article","title":"Original headline","seendate":"20261124T100000Z","domain":"publisher.example","sourcecountry":"Russia","language":"Russian"}],"fetchedAt":"2026-11-24T10:05:00.000Z","stale":false}
```

At most 50 articles, newest discovery first. `seendate` is GDELT's discovery time, **not** the incident's time or a verified publication time. No images, invented summaries or full article downloads. Publication links are returned, never fetched by this backend.

## Cache and scheduler

The Nest singleton starts a non-blocking refresh at application bootstrap and schedules another every 15 minutes. All six category/period combinations are refreshed sequentially. One in-flight cycle coalesces overlapping startup/scheduled calls. Requests only read the cache; there is no public manual-refresh endpoint.

The cache is shared by all visitors in the current backend process, bounded to six entries of at most 50 articles each. Last successful entries remain until replacement or process restart. It is memory-only: a restart starts cold and can return 503 until a successful refresh. The current deployment runs one application process/container. Before adding replicas or clustered workers, replace this cache and scheduling lock with a shared store/leader; separate processes would otherwise have independent caches and rate gates.

Every upstream attempt, including retries and different keys, waits at least six seconds after the previous attempt completes. Timeout is 30 seconds including body reading. Network/timeouts, HTTP 429 and 5xx allow at most one retry per key. A 429 imposes a global cooldown of at least 30 seconds. `Retry-After` seconds and HTTP dates can extend that cooldown. Waits over 60 seconds defer keys until a later scheduled cycle instead of issuing an early request. Shutdown cancels fetches/waits and clears the timer.

Successful empty results (`{}` or `{"articles":[]}`) are cached. HTTP-200 text/HTML, invalid JSON, invalid top-level schemas and oversized responses are failures. Upstream bodies are bounded to 2 MB. A failure never replaces a successful entry. The endpoint then returns the original `fetchedAt` and `stale:true`; an entry older than 15 minutes is also stale. If that key has never loaded successfully, return 503 with code `M7_NEWS_UNAVAILABLE`. Upstream 429/format failures are background diagnostics, not visitor 429/502 responses. This follows the explicit cache-only/no-cache-503 task requirement, superseding the earlier frontend proposal's upstream status forwarding. Responses use `Cache-Control: no-store` so intermediaries do not hide freshness changes. Existing public backend CORS applies.

## Upstream and relevance

Fixed HTTPS endpoint: `https://api.gdeltproject.org/api/v2/doc/doc`. No caller-supplied upstream URLs or query text. Redirects are rejected. Parameters: `mode=artlist`, `format=json`, `sort=datedesc`, `maxrecords=50`, `timespan=<period>`, query:

```text
("M-7 highway" OR "M7 highway" OR "Volga highway" OR "трасса М-7" OR "трасса М7" OR "трасса М 7") sourcelang:russian
```

Traffic adds `(accident OR crash OR closure OR restriction OR repair OR congestion OR snow OR ДТП OR перекрытие OR ремонт OR пробка)`.

GDELT searches machine-translated English text ([official DOC API documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)). The query remains provisional until real relevant results can be obtained from production and checked.

Local filtering requires a standalone M-7/M7 designation, a road term, and Russian source-country or Russian geographic context in the title. Explicit foreign-road context and known car/model combinations are excluded. Traffic requires a matching traffic term in the title as well. Missing/invalid records, non-HTTP(S) URLs, embedded URL credentials, mismatched domains and invalid discovery dates are dropped. Fragments and known tracking query parameters are stripped; equivalent URLs and normalized headlines are deduplicated after sorting so the newest discovery survives. Original titles and other source fields are preserved. Conservative title-only filtering intentionally misses articles whose route context exists only in their body; relevance cannot be established conclusively without real results. It does not claim complete incident coverage.

## Verification

`npm run test:news` runs deterministic HTTP, normalization and scheduler tests with a fake transport/clock, without database writes or live upstream calls. Included in `test:e2e`. `npm run build` verifies compilation. Tests cover all six keys, enums/defaults, empty responses, HTTP-200 text errors, deduplication/foreign roads/vehicle models, spacing, cycle coalescing, 429/Retry-After, bounded retries, timeout, stale retention, recovery and shutdown. Fixtures prove behavior, not live news availability.

Validation for this change: build passed; full `test:e2e` passed **92/92** on an isolated local PostgreSQL 16 database with all existing migrations applied. Existing AppModule suites preload `tests/support/offline-news.cjs` to prevent real background provider calls. News tests inject their own transport and clock. Weather tests import their focused module so their fetch stub cannot be consumed by unrelated background work. No new database migration is needed by the news feature.

### Production source diagnostics — 2026-11-24

Read-only Python HTTPS requests ran directly on backend production host `46.38.156.29`. Application, database, configuration and containers were not changed. All probes used `artlist/json/datedesc`, max 50. Counts below mean returned records, not total search matches; failed requests have an **unknown** count, not zero.

| Moscow time | Query | Period | HTTP | Body / Content-Type | Returned records |
|---|---|---|---|---|---|
| 17:23:49 | `Russia` (control) | 7d | 200 | articles JSON / application/json | 50 |
| ~17:24 | English M-7/M7/Volga highway phrases + Russian language | 7d | 429 | rate-limit text | unknown |
| ~17:24 | deliberately nonexistent term | 7d | 429 | rate-limit text | unknown |
| 17:26:58 | exact implementation query above | 7d | 429 | rate-limit text; no Content-Type or Retry-After | unknown |
| 17:27:40 | `("M-7" OR "M7" OR "Volga") (highway OR road) sourcelang:russian` | 30d | 200 | `The specified phrase is too short.` / text/html | unknown (error) |
| 17:28:25 | deliberately nonexistent term | 7d | 200 | `{}` / application/json | 0 |
| 17:28:40 | exact implementation query above | 30d | 429 | rate-limit text; no Content-Type or Retry-After | unknown |
| 17:29:21 | `Volga (highway OR road) sourcelang:russian` | 30d | 200 | articles JSON / application/json | 18; 0 pass M-7 filtering |
| 17:30:02 | `("M-7 Volga" OR "M7 Volga" OR "M-7 highway") sourcelang:russian` | 30d | 429 | rate-limit text; no Content-Type or Retry-After | unknown |
| 17:31:10 | `M7 (highway OR road) sourcelang:russian` | 30d | 429 | rate-limit text; no Content-Type or Retry-After | unknown |
| 17:31:53 | `("M-7 road" OR "M7 road" OR "M-7 highway" OR "M7 highway") sourcelang:russian` | 30d | 429 | rate-limit text; no Content-Type or Retry-After | unknown |

Initial probes waited six seconds after response completion; later probes waited 30 seconds. GDELT still returned 429, so the service does not assume that its advertised five-second minimum guarantees availability. The observed `{}` form is independently confirmed as a successful no-results response. Live M-7 relevance/coverage and frontend-to-deployed-endpoint acceptance are pending; this integration must not be described as complete until real M-7 publications pass validation.

The 18-record broad response was also passed through the compiled implementation's normalization for both categories: zero accepted in either. Titles included nationwide road transport, regional winter road maintenance, and unrelated automotive/regional news. None established M-7 context in its title; these were not relabelled as M-7 news. Full publication text was not downloaded.
