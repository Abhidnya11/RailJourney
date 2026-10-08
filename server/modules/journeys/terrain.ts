import { along, length, lineString } from '@turf/turf';
import type { Route } from '../../../shared/domain.js';
import { AppError } from '../../errors.js';
import { sampleBulk } from '../../providers/elevation.js';
import type { ElevationProvider } from '../../providers/types.js';

/** Points sampled along a route. A batch-capable provider answers them all in one request. */
export const SAMPLE_COUNT = 60;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface SampledTerrain {
  source: string;
  totalKm: number;
  origin: string;
  destination: string;
  points: { km: number; elevationM: number }[];
}

/**
 * Samples ground elevation at evenly spaced points along the route line (Turf places the points).
 * Points that fail are skipped, so a flaky provider gives a coarser graph instead of none.
 */
export async function sampleTerrain(
  route: Route,
  elevation: ElevationProvider,
  count: number = SAMPLE_COUNT,
): Promise<SampledTerrain> {
  const fromGeometry = route.geometry?.coordinates ?? [];
  const coords = fromGeometry.length >= 2 ? fromGeometry : route.stations.map((s) => [s.longitude, s.latitude]);
  if (coords.length < 2) throw new AppError('PROVIDER_UNAVAILABLE', 'This route has no geometry to read terrain from.');

  const line = lineString(coords);
  const lineKm = length(line, { units: 'kilometers' });
  // Report distances in rail km when the provider has them; the line is only a proxy for the track.
  const totalKm = route.distanceKm && route.distanceKm > 0 ? route.distanceKm : lineKm;

  const samples = Array.from({ length: count }, (_, i) => {
    const fraction = i / (count - 1);
    const [lon, lat] = along(line, fraction * lineKm, { units: 'kilometers' }).geometry.coordinates as [number, number];
    return { km: round1(fraction * totalKm), lon, lat };
  });

  const values = await sampleBulk(elevation, samples.map((s) => [s.lon, s.lat] as [number, number]));
  const points = samples.flatMap((s, i) => {
    const value = values[i];
    return value === null || value === undefined ? [] : [{ km: s.km, elevationM: Math.round(value) }];
  });
  if (points.length < 2) throw new AppError('PROVIDER_UNAVAILABLE', 'Terrain could not be read for this route.');

  return {
    source: elevation.bulkSource ?? 'OpenTopography',
    totalKm: round1(totalKm),
    origin: route.stations[0]?.name ?? '',
    destination: route.stations.at(-1)?.name ?? '',
    points,
  };
}
