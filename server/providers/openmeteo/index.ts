import { z } from 'zod';
import { AppError, PermanentProviderError } from '../../errors';
import type { CallContext, ElevationProvider } from '../types';

const BASE = 'https://api.open-meteo.com/v1/elevation';
/** The service accepts up to 100 coordinates per request. */
const BATCH = 100;
const TIMEOUT_MS = 8_000;

const responseSchema = z.object({ elevation: z.array(z.number().nullable()) });

interface Deps {
  fetch?: typeof fetch;
}

/** Keyless elevation (Copernicus DEM) in batches of 100. Used for the terrain graph and the train's own altitude. */
export class OpenMeteoElevationProvider implements ElevationProvider {
  readonly bulkSource = 'Copernicus DEM via Open-Meteo';
  private readonly fetchFn: typeof fetch;

  constructor(deps: Deps = {}) {
    this.fetchFn = deps.fetch ?? fetch;
  }

  async sampleMany(coords: [number, number][], ctx?: CallContext): Promise<(number | null)[]> {
    const out: (number | null)[] = [];
    for (let i = 0; i < coords.length; i += BATCH) {
      out.push(...(await this.batch(coords.slice(i, i + BATCH), ctx)));
    }
    return out;
  }

  async sampleElevations(coords: [number, number][], ctx?: CallContext): Promise<number[]> {
    const values = await this.sampleMany(coords, ctx);
    if (values.some((v) => v === null)) throw new PermanentProviderError('The elevation provider had no data for a point.');
    return values as number[];
  }

  private async batch(coords: [number, number][], ctx?: CallContext): Promise<(number | null)[]> {
    if (coords.length === 0) return [];
    const q = new URLSearchParams({
      latitude: coords.map(([, lat]) => lat.toFixed(5)).join(','),
      longitude: coords.map(([lon]) => lon.toFixed(5)).join(','),
    });
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const res = await this.fetchFn(`${BASE}?${q}`, { signal: ctx?.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout });
    if (res.status === 429) throw new AppError('RATE_LIMITED', 'The elevation provider is rate limiting requests.');
    if (res.status >= 400 && res.status < 500) throw new PermanentProviderError('The elevation provider rejected the request.');
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const parsed = responseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success || parsed.data.elevation.length !== coords.length) {
      throw new PermanentProviderError('The elevation provider sent an unexpected response.', parsed.success ? undefined : parsed.error);
    }
    return parsed.data.elevation;
  }
}
