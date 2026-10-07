import { Icon } from '@/components/ui/Icon';
import { useRecentSearches } from '@/features/recent-searches/store';
import { usePlaceWeather } from './hooks';

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Weather at the destination of the train searched most recently. Hidden until there is one. */
export function WeatherCard() {
  const place = useRecentSearches((s) => s.items[0]?.destination);
  const weather = usePlaceWeather(place).data;
  if (!place || !weather) return null;
  const parts = [
    `${Math.round(weather.temperatureC)}°C`,
    weather.summary ? sentence(weather.summary) : null,
    weather.visibilityKm !== null ? `visibility ${weather.visibilityKm} km` : null,
  ].filter(Boolean);
  return (
    <section className="soft-card weather" aria-label={`${place} weather`}>
      <div className="weather__main">
        <div className="weather__tile">
          <Icon name="wb_cloudy" size={20} />
        </div>
        <div>
          <span className="type-label-md text-ink" style={{ fontWeight: 600 }}>
            {weather.place} Weather
          </span>
          <p className="type-body-sm text-muted" style={{ margin: 0 }}>
            {parts.join(' · ')}
          </p>
        </div>
      </div>
    </section>
  );
}
