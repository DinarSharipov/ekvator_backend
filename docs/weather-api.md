# Weather API

`GET /weather` is public and requires no Bearer token. It fetches the Open-Meteo Forecast API server-side, so browser clients do not contact Open-Meteo directly.

Query parameters:

- `latitude`: required number from `-90` through `90`.
- `longitude`: required number from `-180` through `180`.
- `date`: required UTC calendar date in `YYYY-MM-DD`, from today through 16 days ahead (both inclusive).

For today's UTC date, the response uses Open-Meteo's `current` data. For a later date it selects `12:00` in Open-Meteo's automatic local timezone, or the first hourly value for the requested date when noon is unavailable.

```json
{
  "time": "2026-11-12T12:00",
  "temperature": 5.2,
  "humidity": 81,
  "pressure": 1008.4,
  "weatherCode": 3,
  "isCurrent": true
}
```

`humidity`, `pressure`, and `weatherCode` may be `null`. Successful responses are cached in memory by `latitude + longitude + date` for 5 minutes, with at most 200 entries. Provider calls time out after 7 seconds. Provider failures return `502` with `WEATHER_PROVIDER_UNAVAILABLE`; unavailable forecasts return `404` with `WEATHER_FORECAST_NOT_FOUND`.
