import type { Freshness } from './domain.js';

export interface FreshnessThresholds {
  freshSeconds: number;
  staleSeconds: number;
}

export const DEFAULT_FRESHNESS: FreshnessThresholds = { freshSeconds: 60, staleSeconds: 180 };

/** Fresh <= freshSeconds, Aging <= staleSeconds, otherwise Stale. Unparseable timestamps are Stale. */
export function computeFreshness(
  observedAt: string,
  now: Date = new Date(),
  t: FreshnessThresholds = DEFAULT_FRESHNESS,
): Freshness {
  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) return 'STALE';
  const ageSeconds = Math.max(0, (now.getTime() - observed) / 1000);
  if (ageSeconds <= t.freshSeconds) return 'FRESH';
  if (ageSeconds <= t.staleSeconds) return 'AGING';
  return 'STALE';
}
