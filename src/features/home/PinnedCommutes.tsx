import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useFavourites } from '@/features/favourites/store';
import type { RecentTrain } from '@/features/recent-searches/store';
import { nextDeparture, runDaysLabel } from '@/lib/formatting';
import { useTrainSummary } from './hooks';

const MAX_SHOWN = 3;

function PinnedCard({ train }: { train: RecentTrain }) {
  const summary = useTrainSummary(train.number).data;
  const origin = summary?.origin ?? train.origin;
  const destination = summary?.destination ?? train.destination;
  const days = runDaysLabel(summary?.runDays);
  const next = nextDeparture(summary?.departs, summary?.runDays);
  return (
    <div className="soft-card pinned">
      <div className="spread" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div>
          <span className="type-headline-sm text-ink">
            {origin && destination ? `${origin} ⇄ ${destination}` : train.name}
          </span>
          <p className="type-body-sm text-muted" style={{ margin: '2px 0 0' }}>
            <span className="tabular">{train.number}</span> {summary?.name ?? train.name}
            {summary?.type ? ` · ${summary.type}` : ''}
          </p>
        </div>
        {days && <span className="tag-daily">{days}</span>}
      </div>
      <div className="spread type-data-md text-muted" style={{ paddingTop: 4 }}>
        <span>{next ? `Next departure: ${next}` : ''}</span>
        <Link to={`/train/${train.number}`} className="cta-link type-label-sm">
          Track train
          <Icon name="arrow_forward" size={14} />
        </Link>
      </div>
    </div>
  );
}

/** Trains the user has starred, with their route, run days and next departure. */
export function PinnedCommutes() {
  const items = useFavourites((s) => s.items);
  return (
    <section aria-labelledby="pinned-heading">
      <div className="spread" style={{ marginBottom: 4 }}>
        <h2 id="pinned-heading" className="section-title type-headline-sm">
          <Icon name="bookmark" size={20} filled className="text-amber" />
          Pinned Commutes
        </h2>
        {items.length > 0 && <span className="type-label-sm text-muted">{`${items.length} saved`}</span>}
      </div>
      {items.length === 0 ? (
        <p className="soft-card type-body-md text-muted" style={{ margin: 0 }}>
          Star a train in Recent Searches to pin it here.
        </p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {items.slice(0, MAX_SHOWN).map((t) => (
            <PinnedCard key={t.number} train={t} />
          ))}
        </div>
      )}
    </section>
  );
}
