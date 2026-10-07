import { z } from 'zod';
import type { Route, Station, Train } from '../../../shared/domain';
import { AppError, PermanentProviderError } from '../../errors';
import type { CallContext, LiveSnapshot, TrainProvider } from '../types';

export interface RailRadarConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
}

interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * The free tier allows 1,000 requests a month, so everything is cached here on top of the service
 * layer's own cache: schedules rarely change, and route + live share one /live response.
 */
const TTL = { train: 6 * 3_600_000, route: 24 * 3_600_000, live: 15_000, search: 15 * 60_000 } as const;

// Upstream shapes (https://railradar.in/docs), parsed leniently: only fields we use are required.
const searchSchema = z.object({
  data: z.array(
    z.object({
      number: z.string(),
      name: z.string(),
      sourceName: z.string().nullish(),
      destName: z.string().nullish(),
      type: z.string().nullish(),
    }),
  ),
});

const trainSchema = z.object({
  data: z.object({
    train: z.object({
      number: z.string(),
      name: z.string(),
      type: z.string().nullish(),
      runDays: z.array(z.string()).nullish(),
      source: z.object({ name: z.string() }),
      destination: z.object({ name: z.string() }),
    }),
    route: z
      .array(
        z.object({
          sequence: z.number(),
          station: z.object({ code: z.string(), name: z.string(), lat: z.number(), lng: z.number() }),
          isHalt: z.boolean(),
          distance: z.number().nullish(),
          departure: z.string().nullish(),
          platform: z.string().nullish(),
        }),
      )
      .default([]),
  }),
});

const geometrySchema = z.object({
  data: z.object({
    geojson: z.object({
      geometry: z.object({ coordinates: z.array(z.tuple([z.number(), z.number()])) }),
    }),
  }),
});

const liveStopSchema = z.object({
  stationCode: z.string(),
  stationName: z.string(),
  isHalt: z.boolean(),
  status: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  distance: z.number().nullish(),
  scheduledArrival: z.string().nullish(),
  scheduledDeparture: z.string().nullish(),
  actualArrival: z.string().nullish(),
  actualDeparture: z.string().nullish(),
  delayArrival: z.number().nullish(),
  delayDeparture: z.number().nullish(),
  platform: z.string().nullish(),
});

const liveSchema = z.object({
  data: z.object({
    status: z.string().nullish(),
    isLive: z.boolean().nullish(),
    lastUpdatedAt: z.string().nullish(),
    delayMinutes: z.number().nullish(),
    train: z.object({ distance: z.number().nullish() }).nullish(),
    currentLocation: z
      .object({
        stationCode: z.string().nullish(),
        status: z.string().nullish(),
        isHalt: z.boolean().nullish(),
        coordinates: z.object({ lat: z.number(), lng: z.number() }).nullish(),
        distanceFromOriginKm: z.number().nullish(),
        speedKmh: z.number().nullish(),
      })
      .nullish(),
    route: z.array(liveStopSchema).default([]),
    exceptions: z.array(z.object({ type: z.string(), message: z.string().nullish() })).nullish(),
  }),
});

export type LiveData = z.infer<typeof liveSchema>['data'];
type LiveStop = z.infer<typeof liveStopSchema>;

/**
 * RailRadar names trains "Mumbai Central - New Delhi Tejas Rajdhani Express"; drop the leading
 * "origin - destination" so the name reads "Tejas Rajdhani Express". Left untouched if it doesn't fit that pattern.
 */
export function cleanTrainName(name: string, origin?: string | null, destination?: string | null): string {
  const m = name.match(/^(.+?) - (.+)$/);
  if (!m || !origin || !destination) return name;
  const [, left, rest] = m as unknown as [string, string, string];
  if (left.split(' ')[0]?.toLowerCase() !== origin.split(' ')[0]?.toLowerCase()) return name;
  const words = destination.split(' ');
  for (let n = words.length; n >= 1; n--) {
    const prefix = `${words.slice(0, n).join(' ')} `;
    if (rest.toLowerCase().startsWith(prefix.toLowerCase()) && rest.length > prefix.length) return rest.slice(prefix.length);
  }
  return name;
}

const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

/** Halting stops only: the live feed lists every signal and junction, which would bury the timetable. */
export function haltStops(data: LiveData): LiveStop[] {
  const withCoords = data.route.filter((s) => s.lat != null && s.lng != null);
  const halts = withCoords.filter((s) => s.isHalt);
  return halts.length > 0 ? halts : withCoords;
}

