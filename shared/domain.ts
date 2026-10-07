import { z } from 'zod';

export const JOURNEY_STATUSES = [
  'NOT_STARTED',
  'RUNNING',
  'AT_STATION',
  'DELAYED',
  'AHEAD',
  'COMPLETED',
  'CANCELLED',
  'UNKNOWN',
  'STALE',
] as const;
export const journeyStatusSchema = z.enum(JOURNEY_STATUSES);
export type JourneyStatus = z.infer<typeof journeyStatusSchema>;

export const FRESHNESS_STATES = ['FRESH', 'AGING', 'STALE'] as const;
export const freshnessSchema = z.enum(FRESHNESS_STATES);
export type Freshness = z.infer<typeof freshnessSchema>;

export const stationSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  sequence: z.number().int().nonnegative(),
  /** Distance from route origin along the track. Absent when the provider does not supply it. */
  distanceFromStartKm: z.number().nonnegative().optional(),
  scheduledArrival: z.string().optional(),
  scheduledDeparture: z.string().optional(),
  /** Platform number, when the provider publishes one for this stop. */
  platform: z.string().optional(),
});
export type Station = z.infer<typeof stationSchema>;

export const trainSchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  /** e.g. "Superfast Express". */
  type: z.string().optional(),
  /** Days of the week the train runs, lower-case three-letter codes ("mon"…"sun"). */
  runDays: z.array(z.string()).optional(),
  /** Scheduled departure from the origin, "HH:MM" local time. */
  departs: z.string().optional(),
});
export type Train = z.infer<typeof trainSchema>;

export const trainSearchResponseSchema = z.object({ results: z.array(trainSchema) });
export type TrainSearchResponse = z.infer<typeof trainSearchResponseSchema>;

const positionTuple = z.tuple([z.number(), z.number()]);
export const routeSchema = z.object({
  id: z.string(),
  /** Null when the provider has no geometry; the client must not fabricate one. */
  geometry: z
    .object({ type: z.literal('LineString'), coordinates: z.array(positionTuple) })
    .nullable(),
  distanceKm: z.number().nonnegative().nullable(),
  stations: z.array(stationSchema),
});
export type Route = z.infer<typeof routeSchema>;

export const stationRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  eta: z.string().nullable(),
});

export const liveJourneySchema = z.object({
  journeyId: z.string(),
  train: z.object({ number: z.string(), name: z.string() }),
  status: journeyStatusSchema,
  delayMinutes: z.number().nullable(),
  current: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      stationId: z.string().nullable(),
      speedKph: z.number().nullable(),
    })
    .nullable(),
  /** Set only while the train is at a station. */
  currentStation: stationRefSchema.nullable(),
  /** Most recent station the train has passed (or is at). */
  lastStation: stationRefSchema.nullable(),
  nextStation: stationRefSchema.nullable(),
  progress: z.object({
    percentage: z.number().min(0).max(100).nullable(),
    distanceCoveredKm: z.number().nullable(),
    distanceRemainingKm: z.number().nullable(),
  }),
  /** Diversions, cancellations and reschedules the provider reports for this run. */
  alerts: z.array(z.object({ type: z.string(), message: z.string() })).default([]),
  observedAt: z.string(),
  receivedAt: z.string(),
  source: z.string(),
  freshness: freshnessSchema,
});
export type LiveJourney = z.infer<typeof liveJourneySchema>;

export const upcomingStationSchema = stationSchema.extend({
  eta: z.string().nullable(),
  delayMinutes: z.number().nullable(),
  passed: z.boolean(),
});
export const stationsResponseSchema = z.object({
  journeyId: z.string(),
  stations: z.array(upcomingStationSchema),
});
export type StationsResponse = z.infer<typeof stationsResponseSchema>;

/** Conditions where the train currently is: weather (OpenWeather) and ground elevation (OpenTopography). */
export const environmentSchema = z.object({
  journeyId: z.string(),
  observedAt: z.string(),
  temperatureC: z.number().nullable(),
  humidityPercent: z.number().nullable(),
  windKph: z.number().nullable(),
  summary: z.string().nullable(),
  elevationM: z.number().nullable(),
});
export type Environment = z.infer<typeof environmentSchema>;

/** Weather and terrain at the places that matter for a journey: where the train is, what's next, and the end. */
export const conditionsSchema = z.object({
  journeyId: z.string(),
  observedAt: z.string(),
  places: z.array(
    z.object({
      /** Why this place is listed; one place can be several things, e.g. next halt and destination. */
      roles: z.array(z.enum(['Current station', 'Next halt', 'Destination'])),
      name: z.string(),
      weather: z
        .object({
          temperatureC: z.number(),
          humidityPercent: z.number().nullable(),
          windKph: z.number().nullable(),
          summary: z.string().nullable(),
        })
        .nullable(),
      elevationM: z.number().nullable(),
    }),
  ),
});
export type Conditions = z.infer<typeof conditionsSchema>;

/** Ground elevation sampled along the route, for the terrain graph. */
export const terrainProfileSchema = z.object({
  journeyId: z.string(),
  /** Where the elevations come from, for crediting under the graph. */
  source: z.string(),
  /** Route length the km values are measured against. */
  totalKm: z.number(),
  /** How far the train has come, when known. */
  trainKm: z.number().nullable(),
  origin: z.string(),
  destination: z.string(),
  points: z.array(z.object({ km: z.number(), elevationM: z.number() })),
});
export type TerrainProfile = z.infer<typeof terrainProfileSchema>;

/** Current weather at a named place (a station), for the Home weather card. */
export const placeWeatherSchema = z.object({
  place: z.string(),
  temperatureC: z.number(),
  humidityPercent: z.number().nullable(),
  visibilityKm: z.number().nullable(),
  summary: z.string().nullable(),
});
export type PlaceWeather = z.infer<typeof placeWeatherSchema>;

export const createShareRequestSchema = z.object({ journeyId: z.string().min(1).max(128) });
export const shareResponseSchema = z.object({
  shareId: z.string(),
  url: z.string(),
  expiresAt: z.string(),
});
export type ShareResponse = z.infer<typeof shareResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'INVALID_REQUEST',
      'NOT_FOUND',
      'RATE_LIMITED',
      'PROVIDER_UNAVAILABLE',
      'PROVIDER_TIMEOUT',
      'INTERNAL',
    ]),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
