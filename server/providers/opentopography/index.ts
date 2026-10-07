import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { AppError, PermanentProviderError } from '../../errors';
import type { CallContext, ElevationProvider } from '../types';

const BASE = 'https://portal.opentopography.org/API/globaldem';
/** Half-width of the sampled square, in degrees (~220 m): a few 30 m cells around the point. */
const HALF_DEGREES = 0.002;
const NODATA = -9999;
/** Ground elevation does not change and the free key allows only 50 calls a day, so keep results for a month. */
const TTL_MS = 30 * 24 * 3_600_000;
/** After the daily limit is hit, do not even ask again for this long. */
const QUOTA_BACKOFF_MS = 3_600_000;
/** The DEM download can take several seconds on a cold request; give up rather than hang the page. */
const TIMEOUT_MS = 20_000;

interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
  /** File to keep results in, so a server restart does not spend the daily quota again. */
  persistPath?: string;
}

/** Mean of the cells in an Esri ASCII grid (the `AAIGrid` output), ignoring nodata. */
export function meanElevation(grid: string): number | null {
  const values = grid
    .split('\n')
    .filter((line) => /^\s*-?\d/.test(line))
    .flatMap((line) => line.trim().split(/\s+/).map(Number))
    .filter((n) => Number.isFinite(n) && n !== NODATA);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Ground elevation from the Copernicus 30 m global DEM via OpenTopography. */
export class OpenTopographyProvider implements ElevationProvider {
  private readonly cache = new Map<string, { at: number; value: Promise<number> }>();
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly persistPath: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set when the daily quota is exhausted; no requests are sent until then. */
  private blockedUntil = 0;

  constructor(
    private readonly apiKey: string,
    deps: Deps = {},
  ) {
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
    this.persistPath = deps.persistPath;
    this.restore();
  }

  sampleElevations(coords: [number, number][], ctx?: CallContext): Promise<number[]> {
    return Promise.all(coords.map(([lon, lat]) => this.sample(lon, lat, ctx)));
  }

  private sample(lon: number, lat: number, ctx?: CallContext): Promise<number> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < TTL_MS) return hit.value;
    if (this.now() < this.blockedUntil) {
      return Promise.reject(new AppError('RATE_LIMITED', 'The elevation provider has reached its daily limit.'));
    }
    const value = this.load(lon, lat, ctx);
    this.cache.set(key, { at: this.now(), value });
    value.then(
      () => this.scheduleSave(),
      () => {
        if (this.cache.get(key)?.value === value) this.cache.delete(key);
      },
    );
    return value;
  }

  private async load(lon: number, lat: number, ctx?: CallContext): Promise<number> {
    const q = new URLSearchParams({
      demtype: 'COP30',
      south: String(lat - HALF_DEGREES),
      north: String(lat + HALF_DEGREES),
      west: String(lon - HALF_DEGREES),
      east: String(lon + HALF_DEGREES),
      outputFormat: 'AAIGrid',
      API_Key: this.apiKey,
    });
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await this.fetchFn(`${BASE}?${q}`, { signal: ctx?.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout });
    if (res.status === 429 || res.status === 401) {
      // The free key allows 50 calls per 24 h and answers 401 "API maximum rate limit reached" after that.
      const body = (await res.text().catch(() => '')).toLowerCase();
      if (res.status === 429 || body.includes('rate limit')) {
        this.blockedUntil = this.now() + QUOTA_BACKOFF_MS;
        throw new AppError('RATE_LIMITED', 'The elevation provider has reached its daily limit.');
      }
    }
    if (res.status >= 400 && res.status < 500) throw new PermanentProviderError('The elevation provider rejected the request.');
    if (!res.ok) throw new Error(`OpenTopography responded ${res.status}`);
    const mean = meanElevation(await res.text());
    if (mean === null) throw new PermanentProviderError('The elevation provider returned no data for this point.');
    return mean;
  }

  /** Load results saved by an earlier run. Failures are ignored: the cache is only an optimisation. */
  private restore(): void {
    if (!this.persistPath) return;
    try {
      const saved = JSON.parse(readFileSync(this.persistPath, 'utf8')) as Record<string, [number, number]>;
      for (const [key, [at, elevation]] of Object.entries(saved)) {
        if (this.now() - at < TTL_MS) this.cache.set(key, { at, value: Promise.resolve(elevation) });
      }
    } catch {
      /* no file yet, or unreadable */
    }
  }

  private scheduleSave(): void {
    if (!this.persistPath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.save();
    }, 1000);
    this.saveTimer.unref();
  }

  private async save(): Promise<void> {
    if (!this.persistPath) return;
    const out: Record<string, [number, number]> = {};
    for (const [key, entry] of this.cache) {
      const value = await Promise.race([entry.value, Promise.resolve(undefined)]).catch(() => undefined);
      if (typeof value === 'number') out[key] = [entry.at, Math.round(value * 10) / 10];
    }
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      writeFileSync(this.persistPath, JSON.stringify(out));
    } catch {
      /* read-only disk: carry on without persistence */
    }
  }
}
