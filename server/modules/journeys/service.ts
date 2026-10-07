import type { LiveJourney, Route, Station, StationsResponse } from '../../../shared/domain';
import { computeFreshness, type FreshnessThresholds } from '../../../shared/freshness';
import type { Cache } from '../../cache/cache';
import { AppError } from '../../errors';
import type { LiveSnapshot, TrainProvider } from '../../providers/types';
import { makeJourneyId, parseJourneyId, serviceDateIST } from './journey-id';
import { computeProgress } from './progress';

export interface JourneyServiceConfig {
  liveTtlSeconds: number;
  routeTtlSeconds: number;
  freshness: FreshnessThresholds;
}

interface StampedSnapshot {
  snapshot: LiveSnapshot;
  receivedAt: string;
}

const TERMINAL: LiveSnapshot['status'][] = ['COMPLETED', 'CANCELLED', 'NOT_STARTED'];

export class JourneyService {
  constructor(
    private readonly provider: TrainProvider,
    private readonly cache: Cache,
    private readonly cfg: JourneyServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolveJourney(trainNumber: string) {
    const train = await this.provider.getTrain(trainNumber);
    if (!train) throw new AppError('NOT_FOUND', 'Train not found.');
    return { journeyId: makeJourneyId(train.number, serviceDateIST(this.now())), train };
  }

  async getRoute(journeyId: string): Promise<Route> {
    const { trainNumber } = parseJourneyId(journeyId);
    return this.cache.getOrLoad(`route:${trainNumber}`, () => this.provider.getRoute(trainNumber), {
      ttlSeconds: this.cfg.routeTtlSeconds,
      staleWhileRevalidateSeconds: this.cfg.routeTtlSeconds,
    });
  }

  private getSnapshot(trainNumber: string): Promise<StampedSnapshot> {
    return this.cache.getOrLoad(
      `live:${trainNumber}`,
      async () => ({ snapshot: await this.provider.getLiveSnapshot(trainNumber), receivedAt: this.now().toISOString() }),
      { ttlSeconds: this.cfg.liveTtlSeconds, staleWhileRevalidateSeconds: this.cfg.liveTtlSeconds },
    );
  }

  async getLive(journeyId: string): Promise<LiveJourney> {
    const { trainNumber } = parseJourneyId(journeyId);
    const [route, { snapshot, receivedAt }, train] = await Promise.all([
      this.getRoute(journeyId),
      this.getSnapshot(trainNumber),
      this.provider.getTrain(trainNumber),
    ]);
    if (!train) throw new AppError('NOT_FOUND', 'Train not found.');

    const freshness = computeFreshness(snapshot.observedAt, this.now(), this.cfg.freshness);
    const progress = computeProgress(route, snapshot);
    const status = freshness === 'STALE' && !TERMINAL.includes(snapshot.status) ? 'STALE' : snapshot.status;

    const { current, previous, next } = locate(route.stations, snapshot, progress.distanceCoveredKm);
    const ref = (st: Station | undefined) =>
      st ? { id: st.id, name: st.name, eta: snapshot.stationEstimates[st.id]?.eta ?? null } : null;

    return {
      journeyId,
      train: { number: train.number, name: train.name },
      status,
      delayMinutes: snapshot.delayMinutes,
      current: snapshot.position
        ? { ...snapshot.position, stationId: snapshot.currentStationId }
        : null,
      currentStation: ref(current),
      lastStation: ref(previous),
      nextStation: ref(next),
      progress: {
        percentage: progress.percentage,
        distanceCoveredKm: progress.distanceCoveredKm,
        distanceRemainingKm: progress.distanceRemainingKm,
      },
      alerts: snapshot.alerts ?? [],
      observedAt: snapshot.observedAt,
      receivedAt,
      source: snapshot.source,
      freshness,
    };
  }

  async getStations(journeyId: string, limit: number, includePassed: boolean): Promise<StationsResponse> {
    const { trainNumber } = parseJourneyId(journeyId);
    const [route, { snapshot }] = await Promise.all([this.getRoute(journeyId), this.getSnapshot(trainNumber)]);
    const progress = computeProgress(route, snapshot);
    const { passedIds } = locate(route.stations, snapshot, progress.distanceCoveredKm);
    const all = route.stations.map((st) => ({
      ...st,
      eta: snapshot.stationEstimates[st.id]?.eta ?? null,
      delayMinutes: snapshot.stationEstimates[st.id]?.delayMinutes ?? null,
      passed: passedIds.has(st.id),
    }));
    const stations = (includePassed ? all : all.filter((s) => !s.passed)).slice(0, limit);
    return { journeyId, stations };
  }
}

/**
 * Works out which stations are behind the train, which one it is at, and which is next.
 * Uses distance when available, otherwise the provider's current-station id; if neither is known
 * nothing is marked passed and `next` is null (we do not guess).
 */
function locate(stations: Station[], snap: LiveSnapshot, coveredKm: number | null) {
  const passedIds = new Set<string>();
  let current: Station | undefined;
  let previous: Station | undefined;
  let next: Station | undefined;

  if (snap.status === 'COMPLETED') {
    stations.forEach((s) => passedIds.add(s.id));
    const last = stations.at(-1);
    return { passedIds, current: last, previous: last, next };
  }
  if (snap.status === 'NOT_STARTED' || snap.status === 'CANCELLED') {
    return { passedIds, current, previous, next: snap.status === 'NOT_STARTED' ? stations[0] : undefined };
  }

  const atIdx = snap.currentStationId ? stations.findIndex((s) => s.id === snap.currentStationId) : -1;
  if (atIdx >= 0) {
    current = previous = stations[atIdx];
    stations.slice(0, atIdx).forEach((s) => passedIds.add(s.id));
    next = stations[atIdx + 1];
    return { passedIds, current, previous, next };
  }

  if (coveredKm !== null && stations.every((s) => s.distanceFromStartKm !== undefined)) {
    for (const s of stations) {
      if ((s.distanceFromStartKm as number) < coveredKm) passedIds.add(s.id);
      else if (!next) next = s;
    }
    previous = [...stations].reverse().find((s) => passedIds.has(s.id));
  }

  return { passedIds, current, previous, next };
}
