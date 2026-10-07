import type { Freshness } from '@shared/domain';
import { formatAge } from '@/lib/formatting';

const LABEL: Record<Freshness, string> = { FRESH: 'Live', AGING: 'Delayed update', STALE: 'Out of date' };
const ICON: Record<Freshness, string> = { FRESH: '●', AGING: '◐', STALE: '○' };

export function FreshnessIndicator({
  freshness,
  observedAt,
  now,
  isRefreshing,
  refreshFailed,
}: {
  freshness: Freshness;
  observedAt: string;
  now: Date;
  isRefreshing?: boolean;
  refreshFailed?: boolean;
}) {
  return (
    <p data-freshness={freshness} className="tabular">
      <span aria-hidden="true">{ICON[freshness]} </span>
      {LABEL[freshness]} · updated {formatAge(observedAt, now)}
      {isRefreshing && ' · refreshing…'}
      {refreshFailed && ' · couldn’t refresh, showing last known data'}
    </p>
  );
}
