import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';

export interface RecentTrain {
  number: string;
  name: string;
  origin?: string;
  destination?: string;
}

export const MAX_RECENT = 8;

interface RecentState {
  items: RecentTrain[];
  add: (t: RecentTrain) => void;
  clear: () => void;
}

/** Most-recent-first, deduplicated by train number, capped. Stores only public train metadata. */
export const useRecentSearches = create<RecentState>()(
  persist(
    (set) => ({
      items: [],
      add: (t) =>
        set((s) => ({
          items: [t, ...s.items.filter((x) => x.number !== t.number)].slice(0, MAX_RECENT),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'recent-searches', storage: createJSONStorage(() => safeStorage) },
  ),
);
