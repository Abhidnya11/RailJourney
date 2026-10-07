import { useEffect, useRef } from 'react';
import type { Marker } from 'maplibre-gl';
import type { LngLat } from '@/lib/geo';

const DURATION_MS = 1500;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Moves a MapLibre marker toward `target` with interpolation, driven by requestAnimationFrame
 * directly on the marker — outside React's render loop, so position updates cause no re-renders.
 * Jumps instantly under prefers-reduced-motion.
 */
export function useAnimatedMarker(marker: Marker | null, target: LngLat | null) {
  const current = useRef<LngLat | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!marker || !target) return;
    cancelAnimationFrame(raf.current);
    const from = current.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!from || reduced) {
      current.current = target;
      marker.setLngLat(target);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const k = easeInOut(t);
      const pos: LngLat = [from[0] + (target[0] - from[0]) * k, from[1] + (target[1] - from[1]) * k];
      current.current = pos;
      marker.setLngLat(pos);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [marker, target]);
}
