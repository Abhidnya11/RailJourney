import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { MemoryCache } from './cache/memory.js';
import { loadEnv, type Env } from './config/env.js';
import { MemoryShareStore, SignedShareStore, type ShareStore } from './modules/sharing/store.js';
import { FallbackElevationProvider } from './providers/elevation.js';
import { MockTrainProvider } from './providers/mock/index.js';
import { OpenMeteoElevationProvider } from './providers/openmeteo/index.js';
import { OpenTopographyProvider } from './providers/opentopography/index.js';
import { OpenWeatherProvider } from './providers/openweather/index.js';
import { RailRadarProvider } from './providers/railradar/index.js';
import type { ElevationProvider, TrainProvider } from './providers/types.js';

/**
 * Builds the API from environment variables. Used by the local server (`server/index.ts`) and by the Vercel
 * function (`api/index.ts`), so both run exactly the same app. Every secret comes from `process.env` here and
 * nowhere else.
 */
export async function createApp(env: Env = loadEnv()): Promise<FastifyInstance> {
  const onVercel = Boolean(process.env['VERCEL']);
  // Behind Vercel's proxy the real client address is in X-Forwarded-For; without this every visitor would share
  // one rate-limit bucket.
  const effective: Env = onVercel ? { ...env, TRUST_PROXY: true } : env;

  const provider: TrainProvider =
    effective.TRAIN_PROVIDER === 'railradar'
      ? new RailRadarProvider({
          baseUrl: effective.RAILRADAR_BASE_URL as string,
          apiKey: effective.RAILRADAR_API_KEY as string,
          timeoutMs: effective.PROVIDER_TIMEOUT_MS,
          maxRetries: effective.PROVIDER_MAX_RETRIES,
        })
      : new MockTrainProvider();

  // Serverless disks are read-only and short-lived, so only persist the elevation cache on a normal server.
  const topography = effective.OPENTOPOGRAPHY_API_KEY
    ? new OpenTopographyProvider(effective.OPENTOPOGRAPHY_API_KEY, onVercel ? {} : { persistPath: '.cache/opentopography.json' })
    : undefined;
  const meteo = effective.ELEVATION_FALLBACK ? new OpenMeteoElevationProvider() : undefined;
  const elevation: ElevationProvider | undefined =
    topography && meteo ? new FallbackElevationProvider(topography, meteo) : (topography ?? meteo);

  // Signed links need no storage, so they survive across serverless instances. Memory is fine for local use.
  const shares: ShareStore = effective.SHARE_SIGNING_SECRET
    ? new SignedShareStore(effective.SHARE_SIGNING_SECRET)
    : new MemoryShareStore();

  return buildApp({
    env: effective,
    provider,
    cache: new MemoryCache(),
    shares,
    weather: effective.OPENWEATHER_API_KEY ? new OpenWeatherProvider(effective.OPENWEATHER_API_KEY) : undefined,
    elevation,
  });
}
