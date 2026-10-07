/** Toggle under a long list: "Show all 97 stops" / "Show fewer stops". Renders nothing for short lists. */
export function ShowAllButton({ total, hidden, expanded, onToggle }: { total: number; hidden: number; expanded: boolean; onToggle: () => void }) {
  if (hidden === 0 && !expanded) return null;
  return (
    <button type="button" className="show-all type-label-md" onClick={onToggle} aria-expanded={expanded}>
      {expanded ? 'Show fewer stops' : `Show all ${total} stops`}
    </button>
  );
}
