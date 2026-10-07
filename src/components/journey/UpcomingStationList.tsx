import { formatDelay, formatTime } from '@/lib/formatting';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { describeError } from '@/lib/api/errors';
import type { StationsResponse } from '@shared/domain';

export function UpcomingStationList({
  data,
  isLoading,
  error,
  onRetry,
}: {
  data: StationsResponse | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="stations-heading">
      <h2 id="stations-heading">Upcoming stations</h2>
      {isLoading && <Skeleton label="Loading stations" rows={3} />}
      {error != null && !data && <ErrorState {...describeError(error)} onRetry={onRetry} />}
      {data && data.stations.length === 0 && <EmptyState title="No upcoming stations" />}
      {data && data.stations.length > 0 && (
        <ol style={{ paddingLeft: 20 }}>
          {data.stations.map((s) => (
            <li key={s.id}>
              <strong>{s.name}</strong>{' '}
              <span className="tabular">
                {formatTime(s.eta)}
                {s.delayMinutes !== null && s.delayMinutes !== 0 && ` (${formatDelay(s.delayMinutes)})`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
