import { buildApp } from './app';
import { MemoryCache } from './cache/memory';
import { loadEnv } from './config/env';
import { MemoryShareStore } from './modules/sharing/store';
import { MockTrainProvider } from './providers/mock';
import { FallbackElevationProvider } from './providers/elevation';
import { OpenMeteoElevationProvider } from './providers/openmeteo';
import { OpenTopographyProvider } from './providers/opentopography';
import { OpenWeatherProvider } from './providers/openweather';
import { RailRadarProvider } from './providers/railradar';
import type { ElevationProvider, TrainProvider } from './providers/types';

// Node does not auto-load .env; do it for local development.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file — rely on the real environment */
}

const env = loadEnv();
const provider: TrainProvider =
  env.TRAIN_PROVIDER === 'railradar'
    ? new RailRadarProvider({
        baseUrl: env.RAILRADAR_BASE_URL as string,
        apiKey: env.RAILRADAR_API_KEY as string,
        timeoutMs: env.PROVIDER_TIMEOUT_MS,
        maxRetries: env.PROVIDER_MAX_RETRIES,
      })
    : new MockTrainProvider();

const topography = env.OPENTOPOGRAPHY_API_KEY
  ? new OpenTopographyProvider(env.OPENTOPOGRAPHY_API_KEY, { persistPath: '.cache/opentopography.json' })
  : undefined;
const meteo = env.ELEVATION_FALLBACK ? new OpenMeteoElevationProvider() : undefined;
const elevation: ElevationProvider | undefined =
  topography && meteo ? new FallbackElevationProvider(topography, meteo) : (topography ?? meteo);

const app = await buildApp({
  env,
  provider,
  cache: new MemoryCache(),
  shares: new MemoryShareStore(),
  weather: env.OPENWEATHER_API_KEY ? new OpenWeatherProvider(env.OPENWEATHER_API_KEY) : undefined,
  elevation,
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void app.close().then(() => process.exit(0)));
}
