import type { ReactNode } from 'react';

export function Skeleton({ label = 'Loading', rows = 1 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" data-skeleton>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-skeleton-row style={{ height: 48, background: 'var(--color-surface)', margin: '8px 0', borderRadius: 8 }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div data-empty-state>
      <p>
        <strong>{title}</strong>
      </p>
      {children}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" data-error-state>
      <p>
        <strong>{title}</strong>
      </p>
      {message && <p>{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