export function mapStatus(data: LiveData, atStation: boolean): LiveSnapshot['status'] {
  const raw = (data.status ?? '').toLowerCase();
  const delay = data.delayMinutes ?? null;
  if (/cancel/.test(raw)) return 'CANCELLED';
  if (/not.?start|schedul|yet|wait/.test(raw)) return 'NOT_STARTED';
  if (/complet|terminat|finish|reached/.test(raw)) return 'COMPLETED';
  if (/run|live|route/.test(raw) || data.isLive === true) {
    if (atStation) return 'AT_STATION';
    if (delay !== null && delay > 10) return 'DELAYED';
    if (delay !== null && delay < 0) return 'AHEAD';
    return 'RUNNING';
  }
  return 'UNKNOWN';
}

export function toSnapshot(data: LiveData): LiveSnapshot {
  const loc = data.currentLocation ?? null;
  const stops = haltStops(data);
  const standing = /arriv|at.?station|standing|halt/.test((loc?.status ?? '').toLowerCase());
  const atCode = loc?.isHalt && standing ? (loc.stationCode ?? null) : null;
  const currentStationId = atCode && stops.some((s) => s.stationCode === atCode) ? atCode : null;
  const trainDelay = data.delayMinutes ?? null;

  const stationEstimates: LiveSnapshot['stationEstimates'] = {};
  for (const s of stops) {
    const scheduled = s.scheduledArrival ?? s.scheduledDeparture ?? null;
    const actual = s.actualArrival ?? s.actualDeparture ?? null;
    const upcoming = (s.status ?? '').toLowerCase() === 'upcoming';
    const delay = s.delayArrival ?? s.delayDeparture ?? (upcoming ? trainDelay : null);
    let eta: string | null = null;
    if (actual) eta = new Date(actual).toISOString();
    else if (scheduled && delay !== null) eta = addMinutes(scheduled, delay);
    else if (scheduled && !upcoming) eta = new Date(scheduled).toISOString();
    stationEstimates[s.stationCode] = { eta, delayMinutes: delay };
  }

  const alerts = (data.exceptions ?? []).map((e) => ({ type: e.type, message: e.message ?? e.type }));

  return {
    status: mapStatus(data, currentStationId !== null),
    delayMinutes: trainDelay,
    alerts,
    position: loc?.coordinates
      ? {
          latitude: loc.coordinates.lat,
          longitude: loc.coordinates.lng,
          // The feed reports 0 for running trains it has no speed for, so 0 means "unknown", not "stopped".
          speedKph: loc.speedKmh != null && loc.speedKmh > 0 ? loc.speedKmh : null,
        }
      : null,
    currentStationId,
    distanceCoveredKm: loc?.distanceFromOriginKm ?? null,
    stationEstimates,
    observedAt: data.lastUpdatedAt ? new Date(data.lastUpdatedAt).toISOString() : new Date().toISOString(),
    source: 'railradar',
  };
}

interface Cached {
  at: number;
  value: Promise<unknown>;
}

/** RailRadar adapter. Provider-specific fields stop here; everything returned is a domain type. */
export class RailRadarProvider implements TrainProvider {
  readonly name = 'railradar';
  private readonly cache = new Map<string, Cached>();
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(
    readonly config: RailRadarConfig,
    deps: Deps = {},
  ) {
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  private request<S extends z.ZodType>(path: string, schema: S, ttlMs: number, ctx?: CallContext): Promise<z.infer<S>> {
    const hit = this.cache.get(path);
    if (hit && this.now() - hit.at < ttlMs) return hit.value as Promise<z.infer<S>>;
    const value = this.fetchJson(path, schema, ctx);
    this.cache.set(path, { at: this.now(), value });
    // Failures are not cached, so the next call retries.
    value.catch(() => {
      if (this.cache.get(path)?.value === value) this.cache.delete(path);
    });
    return value;
  }

  private async fetchJson<S extends z.ZodType>(path: string, schema: S, ctx?: CallContext): Promise<z.infer<S>> {
    const res = await this.fetchFn(`${this.config.baseUrl.replace(/\/$/, '')}${path}`, {
      headers: { accept: 'application/json', authorization: `Bearer ${this.config.apiKey}` },
      signal: ctx?.signal,
    });
    if (res.status === 404) throw new AppError('NOT_FOUND', 'Train not found.');
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new AppError(
        'RATE_LIMITED',
        'The data provider is rate limiting requests.',
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
      );
    }
    if (res.status >= 400 && res.status < 500) throw new PermanentProviderError();
    if (!res.ok) throw new Error(`RailRadar responded ${res.status}`);
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new PermanentProviderError('The data provider sent an unexpected response.', parsed.error);
    return parsed.data;
  }

