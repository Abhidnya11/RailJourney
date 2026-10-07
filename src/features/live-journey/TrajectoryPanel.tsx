import { useState } from 'react';
import type { LiveJourney, StationsResponse } from '@shared/domain';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ShowAllButton } from '@/components/ui/ShowAllButton';
import { buildStops, distanceToNextKm, stopSubtitle, windowStops, type Stop } from './stops';
import { kmDone, kmLeft, stopCaption, trajectoryHeadline } from './TrajectoryParts';

function StopRow({ stop, toNextKm }: { stop: Stop; toNextKm: number | null }) {
  const current = stop.state === 'current';
  return (
    <li className={`stop-row${current ? ' stop-row--current' : ''}`} aria-current={current ? 'step' : undefined}>
      <div className="stop-row__who">
        <span
          className={`stop-dot${stop.state === 'passed' ? ' stop-dot--passed' : ''}${current ? ' stop-dot--current pulse' : ''}`}
          aria-hidden="true"
        />
        <div className="stack">
          <span className="stop-row__name">{stop.station.name}</span>
          <span className="stop-row__sub">{stopSubtitle(stop)}</span>
        </div>
      </div>
      <span className={`type-label-sm tabular stop-caption--${stop.state}`}>{stopCaption(stop, toNextKm)}</span>
    </li>
  );
}

/** Right-hand journey trajectory card, shown beside the map from 1000px up. */
export function TrajectoryPanel({ live, stations }: { live: LiveJourney; stations: StationsResponse | undefined }) {
  const [showAll, setShowAll] = useState(false);
  const stops = buildStops(stations, live);
  const { visible, hidden } = windowStops(stops, showAll);
  const toNextKm = distanceToNextKm(stops, live);
  const pct = live.progress.percentage;
  return (
    <aside className="trajectory-panel" aria-label="Journey trajectory">
      <div className="trajectory-panel__body">
        <div className="stack" style={{ gap: 4 }}>
          <div className="spread">
            <span className="type-label-sm eyebrow text-muted" style={{ fontWeight: 700 }}>
              Journey Trajectory
            </span>
            <span className="pill pill--live">Live Track</span>
          </div>
          <h2 className="type-headline-md trajectory__headline">{trajectoryHeadline(live)}</h2>
        </div>

        <div className="trajectory__totals">
          <div className="stack">
            <span className="trajectory__small">Traversed Distance</span>
            <span className="type-data-md trajectory__strong tabular">{kmDone(live)}</span>
          </div>
          <div className="stack">
            <span className="trajectory__small">To Destination</span>
            <span className="type-data-md trajectory__strong tabular">{kmLeft(live)}</span>
          </div>
        </div>

        {pct !== null && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="spread type-body-sm text-muted">
              <span>Corridor Progress</span>
              <span className="trajectory__strong">{Math.round(pct)}%</span>
            </div>
            <ProgressBar percent={pct} label="Corridor progress" />
          </div>
        )}

        {stops.length > 0 && (
          <div className="stack" style={{ gap: 6, paddingTop: 4 }}>
            <span className="type-label-sm text-muted" style={{ textTransform: 'uppercase' }}>
              Key Stations
            </span>
            <ol className="stop-list">
              {visible.map((stop) => (
                <StopRow key={stop.station.id} stop={stop} toNextKm={toNextKm} />
              ))}
            </ol>
            <ShowAllButton total={stops.length} hidden={hidden} expanded={showAll} onToggle={() => setShowAll(!showAll)} />
          </div>
        )}
      </div>
      <div className="trajectory-panel__foot type-body-sm">Live GPS telemetry synced with train loco</div>
    </aside>
  );
}
