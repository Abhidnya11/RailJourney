import { z } from 'zod';
import { AppError, PermanentProviderError } from '../../errors.js';
import type { CallContext, WeatherProvider, WeatherSnapshot } from '../types.js';

const BASE = 'https://api.openweathermap.org/data/2.5/weather';
/** Weather barely changes over ~10 km or 10 minutes, so share one reading across nearby lookups. */
const TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8_000;

const currentSchema = z.object({
  main: z.object({ temp: z.number(), humidity: z.number().optional() }),
  wind: z.object({ speed: z.number().optional() }).optional(),
  weather: z.array(z.object({ description: z.string() })).optional(),
  dt: z.number().optional(),
  visibility: z.number().optional(),
  name: z.string().optional(),
  coord: z.object({ lat: z.number(), lon: z.number() }).optional(),
});

const STATION_SUFFIX = /\s+(jn|junction|central|cantt|cant|city|terminus|town|road|rd|east|west|north|south)\.?$/i;

/** Station names are not always city names: "Lalgarh Jn" → ["Lalgarh Jn", "Lalgarh"]. Most specific first. */
export function placeCandidates(name: string): string[] {
  const out = [name.trim()];
  let current = name.trim();
  while (STATION_SUFFIX.test(current)) {
    current = current.replace(STATION_SUFFIX, '').trim();
    out.push(current);
  }
  return [...new Set(out.filter((n) => n.length >= 2))];
}

interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

/** Current conditions only: the app shows "now", so the forecast horizon is ignored. */
export class OpenWeatherProvider implements WeatherProvider {
  private readonly cache = new Map<string, { at: number; value: Promise<WeatherSnapshot[]> }>();
  private readonly placeCache = new Map<string, { at: number; value: Promise<(WeatherSnapshot & { place: string }) | null> }>();
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly apiKey: string,
    deps: Deps = {},
  ) {
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  getWeather(lat: number, lon: number, _forecastHours = 0, ctx?: CallContext): Promise<WeatherSnapshot[]> {
    const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < TTL_MS) return hit.value;
    const value = this.load(lat, lon, ctx);
    this.cache.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.cache.get(key)?.value === value) this.cache.delete(key);
    });
    return value;
  }

  getWeatherForPlace(name: string, ctx?: CallContext): Promise<(WeatherSnapshot & { place: string }) | null> {
    const key = name.trim().toLowerCase();
    const hit = this.placeCache.get(key);
    if (hit && this.now() - hit.at < TTL_MS) return hit.value;
    const value = this.loadPlace(name.trim(), ctx);
    this.placeCache.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.placeCache.get(key)?.value === value) this.placeCache.delete(key);
    });
    return value;
  }

  private async loadPlace(name: string, ctx?: CallContext): Promise<(WeatherSnapshot & { place: string }) | null> {
    for (const candidate of placeCandidates(name)) {
      const url = `${BASE}?q=${encodeURIComponent(`${candidate},IN`)}&units=metric&appid=${encodeURIComponent(this.apiKey)}`;
      const [snap] = await this.fetchWeather(url, candidate, ctx);
      if (snap) return { ...snap, place: name };
    }
    return null;
  }

  private async load(lat: number, lon: number, ctx?: CallContext): Promise<WeatherSnapshot[]> {
    const url = `${BASE}?lat=${lat}&lon=${lon}&units=metric&appid=${encodeURIComponent(this.apiKey)}`;
    return this.fetchWeather(url, undefined, ctx, lat, lon);
  }

  private async fetchWeather(url: string, place?: string, ctx?: CallContext, lat = 0, lon = 0): Promise<WeatherSnapshot[]> {
    const res = await this.fetchFn(url, { signal: ctx?.signal ? AbortSignal.any([ctx.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status === 404 && place !== undefined) return [];
    if (res.status === 429) throw new AppError('RATE_LIMITED', 'The weather provider is rate limiting requests.');
    if (res.status >= 400 && res.status < 500) throw new PermanentProviderError('The weather provider rejected the request.');
    if (!res.ok) throw new Error(`OpenWeather responded ${res.status}`);
    const parsed = currentSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new PermanentProviderError('The weather provider sent an unexpected response.', parsed.error);
    const d = parsed.data;
    return [
      {
        latitude: d.coord?.lat ?? lat,
        longitude: d.coord?.lon ?? lon,
        ...(d.visibility !== undefined && { visibilityKm: Math.round(d.visibility / 100) / 10 }),
        observedAt: new Date((d.dt ?? this.now() / 1000) * 1000).toISOString(),
        temperatureC: d.main.temp,
        ...(d.main.humidity !== undefined && { humidityPercent: d.main.humidity }),
        // OpenWeather reports metres per second.
        ...(d.wind?.speed !== undefined && { windKph: Math.round(d.wind.speed * 3.6 * 10) / 10 }),
        ...(d.weather?.[0] && { summary: d.weather[0].description }),
      },
    ];
  }
}
