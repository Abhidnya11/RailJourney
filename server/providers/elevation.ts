import type { CallContext, ElevationProvider } from './types';

/** Bulk sampling is only retried point by point on the primary when it is a handful of points (it has a daily quota). */
const MAX_PRIMARY_FALLBACK_POINTS = 8;

/**
 * Elevation for many points, tolerating gaps. Uses the provider's batch method when it has one, otherwise asks for
 * each point separately and leaves `null` where a point fails.
 */
export async function sampleBulk(
  provider: ElevationProvider,
  coords: [number, number][],
  ctx?: CallContext,
): Promise<(number | null)[]> {
  if (provider.sampleMany) return provider.sampleMany(coords, ctx);
  const results = await Promise.allSettled(coords.map((c) => provider.sampleElevations([c], ctx)));
  return results.map((r) => (r.status === 'fulfilled' ? (r.value[0] ?? null) : null));
}

/**
 * Two elevation sources with different strengths:
 *  - `sampleElevations` (a few fixed places, e.g. stations): the primary (OpenTopography, 30 m, but a small daily
 *    quota), with the secondary filling in any points the primary cannot answer.
 *  - `sampleMany` (a whole graph, or a moving train): the secondary first, because it is keyless and takes a batch of
 *    100 in one request; the primary only steps in for a handful of points if the secondary is down.
 */
export class FallbackElevationProvider implements ElevationProvider {
  readonly bulkSource: string | undefined;

  constructor(
    private readonly primary: ElevationProvider,
    private readonly secondary: ElevationProvider,
  ) {
    this.bulkSource = secondary.bulkSource;
  }

  async sampleElevations(coords: [number, number][], ctx?: CallContext): Promise<number[]> {
    const first = await Promise.allSettled(coords.map((c) => this.primary.sampleElevations([c], ctx)));
    const values: (number | null)[] = first.map((r) => (r.status === 'fulfilled' ? (r.value[0] ?? null) : null));
    const missing = values.flatMap((v, i) => (v === null ? [i] : []));
    if (missing.length > 0) {
      const filled = await sampleBulk(this.secondary, missing.map((i) => coords[i] as [number, number]), ctx);
      missing.forEach((idx, k) => {
        values[idx] = filled[k] ?? null;
      });
    }
    if (values.some((v) => v === null)) {
      const firstError = first.find((r) => r.status === 'rejected');
      throw firstError?.status === 'rejected' ? firstError.reason : new Error('Elevation unavailable');
    }
    return values as number[];
  }

  async sampleMany(coords: [number, number][], ctx?: CallContext): Promise<(number | null)[]> {
    try {
      return await sampleBulk(this.secondary, coords, ctx);
    } catch (err) {
      if (coords.length > MAX_PRIMARY_FALLBACK_POINTS) throw err;
      return sampleBulk(this.primary, coords, ctx);
    }
  }
}
