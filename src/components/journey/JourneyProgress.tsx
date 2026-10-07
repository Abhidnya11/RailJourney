import type { LiveJourney } from '@shared/domain';
import { formatKm, formatPercent } from '@/lib/formatting';

/** All critical journey facts as real text, independent of the map (PRD §12). */
export function JourneyProgress({ live }: { live: LiveJourney }) {
  const { progress, currentStation, lastStation, nextStation } = live;
  const pct = progress.percentage;
  const where = currentStation
    ? `At ${currentStation.name}`
    : lastStation
      ? `Between ${lastStation.name} and ${nextStation?.name ?? 'the next station'}`
      : 'Location not available';

  return (
    <section aria-labelledby="progress-heading">
      <h2 id="progress-heading">Journey progress</h2>
      <p>{where}</p>
      {pct !== null ? (
        <progress value={pct} max={100} aria-label="Journey completion" style={{ width: '100%' }}>
          {formatPercent(pct)}
        </progress>
      ) : null}
      <p className="tabular">
        {pct !== null ? `${formatPercent(pct)} complete` : 'Progress not available'}
        {progress.distanceCoveredKm !== null && <> · {formatKm(progress.distanceCoveredKm)} covered</>}
        {progress.distanceRemainingKm !== null && <> · {formatKm(progress.distanceRemainingKm)} remaining</>}
      </p>
    </section>
  );
}
