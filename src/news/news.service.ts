import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { setTimeout as sleep } from "node:timers/promises";
import { M7NewsQueryDto, M7NewsResponseDto } from "./news.dto";
import { normalizeArticles } from "./news-normalization";

export const NEWS_REFRESH_MS = 15 * 60 * 1000;
const GAP_MS = 6_000;

@Injectable()
export class NewsRuntime {
  now() { return Date.now(); }
  fetch(url: URL, signal: AbortSignal) { return fetch(url, { signal, redirect: "error" }); }
  async sleep(ms: number, signal: AbortSignal) { await sleep(ms, undefined, { signal }); }
}

export function retryAfterMs(value: string | null, now: number): number {
  if (!value) return 0;
  const delay = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export function gdeltNewsUrl(query: M7NewsQueryDto): URL {
  const route = '("M-7 highway" OR "M7 highway" OR "Volga highway" OR "трасса М-7" OR "трасса М7" OR "трасса М 7") sourcelang:russian';
  const traffic = ' (accident OR crash OR closure OR restriction OR repair OR congestion OR snow OR ДТП OR перекрытие OR ремонт OR пробка)';
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.search = new URLSearchParams({ query: route + (query.category === "traffic" ? traffic : ""), mode: "artlist", format: "json", sort: "datedesc", maxrecords: "50", timespan: query.period }).toString();
  return url;
}

@Injectable()
export class NewsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NewsService.name);
  private readonly cache = new Map<string, M7NewsResponseDto>();
  private readonly failed = new Set<string>();
  private readonly shutdown = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private cycle?: Promise<void>;
  private nextRequestAt = 0;

  constructor(private readonly runtime: NewsRuntime) {}

  onApplicationBootstrap() {
    void this.refreshAll();
    this.timer = setInterval(() => { void this.refreshAll(); }, NEWS_REFRESH_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    this.shutdown.abort();
    await this.cycle;
  }

  read(query: M7NewsQueryDto): M7NewsResponseDto {
    const key = `${query.category}:${query.period}`;
    const cached = this.cache.get(key);
    if (!cached) throw new ServiceUnavailableException({ statusCode: 503, code: "M7_NEWS_UNAVAILABLE", message: "News cache is not available yet" });
    return { articles: cached.articles.map(article => ({ ...article })), fetchedAt: cached.fetchedAt,
      stale: this.failed.has(key) || this.runtime.now() - Date.parse(cached.fetchedAt) >= NEWS_REFRESH_MS };
  }

  // Singleton cache: one cycle coalesces every key, including retries and startup.
  refreshAll(): Promise<void> {
    if (this.cycle) return this.cycle;
    if (this.shutdown.signal.aborted) return Promise.resolve();
    this.cycle = this.refreshCycle().finally(() => { this.cycle = undefined; });
    return this.cycle;
  }

  private async refreshCycle() {
    for (const category of ["all", "traffic"] as const) {
      for (const period of ["7d", "24h", "30d"] as const) {
        if (this.shutdown.signal.aborted) return;
        const key = `${category}:${period}`;
        try {
          const articles = await this.load({ category, period });
          this.cache.set(key, { articles, fetchedAt: new Date(this.runtime.now()).toISOString(), stale: false });
          this.failed.delete(key);
          this.logger.log(`GDELT ${key}: ${articles.length} relevant articles`);
        } catch (error) {
          this.failed.add(key);
          if (!this.shutdown.signal.aborted) this.logger.warn(`GDELT ${key}: ${error instanceof Error ? error.message : "request failed"}`);
        }
      }
    }
  }

  private async load(query: M7NewsQueryDto) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = this.nextRequestAt - this.runtime.now();
      if (wait > 60_000) throw new Error("Provider cooldown active");
      if (wait > 0) await this.runtime.sleep(wait, this.shutdown.signal);
      try {
        const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(30_000)]);
        const response = await this.runtime.fetch(gdeltNewsUrl(query), signal);
        if (!response.ok) {
          this.nextRequestAt = Math.max(this.nextRequestAt, this.runtime.now() + retryAfterMs(response.headers.get("retry-after"), this.runtime.now()));
          await response.body?.cancel();
          if (response.status !== 429 && response.status < 500) throw new Error(`Provider HTTP ${response.status}`);
          this.nextRequestAt = Math.max(this.nextRequestAt, this.runtime.now() + (response.status === 429 ? 30_000 : GAP_MS));
          if (attempt === 1) throw new Error(`Provider HTTP ${response.status}; retries exhausted`);
        } else {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Missing provider body");
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.length;
              if (size > 2_000_000) throw new Error("Provider body too large");
              chunks.push(value);
            }
          } finally { await reader.cancel(); }
          // A missing Content-Type is tolerated, HTTP-200 text/HTML is not.
          return normalizeArticles(JSON.parse(Buffer.concat(chunks).toString("utf8")), query.category);
        }
      } catch (error) {
        if (this.shutdown.signal.aborted) throw error;
        const transient = error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
        if (!transient || attempt === 1) throw error;
      } finally {
        this.nextRequestAt = Math.max(this.nextRequestAt, this.runtime.now() + GAP_MS);
      }
    }
    throw new Error("Provider retries exhausted");
  }
}
