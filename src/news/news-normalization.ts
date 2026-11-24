import { NewsArticleDto } from "./news.dto";

const route = /(?:^|[^\p{L}\p{N}])[мm]\s*[-–—]?\s*7(?![\p{L}\p{N}])/iu;
const road = /трасс|автодорог|магистра|шоссе|highway|motorway|\broad\b/iu;
const geography = /росси|татарстан|казан|чуваш|чебоксар|владимир|нижегород|нижн.{0,3}новгород|башкир|башкортостан|уф[аыуе]|моск|russia|tatarstan|kazan|volga/iu;
const foreign = /ирланди|венгри|австрали|юар|ireland|hungar|australia|south africa|budapest|dublin/iu;
const vehicle = /\b(?:BMW|AITO|Luxgen|Chery|Huawei|Wenjie|XPeng)\s*[-–—]?\s*[мm]\s*[-–—]?\s*7\b/iu;
const traffic = /дтп|авари|столкнов|погиб|пострад|перекры|огранич|ремонт|пробк|затор|снег|голол[её]д|метел|движени|accident|crash|closure|restrict|repair|congestion|snow|traffic/iu;

export function normalizeArticles(body: unknown, category: "all" | "traffic"): NewsArticleDto[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid GDELT object");
  const data = body as Record<string, unknown>;
  // GDELT also returns exactly {} for a successful search without matches.
  if (Object.keys(data).length === 0) return [];
  if (!Array.isArray(data.articles)) throw new Error("Missing GDELT articles");
  if (data.articles.length > 250) throw new Error("Oversized GDELT article list");
  const valid: NewsArticleDto[] = [];
  for (const record of data.articles) {
    if (!record || typeof record !== "object") continue;
    const fields = ["url", "title", "seendate", "domain", "sourcecountry", "language"] as const;
    if (fields.some(field => typeof record[field] !== "string" || !record[field].trim())) continue;
    if (record.title.length > 2000 || record.url.length > 8000) continue;
    const stamp = record.seendate;
    if (!/^\d{8}T\d{6}Z$/.test(stamp)) continue;
    const iso = `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(9,11)}:${stamp.slice(11,13)}:${stamp.slice(13,15)}Z`;
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime()) || date.toISOString().replace(/[-:]/g, "").replace(".000", "") !== stamp) continue;
    let url: URL;
    try { url = new URL(record.url); } catch { continue; }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
    if (url.hostname.replace(/^www\./, "") !== record.domain.toLowerCase().replace(/^www\./, "")) continue;
    const title = record.title;
    if (!route.test(title) || !road.test(title) || foreign.test(title) || vehicle.test(title)) continue;
    if (record.sourcecountry.toLowerCase() !== "russia" && !geography.test(title)) continue;
    if (category === "traffic" && !traffic.test(title)) continue;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|yclid|ysclid|_openstat)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    valid.push({ url: url.toString(), title, seendate: stamp, domain: record.domain, sourcecountry: record.sourcecountry, language: record.language });
  }
  valid.sort((a, b) => b.seendate.localeCompare(a.seendate) || a.url.localeCompare(b.url));
  const urls = new Set<string>(), titles = new Set<string>();
  return valid.filter(article => {
    const url = article.url.replace(/^https?:\/\/(www\.)?/, "");
    const title = article.title.normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
    if (urls.has(url) || titles.has(title)) return false;
    urls.add(url); titles.add(title); return true;
  }).slice(0, 50);
}
