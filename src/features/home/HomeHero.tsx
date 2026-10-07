/** Overline pill, headline and tagline above the search bar. */
export function HomeHero() {
  return (
    <>
      <div className="overline">
        <span className="ping-dot" aria-hidden="true" />
        <span className="type-label-sm eyebrow text-ink" style={{ fontWeight: 600 }}>
          Live Railway Intelligence
        </span>
        <span className="text-faint" style={{ fontSize: 10 }} aria-hidden="true">
          /
        </span>
        <span className="type-data-md" style={{ fontSize: 11, color: 'var(--md-on-surface-variant)' }}>
          RailRadar
        </span>
      </div>
      <h1 className="hero__title">Track your journey.</h1>
      <p className="hero__lead type-body-lg">
        Live train location, route progress, weather, and journey insights — all in one place.
      </p>
    </>
  );
}
