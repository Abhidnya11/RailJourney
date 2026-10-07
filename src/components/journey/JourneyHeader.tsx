import type { JourneyStatus, LiveJourney } from '@shared/domain';
import { formatDelay, formatTime } from '@/lib/formatting';
import { StatusBadge } from './StatusBadge';

export function JourneyHeader({
  live,
  status,
  actions,
}: {
  live: LiveJourney;
  status: JourneyStatus;
  actions?: React.ReactNode;
}) {
  return (
    <header>
      <h1>
        {live.train.name} <span className="tabular">({live.train.number})</span>
      </h1>
      <p>
        <StatusBadge status={status} />
        {live.delayMinutes !== null && status !== 'CANCELLED' && <> · {formatDelay(live.delayMinutes)}</>}
      </p>
      {live.nextStation && status !== 'COMPLETED' && (
        <p>
          Next: <strong>{live.nextStation.name}</strong>
          {live.nextStation.eta && (
            <>
              {' '}
              · ETA <span className="tabular">{formatTime(live.nextStation.eta)}</span>
            </>
          )}
        </p>
      )}
      {actions}
    </header>
  );
}
