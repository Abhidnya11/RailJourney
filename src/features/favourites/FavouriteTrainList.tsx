import { Link } from 'react-router-dom';
import { useFavourites } from './store';

export function FavouriteTrainList() {
  const items = useFavourites((s) => s.items);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="fav-heading">
      <h2 id="fav-heading">Favourite trains</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((t) => (
          <li key={t.number}>
            <Link to={`/train/${t.number}`} style={{ display: 'block', minHeight: 'var(--touch-target)' }}>
              <span className="tabular">{t.number}</span> {t.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
