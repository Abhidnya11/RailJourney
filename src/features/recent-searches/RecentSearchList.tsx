import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { FavouriteButton } from '@/features/favourites/FavouriteButton';
import { useRecentSearches } from './store';

/** Recently opened trains, newest first, with a star to save one. */
export function RecentSearchList() {
  const { items, clear } = useRecentSearches();
  return (
    <section className="soft-card recent" aria-labelledby="recent-heading">
      <div className="spread recent__head">
        <h2 id="recent-heading" className="section-title type-headline-sm">
          <Icon name="history" size={20} className="text-primary" />
          Recent Searches
        </h2>
        {items.length > 0 && (
          <button type="button" className="link-quiet type-label-sm" onClick={clear}>
            Clear History
          </button>
        )}
      </div>
      {items.length === 0 && (
        <p className="recent__empty type-body-md text-muted">Trains you search for will appear here.</p>
      )}
      <ul className="recent__list">
        {items.map((t) => (
          <li key={t.number} className="recent__card">
            <div className="recent__main">
              <div className="recent__icon">
                <Icon name="train" size={18} />
              </div>
              <div className="recent__text">
                <Link to={`/train/${t.number}`} className="recent__title" title={`${t.number} ${t.name}`}>
                  <span className="tabular">{t.number}</span> {t.name}
                </Link>
                {t.origin && t.destination && (
                  <p className="recent__route text-muted">
                    {t.origin} to {t.destination}
                  </p>
                )}
              </div>
            </div>
            <div className="recent__actions">
              <FavouriteButton train={t} variant="plain" />
              <Link to={`/train/${t.number}`} className="recent__open" aria-label={`Open ${t.name}`}>
                <Icon name="chevron_right" size={18} />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
