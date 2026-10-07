import { useEffect, useRef } from 'react';
import type { LiveJourney } from '@shared/domain';
import { formatTime } from '@/lib/formatting';
import { useAlertNote, useAlertPrefs } from './store';

const THRESHOLD_MIN = 5;

/** Switch for ETA alerts. Turning it on asks the browser for notification permission first. */
export function useAlertToggle() {
  const on = useAlertPrefs((s) => s.etaAlerts);
  const setOn = useAlertPrefs((s) => s.setEtaAlerts);
  const note = useAlertNote((s) => s.note);
  const setNote = useAlertNote((s) => s.setNote);

  async function toggle() {
    if (on) {
      setOn(false);
      setNote(null);
      return;
    }
    if (typeof Notification === 'undefined') {
      setNote('This browser does not support notifications.');
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission === 'granted') {
      setOn(true);
      setNote(null);
    } else {
      setNote('Allow notifications for this site in your browser to turn alerts on.');
    }
  }
  return { on, toggle, note };
}

/** Sends a browser notification when the next halt's ETA shifts by 5 minutes or more while the page is open. */
export function useEtaAlerts(live: LiveJourney | undefined, journeyId: string) {
  const on = useAlertPrefs((s) => s.etaAlerts);
  const baseline = useRef<{ stationId: string; eta: number } | null>(null);
  const next = live?.nextStation;
  const trainName = live?.train.name;

  useEffect(() => {
    if (!next?.eta) {
      baseline.current = null;
      return;
    }
    const eta = Date.parse(next.eta);
    const base = baseline.current;
    if (!base || base.stationId !== next.id) {
      baseline.current = { stationId: next.id, eta };
      return;
    }
    const diff = Math.round((eta - base.eta) / 60_000);
    if (on && Math.abs(diff) >= THRESHOLD_MIN && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(`${trainName ?? 'Train'}: ETA ${diff > 0 ? 'later' : 'earlier'} by ${Math.abs(diff)} min`, {
        body: `${next.name} now ${formatTime(next.eta)} (was ${formatTime(new Date(base.eta).toISOString())})`,
        tag: journeyId,
      });
      baseline.current = { stationId: next.id, eta };
    }
  }, [next?.id, next?.eta, next?.name, on, trainName, journeyId]);
}
