import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import type { RecentTrain } from '@/features/recent-searches/store';

interface FavouriteState {
  items: RecentTrain[];
  toggle: (t: RecentTrain) => void;
  has: (number: string) => boolean;
}

export const useFavourites = create<FavouriteState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (t) =>
        set((s) =>
          s.items.some((x) => x.number === t.number)
            ? { items: s.items.filter((x) => x.number !== t.number) }
            : { items: [t, ...s.items] },
        ),
      has: (number) => get().items.some((x) => x.number === number),
    }),
    { name: 'favourite-trains', storage: createJSONStorage(() => safeStorage) },
  ),
);
