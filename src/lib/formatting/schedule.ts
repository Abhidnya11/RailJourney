const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const LABEL: Record<string, string> = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const IST_OFFSET_MIN = 330;

/** "Daily" when the train runs every day, otherwise the days it does ("Mon, Wed, Fri"). */
export function runDaysLabel(runDays: string[] | undefined): string | null {
  if (!runDays || runDays.length === 0) return null;
  const set = new Set(runDays.map((d) => d.toLowerCase().slice(0, 3)));
  if (DAYS.every((d) => set.has(d))) return 'Daily';
  return DAYS.filter((d) => set.has(d))
    .map((d) => LABEL[d])
    .join(', ');
}

/**
 * Next departure from the origin as "Today 17:00" / "Tomorrow 05:30" / "Thu 17:00", using India time.
 * Returns null without a departure time or run days.
 */
export function nextDeparture(departs: string | undefined, runDays: string[] | undefined, now: Date = new Date()): string | null {
  const m = departs?.match(/^(\d{1,2}):(\d{2})/);
  if (!m || !runDays || runDays.length === 0) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  const set = new Set(runDays.map((d) => d.toLowerCase().slice(0, 3)));
  // Shift to IST so "today" and the weekday match what a rider in India sees.
  const ist = new Date(now.getTime() + (IST_OFFSET_MIN + now.getTimezoneOffset()) * 60_000);
  const nowMinutes = ist.getHours() * 60 + ist.getMinutes();
  for (let offset = 0; offset < 8; offset++) {
    const day = DAYS[(ist.getDay() + offset) % 7] as string;
    if (!set.has(day)) continue;
    if (offset === 0 && minutes <= nowMinutes) continue;
    const when = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : (LABEL[day] as string);
    return `${when} ${String(m[1]).padStart(2, '0')}:${m[2]}`;
  }
  return null;
}
