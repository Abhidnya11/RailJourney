import type { LiveJourney } from '@shared/domain';
import { formatKm, formatPercent } from '@/lib/formatting';
import { stopStateLabel, stopTime, type Stop } from './stops';

export function trajectoryHeadline(live: LiveJourney): string {
  const pct = live.progress.percentage;
  return pct === null ? 'Progress not available' : `${formatPercent(pct)} Corridor Completed`;
}

export function kmDone(live: LiveJourney): string {
  const km = live.progress.distanceCoveredKm;
  return km === null ? '—' : `${formatKm(km)} done`;
}

export function kmLeft(live: LiveJourney): string {
  const km = live.progress.distanceRemainingKm;
  return km === null ? '—' : `${formatKm(km)} left`;
}

/** "Passed · 16:55", "In 14 km · 19:42", "Upcoming · 20:58". */
export function stopCaption(stop: Stop, toNextKm: number | null): string {
  const time = stopTime(stop);
  if (stop.state === 'current' && !stop.atStation && toNextKm !== null) return `In ${Math.round(toNextKm)} km · ${time}`;
  return `${stopStateLabel(stop)} · ${time}`;
}
