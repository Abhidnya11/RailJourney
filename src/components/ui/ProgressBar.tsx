/** Journey progress bar. Exposed as a progressbar so the percentage is available to assistive tech. */
export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const pct = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
