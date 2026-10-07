import { z as zod, type z } from 'zod';
import {
  apiErrorSchema,
  conditionsSchema,
  terrainProfileSchema,
  environmentSchema,
  placeWeatherSchema,
  trainSchema,
  liveJourneySchema,
  routeSchema,
  shareResponseSchema,
  stationsResponseSchema,
  trainSearchResponseSchema,
  type ApiError,
} from '@shared/domain';

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiError['error']['code'] | 'NETWORK',
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  init?: RequestInit,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiClientError('NETWORK', 'Could not reach the server.', 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, retryAfterSeconds } = parsed.data.error;
      throw new ApiClientError(code, message, res.status, retryAfterSeconds);
    }
    throw new ApiClientError('INTERNAL', 'Unexpected server response.', res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiClientError('INTERNAL', 'Unexpected server response.', res.status);
  return parsed.data;
}

const configSchema = zod.object({
  livePollMs: zod.number(),
  freshness: zod.object({ freshSeconds: zod.number(), staleSeconds: zod.number() }),
});
const resolveSchema = zod.object({
  journeyId: zod.string(),
  train: zod.object({ id: zod.string(), number: zod.string(), name: zod.string() }),
});
const shareLookupSchema = zod.object({ shareId: zod.string(), journeyId: zod.string(), expiresAt: zod.string() });

export const api = {
  config: (signal?: AbortSignal) => request(configSchema, '/api/config', { signal }),
  searchTrains: (q: string, signal?: AbortSignal) =>
    request(trainSearchResponseSchema, `/api/trains/search?q=${encodeURIComponent(q)}`, { signal }),
  resolveJourney: (trainNumber: string, signal?: AbortSignal) =>
    request(resolveSchema, `/api/trains/${encodeURIComponent(trainNumber)}/journey`, { signal }),
  live: (journeyId: string, signal?: AbortSignal) =>
    request(liveJourneySchema, `/api/journeys/${encodeURIComponent(journeyId)}/live`, { signal }),
  route: (journeyId: string, signal?: AbortSignal) =>
    request(routeSchema, `/api/journeys/${encodeURIComponent(journeyId)}/route`, { signal }),
  stations: (journeyId: string, limit: number, signal?: AbortSignal, includePassed = false) =>
    request(
      stationsResponseSchema,
      `/api/journeys/${encodeURIComponent(journeyId)}/stations?limit=${limit}&includePassed=${includePassed}`,
      { signal },
    ),
  train: (number: string, signal?: AbortSignal) =>
    request(trainSchema, `/api/trains/${encodeURIComponent(number)}`, { signal }),
  weather: (place: string, signal?: AbortSignal) =>
    request(placeWeatherSchema, `/api/weather?place=${encodeURIComponent(place)}`, { signal }),
  terrain: (journeyId: string, signal?: AbortSignal) =>
    request(terrainProfileSchema, `/api/journeys/${encodeURIComponent(journeyId)}/terrain`, { signal }),
  conditions: (journeyId: string, signal?: AbortSignal) =>
    request(conditionsSchema, `/api/journeys/${encodeURIComponent(journeyId)}/conditions`, { signal }),
  environment: (journeyId: string, signal?: AbortSignal) =>
    request(environmentSchema, `/api/journeys/${encodeURIComponent(journeyId)}/environment`, { signal }),
  createShare: (journeyId: string) =>
    request(shareResponseSchema, '/api/shares', { method: 'POST', body: JSON.stringify({ journeyId }) }),
  lookupShare: (shareId: string, signal?: AbortSignal) =>
    request(shareLookupSchema, `/api/shares/${encodeURIComponent(shareId)}`, { signal }),
};
