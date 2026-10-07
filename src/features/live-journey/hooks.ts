import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { JourneyStatus, LiveJourney } from '@shared/domain';
import { computeFreshness, DEFAULT_FRESHNESS } from '@shared/freshness';
import { api } from '@/lib/api/client';
import { shouldRetry } from '@/lib/api/errors';
import { useNow } from '@/hooks/useNow';

const FALLBACK_POLL_MS = 30_000;

export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: ({ signal }) => api.config(signal),
    staleTime: Infinity,
    retry: 1,
  });
}

/**
 * Live status with config-driven polling. TanStack pauses interval polling in background tabs and
 * refetches on window focus / network recovery (when data is older than staleTime), covering the
 * PRD's hidden-tab and reconnect requirements. Manual refresh = `refetch()`.
 */
export function useLiveJourney(journeyId: string) {
  const { data: config } = useAppConfig();
  const pollMs = config?.livePollMs ?? FALLBACK_POLL_MS;
  return useQuery({
    queryKey: ['journey', journeyId, 'live'],
    queryFn: ({ signal }) => api.live(journeyId, signal),
    refetchInterval: pollMs,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
    staleTime: Math.min(10_000, pollMs / 2),
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

export function useRoute(journeyId: string) {
  return useQuery({
    queryKey: ['journey', journeyId, 'route'],
    queryFn: ({ signal }) => api.route(journeyId, signal),
    staleTime: 60 * 60_000,
    retry: shouldRetry,
  });
}

export function useUpcomingStations(journeyId: string, limit = 10) {
  const { data: config } = useAppConfig();
  return useQuery({
    queryKey: ['journey', journeyId, 'stations', limit],
    queryFn: ({ signal }) => api.stations(journeyId, limit, signal),
    refetchInterval: config?.livePollMs ?? FALLBACK_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

/** Every stop on the route (passed ones included) with live ETAs, for the trajectory and the journey summary. */
export function useJourneyStations(journeyId: string) {
  const { data: config } = useAppConfig();
  return useQuery({
    queryKey: ['journey', journeyId, 'stations', 'all'],
    queryFn: ({ signal }) => api.stations(journeyId, 100, signal, true),
    refetchInterval: config?.livePollMs ?? FALLBACK_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

/** Weather and ground elevation under the train. Changes slowly, so it refreshes far less often than live status. */
export function useEnvironment(journeyId: string) {
  return useQuery({
    queryKey: ['journey', journeyId, 'environment'],
    queryFn: ({ signal }) => api.environment(journeyId, signal),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

/** Weather and terrain at the current station, next halt and destination. Slow-changing, so refresh every 10 minutes. */
export function useConditions(journeyId: string) {
  return useQuery({
    queryKey: ['journey', journeyId, 'conditions'],
    queryFn: ({ signal }) => api.conditions(journeyId, signal),
    refetchInterval: 10 * 60_000,
    refetchIntervalInBackground: false,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });
}

/**
 * Elevation along the whole route. The first request for a train takes about 10 s (the elevation service is
 * slow), so it only runs when the Terrain view is opened. A route's terrain never changes, so keep it for hours.
 */
export function useTerrainProfile(journeyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['journey', journeyId, 'terrain'],
    queryFn: ({ signal }) => api.terrain(journeyId, signal),
    enabled,
    staleTime: 6 * 3_600_000,
    retry: false,
  });
}

const TERMINAL: JourneyStatus[] = ['COMPLETED', 'CANCELLED', 'NOT_STARTED'];

/**
 * Freshness is re-derived on the client every second from `observedAt`, so a failing refetch
 * degrades to STALE on its own instead of silently showing old data as live.
 */
export function useLiveFreshness(live: LiveJourney | undefined) {
  const { data: config } = useAppConfig();
  const now = useNow(1000);
  if (!live) return { now, freshness: undefined, status: undefined };
  const freshness = computeFreshness(live.observedAt, now, config?.freshness ?? DEFAULT_FRESHNESS);
  const status: JourneyStatus =
    freshness === 'STALE' && !TERMINAL.includes(live.status) ? 'STALE' : live.status;
  return { now, freshness, status };
}
