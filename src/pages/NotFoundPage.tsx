import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState title="Page not found">
        <Link to="/">Search for a train</Link>
      </EmptyState>
    </div>
  );
}
