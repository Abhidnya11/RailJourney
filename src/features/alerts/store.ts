import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

interface AlertPrefs {
  /** Notify when the next halt's ETA moves by 5 minutes or more. */
  etaAlerts: boolean;
  setEtaAlerts: (on: boolean) => void;
}

/** Why alerts could not be switched on (permission denied / unsupported); shared by every alert control. */
export const useAlertNote = create<{ note: string | null; setNote: (n: string | null) => void }>()((set) => ({
  note: null,
  setNote: (note) => set({ note }),
}));

export const useAlertPrefs = create<AlertPrefs>()(
  persist((set) => ({ etaAlerts: false, setEtaAlerts: (etaAlerts) => set({ etaAlerts }) }), {
    name: 'alert-prefs',
    storage: createJSONStorage(() => safeStorage),
  }),
);
