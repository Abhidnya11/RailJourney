import { along, length, lineString } from '@turf/turf';
import type { Route, Station, Train } from '../../../shared/domain';
import { AppError } from '../../errors';
import type { CallContext, LiveSnapshot, TrainProvider } from '../types';
import { MOCK_TRAINS, type MockTrainDef } from './data';

/** Demo loop length: the train covers its whole route in this many minutes. */
const CYCLE_MINUTES = 90;
const AT_STATION_RADIUS_KM = 3;

const toTrain = (t: MockTrainDef): Train => ({
  id: t.number,
  number: t.number,
  name: t.name,
  origin: t.stations[0]?.name,
  destination: t.stations.at(-1)?.name,
});

function buildStations(def: MockTrainDef): Station[] {
  return def.stations.map((s, i) => ({ ...s, sequence: i }));
}

/**
 * Deterministic simulator (a pure function of wall-clock time) used for development and tests.
 * Geometry is a straight polyline through stations — a stand-in, not real track.
 */
export class MockTrainProvider implements TrainProvider {
  readonly name = 'mock';

  constructor(private readonly now: () => Date = () => new Date()) {}

  async searchTrains(query: string, _ctx?: CallContext): Promise<Train[]> {
    const q = query.trim().toLowerCase();
    return MOCK_TRAINS.filter((t) => t.number.startsWith(q) || t.name.toLowerCase().includes(q)).map(toTrain);
  }

  async getTrain(trainNumber: string): Promise<Train | null> {
    const def = this.find(trainNumber);
    return def ? toTrain(def) : null;
  }

  async getRoute(trainNumber: string): Promise<Route> {
    const def = this.require(trainNumber);
    const stations = buildStations(def);
    return {
      id: `route-${def.number}`,
      geometry: { type: 'LineString', coordinates: stations.map((s) => [s.longitude, s.latitude]) },
      distanceKm: stations.at(-1)?.distanceFromStartKm ?? null,
      stations,
    };
  }

  async getLiveSnapshot(trainNumber: string): Promise<LiveSnapshot> {
    const def = this.require(trainNumber);
    const stations = buildStations(def);
    const totalKm = stations.at(-1)?.distanceFromStartKm ?? 0;
    const now = this.now();
    const source = 'mock';

    const base: LiveSnapshot = {
      status: 'UNKNOWN',
      delayMinutes: null,
      position: null,
      currentStationId: null,
      distanceCoveredKm: null,
      stationEstimates: {},
      observedAt: now.toISOString(),
      source,
    };

    if (def.scenario === 'CANCELLED') return { ...base, status: 'CANCELLED' };
    if (def.scenario === 'NOT_STARTED') {
      return { ...base, status: 'NOT_STARTED', distanceCoveredKm: 0, delayMinutes: 0 };
    }

    const cycleMs = CYCLE_MINUTES * 60_000;
    const fraction =
      def.scenario === 'COMPLETED'
        ? 1
        : (((now.getTime() % cycleMs) / cycleMs + def.phase) % 1);
    const coveredKm = fraction * totalKm;

    const delay = { ON_TIME: 0, DELAYED: 27, AHEAD: -6, STALE: 12, COMPLETED: 4, CANCELLED: 0, NOT_STARTED: 0 }[
      def.scenario
    ];
    const cycleStart = now.getTime() - fraction * cycleMs;
    const stationEstimates: LiveSnapshot['stationEstimates'] = {};
    for (const st of stations) {
      const frac = totalKm ? (st.distanceFromStartKm ?? 0) / totalKm : 0;
      const eta = new Date(cycleStart + frac * cycleMs + delay * 60_000).toISOString();
      stationEstimates[st.id] = { eta, delayMinutes: delay };
    }

    const nearStation = stations.find(
      (st) => Math.abs((st.distanceFromStartKm ?? Infinity) - coveredKm) <= AT_STATION_RADIUS_KM,
    );
    const line = lineString(stations.map((s) => [s.longitude, s.latitude]));
    const lineKm = length(line, { units: 'kilometers' });
    const pt = along(line, (coveredKm / totalKm) * lineKm, { units: 'kilometers' }).geometry.coordinates;

    // STALE scenario: the provider's last observation is 6 minutes old.
    const observedAt =
      def.scenario === 'STALE' ? new Date(now.getTime() - 6 * 60_000).toISOString() : now.toISOString();

    const status: LiveSnapshot['status'] =
      def.scenario === 'COMPLETED'
        ? 'COMPLETED'
        : nearStation
          ? 'AT_STATION'
          : delay > 10
            ? 'DELAYED'
            : delay < 0
              ? 'AHEAD'
              : 'RUNNING';

    return {
      status,
      delayMinutes: delay,
      position: {
        longitude: pt[0] as number,
        latitude: pt[1] as number,
        speedKph: status === 'AT_STATION' || status === 'COMPLETED' ? 0 : 88,
      },
      currentStationId: status === 'AT_STATION' || status === 'COMPLETED' ? (nearStation?.id ?? stations.at(-1)?.id ?? null) : null,
      distanceCoveredKm: Math.round(coveredKm * 10) / 10,
      stationEstimates,
      observedAt,
      source,
    };
  }

  private find(number: string) {
    return MOCK_TRAINS.find((t) => t.number === number);
  }
  private require(number: string) {
    const def = this.find(number);
    if (!def) throw new AppError('NOT_FOUND', 'Train not found.');
    return def;
  }
}
