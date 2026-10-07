import type { ReactNode } from 'react';

/** Labelled value tile (speed, distance, next halt, ETA). */
export function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      {children}
    </div>
  );
}

export function MetricValue({ value, unit, strike }: { value: ReactNode; unit?: string; strike?: string }) {
  return (
    <div className="metric__value metric__value--start">
      <span className="type-data-lg metric__num tabular">{value}</span>
      {unit && <span className="metric__unit">{unit}</span>}
      {strike && <span className="metric__strike tabular">{strike}</span>}
    </div>
  );
}
