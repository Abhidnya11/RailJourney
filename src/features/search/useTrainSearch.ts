import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { shouldRetry } from '@/lib/api/errors';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export const SEARCH_DEBOUNCE_MS = 250;
export const MIN_QUERY_LENGTH = 2;

export function normalizeInput(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

export function useTrainSearch(rawInput: string) {
  const normalized = normalizeInput(rawInput);
  const debounced = useDebouncedValue(normalized, SEARCH_DEBOUNCE_MS);
  const enabled = [...debounced].length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['train-search', debounced.toLowerCase()],
    // TanStack aborts the signal when the key changes, cancelling obsolete requests.
    queryFn: ({ signal }) => api.searchTrains(debounced, signal),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
  });

  return {
    ...query,
    enabled,
    /** True while the user has typed something the debounce hasn't caught up with. */
    pendingDebounce: normalized !== debounced,
    results: enabled ? (query.data?.results ?? []) : [],
  };
}
