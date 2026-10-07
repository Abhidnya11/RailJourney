import { lazy, Suspense, useMemo } from 'react';
import { STATUS_META } from '@/components/journey/StatusBadge';
import { useEtaAlerts } from '@/features/alerts/useEtaAlerts';
import { ErrorState, Skeleton } from '@/components/ui';
import { describeError } from '@/lib/api/errors';
import { useConditions, useEnvironment, useJourneyStations, useLiveFreshness, useLiveJourney, useRoute } from './hooks';
import { AlertsBanner } from './AlertsBanner';
import { JourneyHud } from './JourneyHud';
import { LocoSensorFeed } from './LocoSensorFeed';
import { NotifyEtaCard } from './NotifyEtaCard';
import { WeatherTerrainPanel } from './WeatherTerrainPanel';
import { buildStops } from './stops';
import { TrajectoryPanel } from './TrajectoryPanel';
import { TrajectoryStrip } from './TrajectoryStrip';
import { TripBar } from './TripBar';

// MapLibre is heavy: load it only when a journey is actually opened.
const JourneyMap = lazy(() => import('@/features/journey-map/JourneyMap'));

/** `readOnly` marks a shared link; nothing on this screen is editable, so it needs no special handling yet. */
export function JourneyView({ journeyId }: { journeyId: string; readOnly?: boolean }) {
  const liveQ = useLiveJourney(journeyId);
  const routeQ = useRoute(journeyId);
  const stationsQ = useJourneyStations(journeyId);
  const envQ = useEnvironment(journeyId);
  const conditionsQ = useConditions(journeyId);
  const live = liveQ.data;
  const { now, freshness, status } = useLiveFreshness(live);
  useEtaAlerts(live, journeyId);

  const stations = stationsQ.data;
  const passedIds = useMemo(() => new Set(stations?.stations.filter((s) => s.passed).map((s) => s.id)), [stations]);

  if (!live) {
    return (
      <div className="journey-state">
        {liveQ.isError ? (
          <ErrorState {...describeError(liveQ.error)} onRetry={() => void liveQ.refetch()} />
        ) : (
          <Skeleton label="Loading journey" rows={4} />
        )}
      </div>
    );
  }
  if (!freshness || !status) return null;

  const stops = buildStops(stations, live);

  return (
    <div className="journey-page container">
      <TripBar live={live} stops={stops} journeyId={journeyId} />
      <AlertsBanner alerts={live.alerts} />

      <div className="journey-stage">
        <div className="journey-stage__map">
          <Suspense fallback={<Skeleton label="Loading map" />}>
            <JourneyMap route={routeQ.data} live={live} passedIds={passedIds} statusLabel={STATUS_META[status].label} />
          </Suspense>
          <JourneyHud
            live={live}
            status={status}
            freshness={freshness}
            now={now}
            stops={stops}
            isRefreshing={liveQ.isFetching}
            refreshFailed={liveQ.isError}
            onRefresh={() => void liveQ.refetch()}
          />
        </div>
        <TrajectoryPanel live={live} stations={stations} />
      </div>

      <TrajectoryStrip live={live} stations={stations} />

      <div className="journey-grid">
        <WeatherTerrainPanel
          journeyId={journeyId}
          conditions={conditionsQ.data}
          isPending={conditionsQ.isPending}
          error={conditionsQ.error}
          onRetry={() => void conditionsQ.refetch()}
        />
        <div className="journey-aside span-5">
          <LocoSensorFeed environment={envQ.data} observedAt={live.observedAt} speedKph={live.current?.speedKph} />
          <NotifyEtaCard />
        </div>
      </div>
      {routeQ.isError && <p role="status">Route details are unavailable right now.</p>}
    </div>
  );
}
