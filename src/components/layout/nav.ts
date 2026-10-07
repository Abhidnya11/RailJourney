/** Which header tab a path belongs to. */
export function isActive(key: 'search' | 'live-journey', pathname: string): boolean {
  if (key === 'search') return pathname === '/';
  return pathname.startsWith('/journey') || pathname.startsWith('/train') || pathname.startsWith('/live');
}
