import type { JourneyStatus } from '@shared/domain';

export const STATUS_META: Record<JourneyStatus, { label: string; icon: string; color: string }> = {
  NOT_STARTED: { label: 'Not started', icon: '○', color: 'var(--color-neutral)' },
  RUNNING: { label: 'Running', icon: '▶', color: 'var(--color-success)' },
  AT_STATION: { label: 'At station', icon: '■', color: 'var(--color-interactive)' },
  DELAYED: { label: 'Delayed', icon: '⚠', color: 'var(--color-warning)' },
  AHEAD: { label: 'Running ahead', icon: '▲', color: 'var(--color-success)' },
  COMPLETED: { label: 'Completed', icon: '✓', color: 'var(--color-success)' },
  CANCELLED: { label: 'Cancelled', icon: '✕', color: 'var(--color-danger)' },
  UNKNOWN: { label: 'Status unknown', icon: '?', color: 'var(--color-neutral)' },
  STALE: { label: 'Data out of date', icon: '◌', color: 'var(--color-neutral)' },
};

/** Status is always conveyed by icon + text, never colour alone. */
export function StatusBadge({ status }: { status: JourneyStatus }) {
  const m = STATUS_META[status];
  return (
    <span data-status={status} style={{ color: m.color, fontWeight: 600 }}>
      <span aria-hidden="true">{m.icon} </span>
      {m.label}
    </span>
  );
}
