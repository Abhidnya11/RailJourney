/** Material Symbols glyph. Decorative: pair it with visible text or an aria-label on the control. */
export function Icon({
  name,
  size = 20,
  filled = false,
  className = '',
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`icon${filled ? ' icon--filled' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
