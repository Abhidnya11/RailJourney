import { describe, expect, it } from 'vitest';
import type { Route } from '@shared/domain';
import { routeBounds, splitRoute, stationFeatures } from './index';

const route: Route = {
  id: 'r',
  geometry: { type: 'LineString', coordinates: [[77, 28], [77, 27], [77, 26]] },
  distanceKm: 200,
  stations: [
    { id: 'A', name: 'A', latitude: 28, longitude: 77, sequence: 0 },
    { id: 'C', name: 'C', latitude: 26, longitude: 77, sequence: 1 },
  ],
};

describe('splitRoute', () => {
  it('splits at the snapped train position', () => {
    const { completed, remaining } = splitRoute(route, [77.01, 27.5]);
    expect(completed?.geometry.coordinates[0]).toEqual([77, 28]);
    expect(completed?.geometry.coordinates.at(-1)?.[1]).toBeCloseTo(27.5, 1);
    expect(remaining?.geometry.coordinates.at(-1)).toEqual([77, 26]);
  });
  it('treats the whole route as remaining without a position', () => {
    const { completed, remaining } = splitRoute(route, null);
    expect(completed).toBeNull();
    expect(remaining?.geometry.coordinates).toHaveLength(3);
  });
  it('does not fabricate geometry', () => {
    expect(splitRoute({ ...route, geometry: null }, [77, 27])).toEqual({ completed: null, remaining: null });
    expect(splitRoute(undefined, null)).toEqual({ completed: null, remaining: null });
  });
});

describe('routeBounds', () => {
  it('covers the route and extra point', () => {
    expect(routeBounds(route, [78, 27])).toEqual([[77, 26], [78, 28]]);
  });
  it('falls back to stations, then to the extra point, then null', () => {
    expect(routeBounds({ ...route, geometry: null }, null)).toEqual([[77, 26], [77, 28]]);
    expect(routeBounds(undefined, [77, 20])).toEqual([[77, 20], [77, 20]]);
    expect(routeBounds(undefined, null)).toBeNull();
  });
});

describe('stationFeatures', () => {
  it('flags the current station', () => {
    const fc = stationFeatures(route, 'C');
    expect(fc.features.map((f) => f.properties?.['current'])).toEqual([false, true]);
  });
});
