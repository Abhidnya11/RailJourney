import { useId, useState, type ReactNode } from 'react';

export type SheetState = 'collapsed' | 'medium' | 'expanded';
const ORDER: SheetState[] = ['collapsed', 'medium', 'expanded'];
const LABEL: Record<SheetState, string> = {
  collapsed: 'Show more journey details',
  medium: 'Show full journey details',
  expanded: 'Collapse journey details',
};

/**
 * Journey sheet: a bottom sheet on mobile (collapsed / medium / expanded), a plain side panel on
 * desktop (layout CSS ignores the state there). The handle is a real button so it works with
 * keyboard and screen readers; the sheet is a non-modal region so focus is not trapped.
 */
export function BottomSheet({ children, label }: { children: ReactNode; label: string }) {
  const [state, setState] = useState<SheetState>('collapsed');
  const id = useId();
  const next = () => setState((s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length] as SheetState);

  return (
    <section className="sheet" data-state={state} aria-label={label}>
      <button
        type="button"
        className="sheet-handle"
        aria-expanded={state !== 'collapsed'}
        aria-controls={id}
        onClick={next}
      >
        <span aria-hidden="true">━━</span>
        <span className="sr-only">{LABEL[state]}</span>
      </button>
      <div id={id} className="sheet-body">
        {children}
      </div>
    </section>
  );
}
