import { describe, expect, it } from 'vitest';
import type { Route } from '../../../shared/domain.js';
import type { LiveSnapshot } from '../../providers/types.js';
import { computeProgress } from './progress.js';

const route: Route = {
  id: 'r',
  geometry: { type: 'LineString', coordinates: [[77, 28], [77, 27], [77, 26]] },
  distanceKm: 200,
  stations: [
    { id: 'A', name: 'A', latitude: 28, longitude: 77, sequence: 0 },
    { id: 'B', name: 'B', latitude: 27, longitude: 77, sequence: 1 },
    { id: 'C', name: 'C', latitude: 26, longitude: 77, sequence: 2 },
  ],
};
const snap = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  status: 'RUNNING',
  delayMinutes: null,
  position: null,
  currentStationId: null,
  distanceCoveredKm: null,
  stationEstimates: {},
  observedAt: '2026-10-01T00:00:00Z',
  source: 'test',
  ...over,
});

describe('computeProgress', () => {
  it('prefers provider distance', () => {
    const p = computeProgress(route, snap({ distanceCoveredKm: 50 }));
    expect(p).toMatchObject({ percentage: 25, distanceCoveredKm: 50, distanceRemainingKm: 150, method: 'distance' });
  });
  it('clamps out-of-range distances', () => {
    expect(computeProgress(route, snap({ distanceCoveredKm: 999 })).percentage).toBe(100);
    expect(computeProgress(route, snap({ distanceCoveredKm: -5 })).percentage).toBe(0);
  });
  it('falls back to geometry projection', () => {
    const p = computeProgress(route, snap({ position: { latitude: 27, longitude: 77, speedKph: null } }));
    expect(p.method).toBe('geometry');
    expect(p.percentage).toBeCloseTo(50, 0);
  });
  it('falls back to station progress', () => {
    const noGeo: Route = { ...route, geometry: null, distanceKm: null };
    const p = computeProgress(noGeo, snap({ currentStationId: 'B' }));
    expect(p).toMatchObject({ percentage: 50, method: 'stations', distanceCoveredKm: null });
  });
  it('returns nulls, not zeros, when nothing is known', () => {
    expect(computeProgress({ ...route, geometry: null }, snap({ distanceCoveredKm: null }))).toMatchObject({
      percentage: null,
      method: 'none',
    });
  });
  it('handles terminal statuses', () => {
    expect(computeProgress(route, snap({ status: 'COMPLETED' })).percentage).toBe(100);
    expect(computeProgress(route, snap({ status: 'NOT_STARTED' })).percentage).toBe(0);
    expect(computeProgress(route, snap({ status: 'CANCELLED' })).percentage).toBeNull();
  });
});
