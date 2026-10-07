import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
const boolDefaultTrue = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');
const int = (def: number) => z.coerce.number().int().positive().default(def);
// .env.example ships empty values (`KEY=`); treat them as unset.
const optionalStr = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: int(8787),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    CORS_ORIGINS: optionalStr,
    TRUST_PROXY: bool,
    PUBLIC_BASE_URL: optionalStr,

    TRAIN_PROVIDER: z.enum(['mock', 'railradar']).default('mock'),
    RAILRADAR_BASE_URL: optionalStr,
    RAILRADAR_API_KEY: optionalStr,
    OPENWEATHER_API_KEY: optionalStr,
    OPENTOPOGRAPHY_API_KEY: optionalStr,
    // OpenTopography's free key allows 50 calls a day. When true, Open-Meteo (keyless) serves the terrain graph and
    // the train's altitude, and fills in if OpenTopography is out of quota. Set false to use OpenTopography only.
    ELEVATION_FALLBACK: boolDefaultTrue,
    OVERPASS_URL: z.string().default('https://overpass-api.de/api/interpreter'),
    PROVIDER_TIMEOUT_MS: int(8000),
    PROVIDER_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),

    LIVE_CACHE_TTL_SECONDS: int(20),
    SEARCH_CACHE_TTL_SECONDS: int(900),
    ROUTE_CACHE_TTL_SECONDS: int(86400),
    FRESHNESS_FRESH_SECONDS: int(60),
    FRESHNESS_STALE_SECONDS: int(180),
    CLIENT_LIVE_POLL_MS: int(30000),
    SHARE_TTL_HOURS: int(48),

    RATE_LIMIT_SEARCH_PER_MIN: int(60),
    RATE_LIMIT_LIVE_PER_MIN: int(120),
    RATE_LIMIT_SHARE_CREATE_PER_MIN: int(20),
    RATE_LIMIT_DEFAULT_PER_MIN: int(300),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.TRAIN_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['TRAIN_PROVIDER'],
        message: 'TRAIN_PROVIDER=mock is not allowed in production',
      });
    }
    if (env.TRAIN_PROVIDER === 'railradar' && (!env.RAILRADAR_BASE_URL || !env.RAILRADAR_API_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RAILRADAR_API_KEY'],
        message: 'RAILRADAR_BASE_URL and RAILRADAR_API_KEY are required when TRAIN_PROVIDER=railradar',
      });
    }
    if (env.FRESHNESS_FRESH_SECONDS >= env.FRESHNESS_STALE_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['FRESHNESS_STALE_SECONDS'],
        message: 'FRESHNESS_STALE_SECONDS must be greater than FRESHNESS_FRESH_SECONDS',
      });
    }
  });

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
