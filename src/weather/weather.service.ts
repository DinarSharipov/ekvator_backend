import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { WeatherQueryDto } from "./dto/weather-query.dto";
import { WeatherResponseDto } from "./dto/weather-response.dto";

type OpenMeteoResponse = {
  current?: WeatherPoint;
  hourly?: { time?: string[]; temperature_2m?: number[]; relative_humidity_2m?: number[]; surface_pressure?: number[]; weather_code?: number[] };
};
type WeatherPoint = { time?: string; temperature_2m?: number; relative_humidity_2m?: number; surface_pressure?: number; weather_code?: number };

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const PROVIDER_TIMEOUT_MS = 7_000;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: WeatherResponseDto }>();

  async forecast(query: WeatherQueryDto): Promise<WeatherResponseDto> {
    const today = this.parseDate(this.utcDate(new Date()));
    const requested = this.parseDate(query.date);
    const daysAhead = Math.round((requested.getTime() - today.getTime()) / 86_400_000);
    if (daysAhead < 0 || daysAhead > 16) throw new BadRequestException("date must be from today through 16 days ahead (UTC)");

    const key = `${query.latitude}:${query.longitude}:${query.date}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) this.cache.delete(key);

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(query.latitude), longitude: String(query.longitude), timezone: "auto",
      start_date: query.date, end_date: query.date,
      current: "temperature_2m,relative_humidity_2m,surface_pressure,weather_code",
      hourly: "temperature_2m,relative_humidity_2m,surface_pressure,weather_code",
    }).toString();

    let provider: OpenMeteoResponse;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Unexpected provider status ${response.status}`);
      provider = await response.json() as OpenMeteoResponse;
    } catch (error) {
      this.logger.warn(`Open-Meteo request failed: ${error instanceof Error ? error.message : "unknown error"}`);
      throw new BadGatewayException({ statusCode: 502, code: "WEATHER_PROVIDER_UNAVAILABLE", message: "Weather provider is unavailable" });
    }

    const result = daysAhead === 0 ? this.current(provider.current) : this.hourly(provider.hourly, query.date);
    this.putCache(key, result);
    return result;
  }

  private current(point?: WeatherPoint): WeatherResponseDto {
    if (!point?.time || typeof point.temperature_2m !== "number") this.noForecast();
    return this.normalize(point, true);
  }

  private hourly(hourly: OpenMeteoResponse["hourly"], date: string): WeatherResponseDto {
    const times = hourly?.time ?? [];
    const index = times.findIndex((time) => time === `${date}T12:00`) >= 0
      ? times.findIndex((time) => time === `${date}T12:00`)
      : times.findIndex((time) => time.startsWith(`${date}T`));
    if (index < 0 || typeof hourly?.temperature_2m?.[index] !== "number") this.noForecast();
    return this.normalize({ time: times[index], temperature_2m: hourly!.temperature_2m![index], relative_humidity_2m: hourly!.relative_humidity_2m?.[index], surface_pressure: hourly!.surface_pressure?.[index], weather_code: hourly!.weather_code?.[index] }, false);
  }

  private normalize(point: WeatherPoint, isCurrent: boolean): WeatherResponseDto {
    return { time: point.time!, temperature: point.temperature_2m!, humidity: point.relative_humidity_2m ?? null, pressure: point.surface_pressure ?? null, weatherCode: point.weather_code ?? null, isCurrent };
  }

  private putCache(key: string, value: WeatherResponseDto) {
    if (this.cache.size >= CACHE_MAX_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("date must be in YYYY-MM-DD format");
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || this.utcDate(parsed) !== value) throw new BadRequestException("date must be a valid YYYY-MM-DD date");
    return parsed;
  }

  private utcDate(date: Date) { return date.toISOString().slice(0, 10); }
  private noForecast(): never { throw new NotFoundException({ statusCode: 404, code: "WEATHER_FORECAST_NOT_FOUND", message: "Weather forecast is unavailable for this date" }); }
}
