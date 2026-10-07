import { Icon } from '@/components/ui/Icon';
import type { RecentTrain } from '@/features/recent-searches/store';
import { useFavourites } from './store';

/** Star toggle. `tile` is the grey square on the live card; `plain` is the bare icon in lists. */
export function FavouriteButton({ train, variant = 'tile' }: { train: RecentTrain; variant?: 'tile' | 'plain' }) {
  const isFav = useFavourites((s) => s.items.some((x) => x.number === train.number));
  const toggle = useFavourites((s) => s.toggle);
  return (
    <button
      type="button"
      className={`fav-btn fav-btn--${variant}`}
      aria-pressed={isFav}
      aria-label={isFav ? `Remove ${train.name} from saved trains` : `Save ${train.name}`}
      onClick={() => toggle(train)}
    >
      <Icon name="star" size={18} filled={isFav} />
    </button>
  );
}
