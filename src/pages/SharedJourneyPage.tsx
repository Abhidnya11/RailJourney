import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { ErrorState, Skeleton } from '@/components/ui';
import { JourneyView } from '@/features/live-journey/JourneyView';
import { api } from '@/lib/api/client';
import { describeError, shouldRetry } from '@/lib/api/errors';

/** Read-only live journey opened from a share link. */
export default function SharedJourneyPage() {
  const { shareId = '' } = useParams();
  const q = useQuery({
    queryKey: ['share', shareId],
    queryFn: ({ signal }) => api.lookupShare(shareId, signal),
    staleTime: 60_000,
    retry: shouldRetry,
  });
  if (q.data) return <JourneyView journeyId={q.data.journeyId} readOnly />;
  return (
    <div className="page">
      {q.isError ? (
        <ErrorState {...describeError(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <Skeleton label="Opening shared journey" rows={3} />
      )}
    </div>
  );
}
