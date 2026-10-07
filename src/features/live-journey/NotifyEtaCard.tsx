import { Icon } from '@/components/ui/Icon';
import { Toggle } from '@/components/ui/Toggle';
import { useAlertToggle } from '@/features/alerts/useEtaAlerts';

/** Browser notification when the next halt's ETA moves by 5 minutes or more. */
export function NotifyEtaCard() {
  const { on, toggle, note } = useAlertToggle();
  return (
    <section className="panel panel--row spread" aria-label="ETA notifications">
      <div className="spread" style={{ gap: 4, justifyContent: 'flex-start' }}>
        <div className="icon-tile">
          <Icon name="notifications_active" size={18} />
        </div>
        <div className="stack" style={{ marginLeft: 4 }}>
          <span className="type-label-md text-ink" style={{ fontWeight: 600 }}>
            Notify ETA changes &gt; 5m
          </span>
          <span className="text-muted" style={{ fontSize: 11 }} role="status">
            {note ?? 'Browser notification while this page is open'}
          </span>
        </div>
      </div>
      <Toggle label="Notify ETA changes over 5 minutes" checked={on} onChange={() => void toggle()} />
    </section>
  );
}
