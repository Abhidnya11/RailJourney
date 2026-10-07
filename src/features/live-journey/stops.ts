import type { JourneyStatus, LiveJourney, StationsResponse } from '@shared/domain';
import { formatKm, formatTime } from '@/lib/formatting';

export type UpcomingStation = StationsResponse['stations'][number];
export type StopState = 'passed' | 'current' | 'upcoming';

export interface Stop {
  station: UpcomingStation;
  state: StopState;
  /** True when the train is standing at this stop (as opposed to approaching it). */
  atStation: boolean;
  role: 'origin' | 'final' | 'via';
}

/** Ordered stops with the train's position among them, derived from live status + the stations feed. */
export function buildStops(data: StationsResponse | undefined, live: LiveJourney): Stop[] {
  const stations = data?.stations ?? [];
  const active = live.status !== 'COMPLETED' && live.status !== 'CANCELLED';
  const currentId = active ? (live.currentStation?.id ?? live.nextStation?.id ?? null) : null;
  return stations.map((station, i) => ({
    station,
    state: station.passed ? 'passed' : station.id === currentId ? 'current' : 'upcoming',
    atStation: station.id === live.currentStation?.id,
    role: i === 0 ? 'origin' : i === stations.length - 1 ? 'final' : 'via',
  }));
}

/** Kilometres from the train to its next stop, when both distances are known. */
export function distanceToNextKm(stops: Stop[], live: LiveJourney): number | null {
  const next = live.nextStation && stops.find((s) => s.station.id === live.nextStation?.id);
  const at = next?.station.distanceFromStartKm;
  const covered = live.progress.distanceCoveredKm;
  if (at === undefined || covered === null) return null;
  return Math.max(0, at - covered);
}

export function stopTime(stop: Stop): string {
  const { station } = stop;
  return formatTime(station.eta ?? station.scheduledArrival ?? station.scheduledDeparture);
}

export function stopStateLabel(stop: Stop): string {
  if (stop.state === 'passed') return 'Passed';
  if (stop.state === 'current') return stop.atStation ? 'At station' : 'Approaching';
  return 'Upcoming';
}

export function stopSubtitle(stop: Stop): string {
  if (stop.role === 'origin') return 'Origin';
  if (stop.role === 'final') return 'Final Stop';
  const km = stop.station.distanceFromStartKm;
  return km === undefined ? '' : formatKm(km);
}

const WINDOW_BEFORE = 2;
const WINDOW_SIZE = 10;

/**
 * Long routes have 80-100 halts. Show a window around the train (two behind, the rest ahead) unless the
 * user asks for everything. `hidden` is how many stops are not shown.
 */
export function windowStops(stops: Stop[], showAll: boolean): { visible: Stop[]; hidden: number } {
  if (showAll || stops.length <= WINDOW_SIZE + WINDOW_BEFORE) return { visible: stops, hidden: 0 };
  const focus = stops.findIndex((s) => s.state === 'current');
  const anchor = focus >= 0 ? focus : Math.max(0, stops.findIndex((s) => s.state === 'upcoming'));
  const start = Math.min(Math.max(0, anchor - WINDOW_BEFORE), stops.length - WINDOW_SIZE);
  const visible = stops.slice(start, start + WINDOW_SIZE);
  return { visible, hidden: stops.length - visible.length };
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

/** The design shows running trains in green; the existing warning/danger/neutral colours cover the rest. */
export function statusTone(status: JourneyStatus): Tone {
  switch (status) {
    case 'RUNNING':
    case 'AT_STATION':
    case 'AHEAD':
    case 'COMPLETED':
      return 'good';
    case 'DELAYED':
      return 'warn';
    case 'CANCELLED':
      return 'bad';
    default:
      return 'neutral';
  }
}
