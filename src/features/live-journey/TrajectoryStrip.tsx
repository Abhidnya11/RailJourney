import type { LiveJourney, StationsResponse } from '@shared/domain';
import { formatPercent } from '@/lib/formatting';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { buildStops, stopStateLabel, stopTime } from './stops';
import { kmDone, kmLeft } from './TrajectoryParts';

/** Compact journey summary shown under the map below 1000px (the side panel covers wider screens). */
export function TrajectoryStrip({ live, stations }: { live: LiveJourney; stations: StationsResponse | undefined }) {
  const stops = buildStops(stations, live);
  const focus = stops.find((s) => s.state === 'current');
  const pct = live.progress.percentage;
  return (
    <section className="trajectory-strip" aria-label="Journey trajectory">
      <div className="spread">
        <span className="type-label-sm eyebrow text-muted" style={{ fontWeight: 700 }}>
          Journey Trajectory
        </span>
        <span className="type-data-md trajectory__strong tabular">
          {pct === null ? 'Progress not available' : `${formatPercent(pct)} Completed`}
        </span>
      </div>
      {pct !== null && <ProgressBar percent={pct} label="Journey completion" />}
      <div className="trajectory-strip__foot type-body-sm">
        <span>{kmDone(live)}</span>
        {focus && (
          <span className="trajectory__strong" style={{ fontWeight: 600, textAlign: 'center' }}>
            {`${stopStateLabel(focus)} ${focus.station.name} (${stopTime(focus)})`}
          </span>
        )}
        <span>{kmLeft(live)}</span>
      </div>
    </section>
  );
}
