import type { LiveJourney } from '@shared/domain';
import { Icon } from '@/components/ui/Icon';

const label = (type: string) => {
  const t = type.replace(/[_-]+/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Diversions, cancellations and reschedules the provider reports for this run. Hidden when there are none. */
export function AlertsBanner({ alerts }: { alerts: LiveJourney['alerts'] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
      {alerts.map((a, i) => (
        <section key={`${a.type}-${i}`} className="notice" role="status" style={{ marginBottom: 0 }}>
          <div className="notice__body">
            <div className="notice__icon">
              <Icon name="warning" size={18} />
            </div>
            <div>
              <span className="type-label-md text-ink" style={{ fontWeight: 600 }}>
                {label(a.type)}
              </span>
              <p className="type-body-sm text-muted" style={{ margin: 0 }}>
                {a.message}
              </p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
