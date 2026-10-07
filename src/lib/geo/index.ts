import { bbox, lineSlice, lineString, nearestPointOnLine, point } from '@turf/turf';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Route } from '@shared/domain';

export type LngLat = [number, number];
export type Bounds = [[number, number], [number, number]];

export interface SplitRoute {
  completed: Feature<LineString> | null;
  remaining: Feature<LineString> | null;
}

/**
 * Splits the route at the train's position (snapped onto the line). With no train position, the
 * whole route is "remaining". Returns nulls when there is no geometry — we never invent one.
 */
export function splitRoute(route: Route | undefined, position: LngLat | null): SplitRoute {
  const coords = route?.geometry?.coordinates;
  if (!coords || coords.length < 2) return { completed: null, remaining: null };
  const line = lineString(coords);
  if (!position) return { completed: null, remaining: line };
  const snapped = nearestPointOnLine(line, point(position));
  const start = point(coords[0] as LngLat);
  const end = point(coords[coords.length - 1] as LngLat);
  return {
    completed: lineSlice(start, snapped, line),
    remaining: lineSlice(snapped, end, line),
  };
}

export function routeBounds(route: Route | undefined, extra: LngLat | null): Bounds | null {
  const pts: LngLat[] = [];
  route?.geometry?.coordinates.forEach((c) => pts.push(c as LngLat));
  if (pts.length === 0) route?.stations.forEach((s) => pts.push([s.longitude, s.latitude]));
  if (extra) pts.push(extra);
  if (pts.length === 0) return null;
  const [w, s, e, n] = bbox(lineString(pts.length === 1 ? [pts[0] as LngLat, pts[0] as LngLat] : pts));
  return [
    [w, s],
    [e, n],
  ];
}

export function stationFeatures(
  route: Route | undefined,
  currentStationId: string | null,
  passedIds: ReadonlySet<string> = new Set(),
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: (route?.stations ?? []).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, name: s.name, current: s.id === currentStationId, passed: passedIds.has(s.id) },
    })),
  };
}

export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

export function toFC(f: Feature<LineString> | null): FeatureCollection {
  return f ? { type: 'FeatureCollection', features: [f] } : EMPTY_FC;
}
