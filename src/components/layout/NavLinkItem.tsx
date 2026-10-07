import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Routed link when the destination exists; otherwise an inert anchor so the layout matches the design. */
export function NavLinkItem({ to, active, children }: { to?: string; active: boolean; children: ReactNode }) {
  const current = active ? ('page' as const) : undefined;
  if (to) {
    return (
      <Link to={to} aria-current={current}>
        {children}
      </Link>
    );
  }
  return (
    <a href="#" aria-current={current} aria-disabled={active ? undefined : true} onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  );
}
