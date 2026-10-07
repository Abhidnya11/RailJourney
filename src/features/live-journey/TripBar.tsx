import type { LiveJourney } from '@shared/domain';
import { Icon } from '@/components/ui/Icon';
import { useAlertToggle } from '@/features/alerts/useEtaAlerts';
import { ShareJourneyButton } from '@/features/sharing/ShareJourneyButton';
import type { Stop } from './stops';

function place(stop: Stop | undefined): string | null {
  if (!stop) return null;
  const { name, code } = stop.station;
  return code ? `${name} (${code})` : name;
}

/** Strip above the map: which train this is, its route, and the quick actions. */
export function TripBar({ live, stops, journeyId }: { live: LiveJourney; stops: Stop[]; journeyId: string }) {
  const from = place(stops[0]);
  const to = place(stops.at(-1));
  const alerts = useAlertToggle();
  return (
    <div className="trip-bar">
      <div className="trip-bar__left">
        <div className="live-chip">
          <span className="ping-dot" aria-hidden="true" />
          <span className="type-data-md live-chip__id tabular">{live.train.number}</span>
          <span className="live-chip__sep" aria-hidden="true">
            ·
          </span>
          <span className="type-label-sm eyebrow text-muted live-chip__name" style={{ fontWeight: 600 }}>
            {live.train.name}
          </span>
        </div>
        {from && to && <span className="trip-bar__route type-body-md text-muted">{`${from} → ${to}`}</span>}
      </div>
      <div className="trip-bar__actions">
        <ShareJourneyButton journeyId={journeyId} trainName={live.train.name} />
        <button
          type="button"
          className="btn-soft type-label-md"
          aria-pressed={alerts.on}
          aria-label={alerts.on ? 'Alerts on' : 'Alerts off'}
          title={alerts.note ?? 'Notify me when the next halt\'s ETA changes by 5 minutes or more'}
          onClick={() => void alerts.toggle()}
        >
          <Icon name="notifications_active" size={16} filled={alerts.on} />
          <span className="btn-soft__label">{alerts.on ? 'Alerts On' : 'Alerts Off'}</span>
        </button>
      </div>
    </div>
  );
}
