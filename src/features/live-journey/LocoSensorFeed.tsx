import { useEffect, useState } from 'react';
import type { Environment } from '@shared/domain';
import { Icon } from '@/components/ui/Icon';
import { terrainLabel } from '@/lib/terrain';

/** Blue ramp from the design: oldest sample lightest, newest darkest. */
const RAMP = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'];
const MAX_SAMPLES = RAMP.length;

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Speeds seen on recent live updates, newest last. Kept in memory for as long as the page is open. */
function useSpeedHistory(observedAt: string | undefined, speedKph: number | null | undefined): number[] {
  const [samples, setSamples] = useState<number[]>([]);
  useEffect(() => {
    if (!observedAt || speedKph == null) return;
    setSamples((prev) => [...prev, speedKph].slice(-MAX_SAMPLES));
  }, [observedAt, speedKph]);
  return samples;
}

interface Props {
  environment: Environment | undefined;
  observedAt: string | undefined;
  speedKph: number | null | undefined;
}

/** Conditions under the train (OpenWeather + OpenTopography) and its recent speed. */
export function LocoSensorFeed({ environment: env, observedAt, speedKph }: Props) {
  const speeds = useSpeedHistory(observedAt, speedKph);
  const peak = Math.max(1, ...speeds);
  const average = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
  const tiles = [
    {
      icon: 'thermostat',
      label: 'Outside Temp',
      value: env?.temperatureC != null ? `${Math.round(env.temperatureC)}°C` : '—',
      note: env?.summary ? sentence(env.summary) : '',
    },
    {
      icon: 'landscape',
      label: 'Altitude',
      value: env?.elevationM != null ? `${env.elevationM} m` : '—',
      note: env?.elevationM != null ? terrainLabel(env.elevationM) : '',
    },
    {
      icon: 'water_drop',
      label: 'Humidity',
      value: env?.humidityPercent != null ? `${Math.round(env.humidityPercent)}%` : '—',
      note: '',
    },
    {
      icon: 'air',
      label: 'Wind',
      value: env?.windKph != null ? `${Math.round(env.windKph)} km/h` : '—',
      note: '',
    },
  ];

  return (
    <section className="panel" aria-labelledby="sensor-heading">
      <div className="panel__head">
        <h3 id="sensor-heading" className="panel__title type-headline-sm">
          <Icon name="sensors" size={20} />
          Route Conditions
        </h3>
        <div className="spread type-data-md text-muted" style={{ gap: 6, fontSize: 11 }}>
          <span className="dot pulse" aria-hidden="true" />
          <span>Live Link</span>
        </div>
      </div>
      <div className="sensor-grid">
        {tiles.map((t) => (
          <div key={t.label} className="card-white sensor">
            <div className="sensor__label">
              <Icon name={t.icon} size={16} />
              <span style={{ fontSize: 12 }}>{t.label}</span>
            </div>
            <span className="type-data-lg sensor__value tabular">{t.value}</span>
            <span className="sensor__note text-muted">{t.note || '\u00a0'}</span>
          </div>
        ))}
      </div>
      <div className="card-white chart-card">
        <div className="spread text-muted" style={{ fontSize: 12 }}>
          <span>Speed Trajectory (Recent Updates)</span>
          <span className="trajectory__strong">{average !== null ? `Avg ${average} km/h` : '—'}</span>
        </div>
        <div
          className="sparkline"
          role="img"
          aria-label={average !== null ? `Speed over the last ${speeds.length} updates, average ${average} km/h` : 'No speed readings yet'}
        >
          {speeds.map((v, i) => (
            <div
              key={i}
              className="sparkline__bar"
              style={{ height: `${Math.max(8, (v / peak) * 100)}%`, background: RAMP[RAMP.length - speeds.length + i] }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
