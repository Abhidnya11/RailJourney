import type { JourneyStatus, Route, Train } from '../../shared/domain.js';

/** Provider-normalized live observation, before progress/freshness enrichment. */
export interface LiveSnapshot {
  status: Exclude<JourneyStatus, 'STALE'>;
  /** null = the provider did not report a delay (never coerced to 0). */
  delayMinutes: number | null;
  alerts?: { type: string; message: string }[];
  position: { latitude: number; longitude: number; speedKph: number | null } | null;
  currentStationId: string | null;
  distanceCoveredKm: number | null;
  /** Per-station ETA / delay, keyed by station id. */
  stationEstimates: Record<string, { eta: string | null; delayMinutes: number | null }>;
  observedAt: string;
  source: string;
}

export interface CallContext {
  signal?: AbortSignal;
}

export interface TrainProvider {
  readonly name: string;
  searchTrains(query: string, ctx?: CallContext): Promise<Train[]>;
  getTrain(trainNumber: string, ctx?: CallContext): Promise<Train | null>;
  getRoute(trainNumber: string, ctx?: CallContext): Promise<Route>;
  getLiveSnapshot(trainNumber: string, ctx?: CallContext): Promise<LiveSnapshot>;
}

// Phase 2 enrichment interfaces; declared now so the provider boundary is stable.
export interface WeatherSnapshot {
  latitude: number;
  longitude: number;
  observedAt: string;
  temperatureC: number;
  humidityPercent?: number;
  windKph?: number;
  precipitationProbability?: number;
  /** Short sky description, e.g. "clear sky". */
  summary?: string;
  visibilityKm?: number;
}
export interface WeatherProvider {
  getWeather(lat: number, lon: number, forecastHours: number, ctx?: CallContext): Promise<WeatherSnapshot[]>;
  /** Current weather for a place name; null when the place is unknown. */
  getWeatherForPlace(name: string, ctx?: CallContext): Promise<(WeatherSnapshot & { place: string }) | null>;
}
export interface ElevationProvider {
  /** Elevation in metres for each `[lon, lat]`. Rejects if any point cannot be read. */
  sampleElevations(coords: [number, number][], ctx?: CallContext): Promise<number[]>;
  /**
   * Many points in one go, tolerant of gaps (`null` where a point could not be read). Offered by providers that
   * can answer a whole batch cheaply; the rest are sampled one point at a time.
   */
  sampleMany?(coords: [number, number][], ctx?: CallContext): Promise<(number | null)[]>;
  /** Name of the data behind `sampleMany`, for crediting it next to the graph. */
  readonly bulkSource?: string;
}
export interface NearbyFeature {
  id: string;
  category: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceFromRouteM: number;
  metadata?: Record<string, unknown>;
}
export interface PlacesProvider {
  findNearby(
    route: Route,
    categories: string[],
    radiusM: number,
    ctx?: CallContext,
  ): Promise<NearbyFeature[]>;
}
