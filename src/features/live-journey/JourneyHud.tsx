import { useId, useState } from 'react';
import type { Freshness, JourneyStatus, LiveJourney } from '@shared/domain';
import { STATUS_META } from '@/components/journey/StatusBadge';
import { Metric, MetricValue } from '@/components/ui/Metric';
import { Icon } from '@/components/ui/Icon';
import { formatAge, formatDelayShort, formatTime } from '@/lib/formatting';
import { distanceToNextKm, statusTone, type Stop, type Tone } from './stops';

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--emerald-700)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-danger)',
  neutral: 'var(--md-secondary)',
};
const DOT_COLOR: Record<Tone, string> = {
  good: 'var(--emerald-500)',
  warn: 'var(--color-warning)',
  bad: 'var(--color-danger)',
  neutral: 'var(--color-neutral)',
};
const FRESHNESS_NOTE: Partial<Record<Freshness, string>> = { AGING: 'Delayed update', STALE: 'Out of date' };

interface Props {
  live: LiveJourney;
  status: JourneyStatus;
  freshness: Freshness;
  now: Date;
  stops: Stop[];
  isRefreshing: boolean;
  refreshFailed: boolean;
  onRefresh: () => void;
}

/** Floating card over the map: train identity, status and the four key numbers. */
export function JourneyHud({ live, status, freshness, now, stops, isRefreshing, refreshFailed, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const tone = statusTone(status);
  const { train, nextStation, current } = live;
  const origin = stops[0]?.station.name;
  const destination = stops.at(-1)?.station.name;
  const toNext = distanceToNextKm(stops, live);
  const nextStop = nextStation ? stops.find((s) => s.station.id === nextStation.id) : undefined;
  const eta = formatTime(nextStation?.eta);
  const scheduled = formatTime(nextStop?.station.scheduledArrival);
  const speed = current?.speedKph;
  const showDelay = status !== 'CANCELLED' && status !== 'NOT_STARTED';
  const syncNote = refreshFailed ? 'Couldn’t refresh' : FRESHNESS_NOTE[freshness];

  return (
    <div className="hud">
      <div className="hud__card">
        <div className="hud__title-row">
          <div className="stack">
            <div className="hud__number-row">
              <span className="type-data-lg hud__number tabular">{train.number}</span>
              <span className="type-label-sm hud__tag">{train.name}</span>
            </div>
            <h1 className="type-headline-sm hud__route">{origin && destination ? `${origin} → ${destination}` : train.name}</h1>
          </div>
          <button
            type="button"
            className="tile-btn"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? 'Hide journey details' : 'Show journey details'}
            onClick={() => setOpen(!open)}
          >
            <Icon name="expand_more" size={20} className={`tile-btn__chevron${open ? ' tile-btn__chevron--open' : ''}`} />
          </button>
        </div>

        {live.status === 'CANCELLED' && (
          <p role="alert" className="hud__notice type-label-md">
            This train has been cancelled.
          </p>
        )}
        {live.status === 'NOT_STARTED' && (
          <p className="hud__notice hud__notice--info type-label-md">This train has not started its journey yet.</p>
        )}

        <div className="hud__status">
          <div className="hud__status-text">
            <span className={`dot${tone === 'good' ? ' pulse' : ''}`} style={{ background: DOT_COLOR[tone] }} aria-hidden="true" />
            {showDelay && (
              <span className="type-label-md" style={{ color: TONE_COLOR[tone], fontWeight: 600 }}>
                {formatDelayShort(live.delayMinutes)}
              </span>
            )}
            <span className="type-body-sm text-muted hud__status-label">
              {showDelay && '· '}
              {STATUS_META[status].label}
            </span>
          </div>
          <button
            type="button"
            className="hud__sync type-data-md"
            style={{ fontSize: 11 }}
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={`Refresh live data. Updated ${formatAge(live.observedAt, now)}${syncNote ? `. ${syncNote}` : ''}`}
            data-freshness={freshness}
          >
            <Icon name="sync" size={14} className={isRefreshing ? 'pulse' : ''} />
            <span className="tabular">
              {isRefreshing ? 'Refreshing…' : formatAge(live.observedAt, now)}
              {!isRefreshing && syncNote && ` · ${syncNote}`}
            </span>
          </button>
        </div>

        <div id={detailsId} className="metric-grid" hidden={!open}>
          <Metric label="Current Speed">
            <MetricValue value={speed != null ? Math.round(speed) : '—'} unit="km/h" />
          </Metric>
          <Metric label="Distance to Next">
            <MetricValue value={toNext !== null ? toNext.toFixed(1) : '—'} unit="km" />
          </Metric>
          <Metric label="Next Halt">
            <div className="metric__value">
              <span className="type-headline-sm metric__num">{nextStation?.name ?? '—'}</span>
            </div>
          </Metric>
          <Metric label="Estimated Arrival">
            <MetricValue value={eta} strike={scheduled !== '—' && eta !== '—' && scheduled !== eta ? scheduled : undefined} />
          </Metric>
        </div>
      </div>
    </div>
  );
}
