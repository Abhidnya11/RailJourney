import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { shouldRetry } from '@/lib/api/errors';

/** Type, run days and departure time for a train. Timetables rarely change, so cache for hours. */
export function useTrainSummary(number: string) {
  return useQuery({
    queryKey: ['train', number],
    queryFn: ({ signal }) => api.train(number, signal),
    staleTime: 6 * 3_600_000,
    retry: shouldRetry,
  });
}

/** Current weather at a place; disabled until there is one. */
export function usePlaceWeather(place: string | undefined) {
  return useQuery({
    queryKey: ['weather', place],
    queryFn: ({ signal }) => api.weather(place as string, signal),
    enabled: Boolean(place),
    staleTime: 10 * 60_000,
    retry: shouldRetry,
  });
}
