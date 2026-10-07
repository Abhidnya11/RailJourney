import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { ErrorState, Skeleton } from '@/components/ui';
import { api } from '@/lib/api/client';
import { describeError, shouldRetry } from '@/lib/api/errors';

/** /train/:number → resolves today's journey id, then redirects to /journey/:id. */
export default function ResolveTrainPage() {
  const { number = '' } = useParams();
  const q = useQuery({
    queryKey: ['resolve-journey', number],
    queryFn: ({ signal }) => api.resolveJourney(number, signal),
    staleTime: 5 * 60_000,
    retry: shouldRetry,
  });
  if (q.data) return <Navigate to={`/journey/${q.data.journeyId}`} replace />;
  return (
    <div className="page">
      {q.isError ? (
        <ErrorState {...describeError(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <Skeleton label="Finding train" rows={2} />
      )}
    </div>
  );
}
