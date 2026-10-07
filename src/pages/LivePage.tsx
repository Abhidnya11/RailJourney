import { Link, Navigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { useRecentSearches } from '@/features/recent-searches/store';

/** /live — the "Live Tracking" tab: opens the train searched most recently, or asks for a search first. */
export default function LivePage() {
  const latest = useRecentSearches((s) => s.items[0]);
  if (latest) return <Navigate to={`/train/${latest.number}`} replace />;
  return (
    <div className="container journey-state">
      <EmptyState title="No train selected yet">
        <p>Search for a train to follow it live.</p>
        <Link to="/">Go to search</Link>
      </EmptyState>
    </div>
  );
}
