import { useState } from 'react';
import type { Conditions } from '@shared/domain';
import { ErrorState, Skeleton } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import { describeError } from '@/lib/api/errors';
import { terrainLabel } from '@/lib/terrain';
import { useTerrainProfile } from './hooks';
import { TerrainChart } from './TerrainChart';

type Place = Conditions['places'][number];

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Material Symbols glyph for an OpenWeather description such as "light rain" or "few clouds". */
function weatherIcon(summary: string | null | undefined): string {
  const s = (summary ?? '').toLowerCase();
  if (/thunder/.test(s)) return 'thunderstorm';
  if (/rain|drizzle|shower/.test(s)) return 'rainy';
  if (/snow|sleet/.test(s)) return 'ac_unit';
  if (/mist|fog|haze|smoke|dust|sand/.test(s)) return 'foggy';
  if (/clear/.test(s)) return 'wb_sunny';
  if (/overcast|broken|scattered/.test(s)) return 'cloud';
  return 'partly_cloudy_day';
}

function PlaceCard({ place }: { place: Place }) {
  const w = place.weather;
  return (
    <article className="card-white place" aria-label={`${place.roles.join(', ')}: ${place.name}`}>
      <span className="type-label-sm eyebrow text-muted">{place.roles.join(' · ')}</span>
      <h4 className="type-headline-sm place__name">{place.name}</h4>
      {w ? (
        <>
          <div className="place__temp">
            <Icon name={weatherIcon(w.summary)} size={28} className="text-primary" />
            <span className="type-data-lg tabular">{Math.round(w.temperatureC)}°C</span>
          </div>
          <span className="place__summary type-body-sm text-muted">{w.summary ? sentence(w.summary) : '\u00a0'}</span>
          <dl className="place__facts type-body-sm">
            <div>
              <dt>
                <Icon name="water_drop" size={14} /> Humidity
              </dt>
              <dd className="tabular">{w.humidityPercent !== null ? `${Math.round(w.humidityPercent)}%` : '—'}</dd>
            </div>
            <div>
              <dt>
                <Icon name="air" size={14} /> Wind
              </dt>
              <dd className="tabular">{w.windKph !== null ? `${Math.round(w.windKph)} km/h` : '—'}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="type-body-sm text-muted place__missing">Weather unavailable</p>
      )}
    </article>
  );
}

type View = 'weather' | 'terrain';

const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'weather', label: 'Weather', icon: 'partly_cloudy_day' },
  { id: 'terrain', label: 'Terrain', icon: 'landscape' },
];

/** Altitude at each of the three places, shown under the terrain graph. */
function PlaceElevations({ places }: { places: Place[] }) {
  return (
    <ul className="place-elevations">
      {places.map((p) => (
        <li key={p.name} className="card-white place-elevations__item">
          <span className="type-label-sm eyebrow text-muted">{p.roles.join(' · ')}</span>
          <span className="type-headline-sm place__name">{p.name}</span>
          <span className="type-body-sm text-muted">
            {p.elevationM !== null ? (
              <>
                <strong className="tabular text-ink">{p.elevationM} m</strong> · {terrainLabel(p.elevationM)}
              </>
            ) : (
              'Altitude unavailable'
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Weather (OpenWeather) at the current station, next halt and destination, or the terrain (OpenTopography)
 * along the whole route as a graph. The Weather | Terrain switch picks which one is shown.
 */
export function WeatherTerrainPanel({
  journeyId,
  conditions,
  isPending,
  error,
  onRetry,
}: {
  journeyId: string;
  conditions: Conditions | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [view, setView] = useState<View>('weather');
  // The terrain profile is slow and uses API quota, so it is only requested once the Terrain view is opened.
  const terrain = useTerrainProfile(journeyId, view === 'terrain');

  return (
    <section className="panel span-7" aria-labelledby="conditions-heading">
      <div className="panel__head">
        <h3 id="conditions-heading" className="panel__title type-headline-sm">
          <Icon name={view === 'weather' ? 'partly_cloudy_day' : 'landscape'} size={20} />
          Weather &amp; Terrain
        </h3>
        <div className="segmented type-label-md" role="group" aria-label="Show weather or terrain">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="segmented__btn" aria-pressed={view === v.id} onClick={() => setView(v.id)}>
              <Icon name={v.icon} size={16} />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'weather' && (
        <>
          {!conditions && isPending && <Skeleton label="Loading weather" rows={2} />}
          {!conditions && error != null && <ErrorState {...describeError(error)} onRetry={onRetry} />}
          {conditions && (
            <div className="conditions-grid">
              {conditions.places.map((p) => (
                <PlaceCard key={p.name} place={p} />
              ))}
            </div>
          )}
        </>
      )}

      {view === 'terrain' && (
        <>
          {terrain.isPending && (
            <div className="terrain__loading" role="status">
              <Skeleton label="Reading terrain along the route" rows={3} />
              <p className="type-body-sm text-muted">Reading the ground along the route. The first time takes about 10 seconds.</p>
            </div>
          )}
          {terrain.isError && <ErrorState {...describeError(terrain.error)} onRetry={() => void terrain.refetch()} />}
          {terrain.data && (
            <>
              <div className="card-white terrain__card">
                <TerrainChart profile={terrain.data} />
              </div>
              {conditions && <PlaceElevations places={conditions.places} />}
            </>
          )}
        </>
      )}
    </section>
  );
}
