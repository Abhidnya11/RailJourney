import { length, lineString, nearestPointOnLine } from '@turf/turf';
import type { Route } from '../../../shared/domain';
import type { LiveSnapshot } from '../../providers/types';

export interface Progress {
  percentage: number | null;
  distanceCoveredKm: number | null;
  distanceRemainingKm: number | null;
  method: 'distance' | 'geometry' | 'stations' | 'status' | 'none';
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Completion percentage. Preference order (PRD §3.4):
 *   1. covered / total distance from the provider
 *   2. position projected onto the route geometry
 *   3. station progress (last passed station / last station)
 *   4. terminal statuses (COMPLETED = 100, NOT_STARTED = 0)
 * Returns nulls — never zeros — when nothing reliable is available.
 */
export function computeProgress(route: Route, snap: LiveSnapshot): Progress {
  const total = route.distanceKm && route.distanceKm > 0 ? route.distanceKm : null;

  if (snap.status === 'COMPLETED') {
    return { percentage: 100, distanceCoveredKm: total, distanceRemainingKm: total === null ? null : 0, method: 'status' };
  }
  if (snap.status === 'NOT_STARTED') {
    return { percentage: 0, distanceCoveredKm: total === null ? null : 0, distanceRemainingKm: total, method: 'status' };
  }
  if (snap.status === 'CANCELLED') {
    return { percentage: null, distanceCoveredKm: null, distanceRemainingKm: null, method: 'none' };
  }

  if (snap.distanceCoveredKm !== null && total !== null) {
    const covered = Math.min(total, Math.max(0, snap.distanceCoveredKm));
    return {
      percentage: round1(clampPct((covered / total) * 100)),
      distanceCoveredKm: round1(covered),
      distanceRemainingKm: round1(total - covered),
      method: 'distance',
    };
  }

  const coords = route.geometry?.coordinates;
  if (snap.position && coords && coords.length >= 2) {
    const line = lineString(coords);
    const lineKm = length(line, { units: 'kilometers' });
    const near = nearestPointOnLine(line, [snap.position.longitude, snap.position.latitude], { units: 'kilometers' });
    const alongKm = near.properties.location ?? 0;
    const fraction = lineKm > 0 ? alongKm / lineKm : 0;
    return {
      percentage: round1(clampPct(fraction * 100)),
      distanceCoveredKm: total === null ? null : round1(fraction * total),
      distanceRemainingKm: total === null ? null : round1((1 - fraction) * total),
      method: 'geometry',
    };
  }

  const stations = route.stations;
  const lastIdx = stations.length - 1;
  if (lastIdx > 0 && snap.currentStationId) {
    const idx = stations.findIndex((s) => s.id === snap.currentStationId);
    if (idx >= 0) {
      return {
        percentage: round1(clampPct((idx / lastIdx) * 100)),
        distanceCoveredKm: null,
        distanceRemainingKm: null,
        method: 'stations',
      };
    }
  }

  return { percentage: null, distanceCoveredKm: null, distanceRemainingKm: null, method: 'none' };
}
