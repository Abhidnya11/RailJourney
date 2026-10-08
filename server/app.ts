import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createShareRequestSchema, type Conditions, type Environment, type PlaceWeather, type TerrainProfile } from '../shared/domain.js';
import type { Cache } from './cache/cache.js';
import type { Env } from './config/env.js';
import { AppError } from './errors.js';
import { normalizeSearchQuery } from './modules/trains/query.js';
import { JourneyService } from './modules/journeys/service.js';
import { parseJourneyId } from './modules/journeys/journey-id.js';
import { sampleTerrain } from './modules/journeys/terrain.js';
import { sampleBulk } from './providers/elevation.js';
import type { ShareStore } from './modules/sharing/store.js';
import { withRetry } from './providers/retry.js';
import type { ElevationProvider, TrainProvider, WeatherProvider } from './providers/types.js';

export interface AppDeps {
  env: Env;
  provider: TrainProvider;
  cache: Cache;
  shares: ShareStore;
  /** Optional enrichment; when absent the matching fields are reported as null. */
  weather?: WeatherProvider;
  elevation?: ElevationProvider;
  now?: () => Date;
}

const trainNumberParam = z.string().regex(/^[0-9A-Za-z]{3,8}$/);
const stationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  includePassed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('INVALID_REQUEST', 'The request was not valid.');
  return r.data;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { env, provider, cache, shares, weather, elevation } = deps;
  const now = deps.now ?? (() => new Date());

  const app = Fastify({
    logger:
      env.LOG_LEVEL === 'silent'
        ? false
        : {
            level: env.LOG_LEVEL,
            // Never log credentials that might ride on a request.
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 10 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  const journeys = new JourneyService(
    provider,
    cache,
    {
      liveTtlSeconds: env.LIVE_CACHE_TTL_SECONDS,
      routeTtlSeconds: env.ROUTE_CACHE_TTL_SECONDS,
      freshness: { freshSeconds: env.FRESHNESS_FRESH_SECONDS, staleSeconds: env.FRESHNESS_STALE_SECONDS },
    },
    now,
  );

  const retry = { maxRetries: env.PROVIDER_MAX_RETRIES, timeoutMs: env.PROVIDER_TIMEOUT_MS };

  await app.register(helmet, { contentSecurityPolicy: false });
  const origins = env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [];
  await app.register(cors, { origin: origins.length ? origins : false });
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_DEFAULT_PER_MIN,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) =>
      new AppError('RATE_LIMITED', 'Too many requests. Please try again shortly.', Math.ceil(ctx.ttl / 1000)),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.retryAfterSeconds) void reply.header('retry-after', String(err.retryAfterSeconds));
      if (err.status >= 500) req.log.error({ err, cause: err.cause }, 'request failed');
      return reply.status(err.status).send(err.toBody());
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(new AppError('INVALID_REQUEST', 'The request was not valid.').toBody());
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(new AppError('INTERNAL', 'Something went wrong.').toBody());
  });
  app.setNotFoundHandler((_req, reply) =>
    reply.status(404).send(new AppError('NOT_FOUND', 'Not found.').toBody()),
  );

  const rl = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } });

  app.get('/api/health', async () => ({ status: 'ok', provider: provider.name }));

  // Client-safe runtime config: values only, never secrets.
  app.get('/api/config', async () => ({
    livePollMs: env.CLIENT_LIVE_POLL_MS,
    freshness: { freshSeconds: env.FRESHNESS_FRESH_SECONDS, staleSeconds: env.FRESHNESS_STALE_SECONDS },
  }));

  app.get('/api/trains/search', rl(env.RATE_LIMIT_SEARCH_PER_MIN), async (req) => {
    const { query, key } = normalizeSearchQuery((req.query as Record<string, unknown>)['q']);
    const results = await cache.getOrLoad(
      `search:${key}`,
      () => withRetry((signal) => provider.searchTrains(query, { signal }), retry),
      { ttlSeconds: env.SEARCH_CACHE_TTL_SECONDS, staleWhileRevalidateSeconds: env.SEARCH_CACHE_TTL_SECONDS },
    );
    return { results: results.slice(0, 20) };
  });

  // Full train record (type, run days, departure time) for pinned trains.
  app.get('/api/trains/:number', rl(env.RATE_LIMIT_SEARCH_PER_MIN), async (req) => {
    const number = parse(trainNumberParam, (req.params as { number: string }).number);
    const train = await withRetry((signal) => provider.getTrain(number, { signal }), retry);
    if (!train) throw new AppError('NOT_FOUND', 'Train not found.');
    return train;
  });

  // Current weather at a named place (a station), for the Home weather card.
  app.get('/api/weather', rl(env.RATE_LIMIT_SEARCH_PER_MIN), async (req): Promise<PlaceWeather> => {
    const place = parse(z.string().trim().min(2).max(60), (req.query as Record<string, unknown>)['place']);
    if (!weather) throw new AppError('PROVIDER_UNAVAILABLE', 'Weather is not configured.');
    const found = await withRetry((signal) => weather.getWeatherForPlace(place, { signal }), retry);
    if (!found) throw new AppError('NOT_FOUND', 'No weather found for that place.');
    return {
      place: found.place,
      temperatureC: Math.round(found.temperatureC * 10) / 10,
      humidityPercent: found.humidityPercent ?? null,
      visibilityKm: found.visibilityKm ?? null,
      summary: found.summary ?? null,
    };
  });

  app.get('/api/trains/:number/journey', rl(env.RATE_LIMIT_SEARCH_PER_MIN), async (req) => {
    const number = parse(trainNumberParam, (req.params as { number: string }).number);
    return withRetry(() => journeys.resolveJourney(number), retry);
  });

  app.get('/api/journeys/:id/live', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req) => {
    const id = (req.params as { id: string }).id;
    parseJourneyId(id);
    return withRetry(() => journeys.getLive(id), retry);
  });

  app.get('/api/journeys/:id/route', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req) => {
    const id = (req.params as { id: string }).id;
    parseJourneyId(id);
    return withRetry(() => journeys.getRoute(id), retry);
  });

  // Weather and elevation at the train's current position. Each provider may fail or be unconfigured
  // independently; the missing values come back as null rather than failing the whole request.
  app.get('/api/journeys/:id/environment', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req): Promise<Environment> => {
    const id = (req.params as { id: string }).id;
    parseJourneyId(id);
    const live = await withRetry(() => journeys.getLive(id), retry);
    const at = live.current;
    const result: Environment = {
      journeyId: id,
      observedAt: now().toISOString(),
      temperatureC: null,
      humidityPercent: null,
      windKph: null,
      summary: null,
      elevationM: null,
    };
    if (!at) return result;
    const [wx, el] = await Promise.allSettled([
      weather?.getWeather(at.latitude, at.longitude, 0),
      // The train moves, so every reading is a new place: use the batch source, not the quota-limited one.
      elevation ? sampleBulk(elevation, [[at.longitude, at.latitude]]) : undefined,
    ]);
    if (wx.status === 'fulfilled' && wx.value?.[0]) {
      const w = wx.value[0];
      result.temperatureC = Math.round(w.temperatureC * 10) / 10;
      result.humidityPercent = w.humidityPercent ?? null;
      result.windKph = w.windKph ?? null;
      result.summary = w.summary ?? null;
    } else if (wx.status === 'rejected') {
      req.log.warn({ err: wx.reason }, 'weather lookup failed');
    }
    if (el.status === 'fulfilled' && el.value?.[0] != null) {
      result.elevationM = Math.round(el.value[0]);
    } else if (el.status === 'rejected') {
      req.log.warn({ err: el.reason }, 'elevation lookup failed');
    }
    return result;
  });

  // Ground elevation along the whole route. Slow on a cold cache (about 11 s, all points in parallel) and the
  // result never changes for a train, so it is cached for a week.
  app.get('/api/journeys/:id/terrain', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req): Promise<TerrainProfile> => {
    const id = (req.params as { id: string }).id;
    const { trainNumber } = parseJourneyId(id);
    if (!elevation) throw new AppError('PROVIDER_UNAVAILABLE', 'Terrain data is not configured.');
    const [route, live] = await Promise.all([
      withRetry(() => journeys.getRoute(id), retry),
      withRetry(() => journeys.getLive(id), retry),
    ]);
    const week = 7 * 24 * 3600;
    const sampled = await cache.getOrLoad(`terrain:${trainNumber}`, () => sampleTerrain(route, elevation), {
      ttlSeconds: week,
      staleWhileRevalidateSeconds: week,
    });
    return { journeyId: id, trainKm: live.progress.distanceCoveredKm, ...sampled };
  });

  // Weather and terrain at the current station, the next halt and the destination.
  app.get('/api/journeys/:id/conditions', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req): Promise<Conditions> => {
    const id = (req.params as { id: string }).id;
    parseJourneyId(id);
    const [live, route] = await Promise.all([
      withRetry(() => journeys.getLive(id), retry),
      withRetry(() => journeys.getRoute(id), retry),
    ]);
    const byId = new Map(route.stations.map((s) => [s.id, s]));
    const wanted: [Conditions['places'][number]['roles'][number], (typeof route.stations)[number] | undefined][] = [
      ['Current station', byId.get(live.currentStation?.id ?? live.lastStation?.id ?? '') ?? route.stations[0]],
      ['Next halt', live.nextStation ? byId.get(live.nextStation.id) : undefined],
      ['Destination', route.stations.at(-1)],
    ];
    // One place can fill several roles (the next halt is often the destination); look it up once.
    const unique = new Map<string, { station: (typeof route.stations)[number]; roles: Conditions['places'][number]['roles'] }>();
    for (const [role, station] of wanted) {
      if (!station) continue;
      const entry = unique.get(station.id) ?? { station, roles: [] };
      entry.roles.push(role);
      unique.set(station.id, entry);
    }
    const places = await Promise.all(
      [...unique.values()].map(async ({ station, roles }) => {
        const [wx, el] = await Promise.allSettled([
          weather?.getWeather(station.latitude, station.longitude, 0),
          elevation?.sampleElevations([[station.longitude, station.latitude]]),
        ]);
        if (wx.status === 'rejected') req.log.warn({ err: wx.reason }, 'weather lookup failed');
        if (el.status === 'rejected') req.log.warn({ err: el.reason }, 'elevation lookup failed');
        const w = wx.status === 'fulfilled' ? wx.value?.[0] : undefined;
        const e = el.status === 'fulfilled' ? el.value?.[0] : undefined;
        return {
          roles,
          name: station.name,
          weather: w
            ? {
                temperatureC: Math.round(w.temperatureC * 10) / 10,
                humidityPercent: w.humidityPercent ?? null,
                windKph: w.windKph ?? null,
                summary: w.summary ?? null,
              }
            : null,
          elevationM: e !== undefined ? Math.round(e) : null,
        };
      }),
    );
    return { journeyId: id, observedAt: now().toISOString(), places };
  });

  app.get('/api/journeys/:id/stations', rl(env.RATE_LIMIT_LIVE_PER_MIN), async (req) => {
    const id = (req.params as { id: string }).id;
    parseJourneyId(id);
    const { limit, includePassed } = parse(stationsQuery, req.query);
    return withRetry(() => journeys.getStations(id, limit, includePassed), retry);
  });

  app.post('/api/shares', rl(env.RATE_LIMIT_SHARE_CREATE_PER_MIN), async (req, reply) => {
    const { journeyId } = parse(createShareRequestSchema, req.body);
    const { trainNumber } = parseJourneyId(journeyId);
    if (!(await withRetry(() => provider.getTrain(trainNumber), retry))) {
      throw new AppError('NOT_FOUND', 'Journey not found.');
    }
    const share = await shares.create(journeyId, env.SHARE_TTL_HOURS);
    const path = `/journey/share/${share.shareId}`;
    return reply.status(201).send({
      shareId: share.shareId,
      url: env.PUBLIC_BASE_URL ? new URL(path, env.PUBLIC_BASE_URL).toString() : path,
      expiresAt: share.expiresAt,
    });
  });

  app.get('/api/shares/:shareId', rl(env.RATE_LIMIT_DEFAULT_PER_MIN), async (req) => {
    const shareId = parse(z.string().regex(/^share_[A-Za-z0-9_.-]{6,300}$/), (req.params as { shareId: string }).shareId);
    const share = await shares.get(shareId);
    if (!share) throw new AppError('NOT_FOUND', 'This shared journey link has expired or does not exist.');
    return { shareId: share.shareId, journeyId: share.journeyId, expiresAt: share.expiresAt };
  });

  return app;
}
