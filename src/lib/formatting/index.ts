export { nextDeparture, runDaysLabel } from './schedule';

const TZ = 'Asia/Kolkata';

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d);
}

/** "8 min late", "6 min early", "On time", or "Unknown" when the provider gave no delay. */
export function formatDelay(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'Delay unknown';
  if (minutes === 0) return 'On time';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const span = h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
  return minutes > 0 ? `${span} late` : `${span} early`;
}

/** Compact delay for tiles and chips: "8m delay", "6m early", "On time". */
export function formatDelayShort(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'Delay unknown';
  if (minutes === 0) return 'On time';
  const abs = Math.abs(minutes);
  const span = abs >= 60 ? `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ''}` : `${abs}m`;
  return minutes > 0 ? `${span} delay` : `${span} early`;
}

export function formatAge(iso: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (Number.isNaN(s)) return 'unknown';
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—';
  return `${Math.round(km).toLocaleString('en-IN')} km`;
}

export function formatPercent(p: number | null | undefined): string {
  return p === null || p === undefined ? '—' : `${Math.round(p)}%`;
}