  async searchTrains(query: string, ctx?: CallContext): Promise<Train[]> {
    const q = encodeURIComponent(query.trim());
    const res = await this.request(`/lookup/search/trains?q=${q}&limit=20`, searchSchema, TTL.search, ctx);
    return res.data.map((t) => ({
      id: t.number,
      number: t.number,
      name: cleanTrainName(t.name, t.sourceName, t.destName),
      origin: t.sourceName ?? undefined,
      destination: t.destName ?? undefined,
      ...(t.type && { type: t.type }),
    }));
  }

  async getTrain(trainNumber: string, ctx?: CallContext): Promise<Train | null> {
    try {
      const { data } = await this.request(`/trains/${encodeURIComponent(trainNumber)}`, trainSchema, TTL.train, ctx);
      const t = data.train;
      return {
        id: t.number,
        number: t.number,
        name: cleanTrainName(t.name, t.source.name, t.destination.name),
        origin: t.source.name,
        destination: t.destination.name,
        ...(t.type && { type: t.type }),
        ...(t.runDays && t.runDays.length > 0 && { runDays: t.runDays.map((d) => d.toLowerCase().slice(0, 3)) }),
        ...(data.route[0]?.departure && { departs: data.route[0].departure }),
      };
    } catch (err) {
      if (err instanceof AppError && err.code === 'NOT_FOUND') return null;
      throw err;
    }
  }

  private live(trainNumber: string, ctx?: CallContext) {
    return this.request(`/trains/${encodeURIComponent(trainNumber)}/live?includeCoordinates=true`, liveSchema, TTL.live, ctx);
  }

  async getRoute(trainNumber: string, ctx?: CallContext): Promise<Route> {
    const n = encodeURIComponent(trainNumber);
    const [geo, live] = await Promise.all([
      this.request(`/trains/${n}/route`, geometrySchema, TTL.route, ctx),
      this.live(trainNumber, ctx).catch(() => null),
    ]);

    let stations: Station[];
    let distanceKm: number | null;
    if (live) {
      const halts = haltStops(live.data);
      stations = halts.map((s, i) => ({
        id: s.stationCode,
        code: s.stationCode,
        name: s.stationName,
        latitude: s.lat as number,
        longitude: s.lng as number,
        sequence: i,
        ...(s.distance != null && { distanceFromStartKm: s.distance }),
        ...(s.platform && { platform: s.platform }),
        ...(s.scheduledArrival && { scheduledArrival: new Date(s.scheduledArrival).toISOString() }),
        ...(s.scheduledDeparture && { scheduledDeparture: new Date(s.scheduledDeparture).toISOString() }),
      }));
      distanceKm = live.data.train?.distance ?? stations.at(-1)?.distanceFromStartKm ?? null;
    } else {
      // Live feed unavailable (e.g. train not running today): fall back to the static timetable.
      const { data } = await this.request(`/trains/${n}`, trainSchema, TTL.train, ctx);
      const halts = data.route.filter((r) => r.isHalt);
      stations = (halts.length > 0 ? halts : data.route).map((r, i) => ({
        id: r.station.code,
        code: r.station.code,
        name: r.station.name,
        latitude: r.station.lat,
        longitude: r.station.lng,
        sequence: i,
        ...(r.distance != null && { distanceFromStartKm: r.distance }),
        ...(r.platform && { platform: r.platform }),
      }));
      distanceKm = stations.at(-1)?.distanceFromStartKm ?? null;
    }

    const coordinates = geo.data.geojson.geometry.coordinates;
    return {
      id: `route-${trainNumber}`,
      geometry: coordinates.length >= 2 ? { type: 'LineString', coordinates } : null,
      distanceKm,
      stations,
    };
  }

  async getLiveSnapshot(trainNumber: string, ctx?: CallContext): Promise<LiveSnapshot> {
    const { data } = await this.live(trainNumber, ctx);
    return toSnapshot(data);
  }
}
