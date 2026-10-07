import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api/client';
import { describeError } from '@/lib/api/errors';

export function ShareJourneyButton({ journeyId, trainName }: { journeyId: string; trainName: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const share = useMutation({
    mutationFn: () => api.createShare(journeyId),
    onSuccess: async ({ url }) => {
      const absolute = new URL(url, window.location.origin).toString();
      try {
        if (navigator.share) {
          await navigator.share({ title: `${trainName} — live journey`, url: absolute });
          setMessage('Shared.');
          return;
        }
        await navigator.clipboard.writeText(absolute);
        setMessage('Link copied.');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // user dismissed the share sheet
        setFallbackUrl(absolute); // clipboard blocked: let the user copy manually
        setMessage('Copy this link:');
      }
    },
  });

  return (
    <div className="share">
      <button
        type="button"
        className="btn-soft type-label-md"
        aria-label={share.isPending ? 'Creating link' : 'Share trip'}
        onClick={() => share.mutate()}
        disabled={share.isPending}
      >
        <Icon name="share" size={16} />
        <span className="btn-soft__label">{share.isPending ? 'Creating link…' : 'Share Trip'}</span>
      </button>
      <div className="share__note type-body-sm" role="status" aria-live="polite">
        {share.isError ? describeError(share.error).message : message}
        {fallbackUrl && (
          <input readOnly value={fallbackUrl} aria-label="Shareable link" onFocus={(e) => e.currentTarget.select()} />
        )}
      </div>
    </div>
  );
}
