import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { NavLinkItem } from './NavLinkItem';
import { isActive } from './nav';

/** Floating pill header: brand and the two top-level tabs. */
export function AppHeader() {
  const { pathname } = useLocation();
  return (
    <header className="app-header">
      <div className="app-header__pill">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Icon name="train" size={18} />
          </span>
          <span className="type-headline-sm brand__name">RailJourney</span>
        </Link>
        <nav className="tab-nav type-label-md" aria-label="Primary">
          <NavLinkItem to="/" active={isActive('search', pathname)}>
            Search
          </NavLinkItem>
          <NavLinkItem to={isActive('live-journey', pathname) ? pathname : '/live'} active={isActive('live-journey', pathname)}>
            Live Tracking
          </NavLinkItem>
        </nav>
      </div>
    </header>
  );
}
