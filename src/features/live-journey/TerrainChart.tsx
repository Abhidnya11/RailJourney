import { useId, useState, type PointerEvent } from 'react';
import type { TerrainProfile } from '@shared/domain';
import { terrainLabel } from '@/lib/terrain';

const W = 640;
const H = 240;
const PAD = { left: 46, right: 16, top: 16, bottom: 30 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const GRID_LINES = 4;

/** Elevation at `km`, interpolated between the two nearest samples. */
function elevationAt(points: TerrainProfile['points'], km: number): number {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 0;
  if (km <= first.km) return first.elevationM;
  if (km >= last.km) return last.elevationM;
  const i = points.findIndex((p) => p.km >= km);
  const a = points[i - 1] ?? first;
  const b = points[i] ?? last;
  const t = b.km === a.km ? 0 : (km - a.km) / (b.km - a.km);
  return a.elevationM + t * (b.elevationM - a.elevationM);
}

/** Round the vertical range outwards to tidy 50 m steps, and never draw a flat line. */
function yRange(points: TerrainProfile['points']): [number, number] {
  const values = points.map((p) => p.elevationM);
  let lo = Math.floor(Math.min(...values) / 50) * 50;
  let hi = Math.ceil(Math.max(...values) / 50) * 50;
  if (hi - lo < 100) hi = lo + 100;
  if (lo > 0 && lo < 50) lo = 0;
  return [lo, hi];
}

/** Elevation profile of the route: area chart with the train's position and a hover readout. */
export function TerrainChart({ profile }: { profile: TerrainProfile }) {
  const { points, totalKm, trainKm } = profile;
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const [lo, hi] = yRange(points);
  const x = (km: number) => PAD.left + (totalKm > 0 ? km / totalKm : 0) * PLOT_W;
  const y = (m: number) => PAD.top + (1 - (m - lo) / (hi - lo)) * PLOT_H;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.km).toFixed(1)},${y(p.elevationM).toFixed(1)}`).join(' ');
  const base = PAD.top + PLOT_H;
  const first = points[0];
  const last = points.at(-1);
  const area = first && last ? `${line} L${x(last.km).toFixed(1)},${base} L${x(first.km).toFixed(1)},${base} Z` : '';

  const highest = points.reduce((a, b) => (b.elevationM > a.elevationM ? b : a));
  const lowest = points.reduce((a, b) => (b.elevationM < a.elevationM ? b : a));
  const net = (last?.elevationM ?? 0) - (first?.elevationM ?? 0);

  const hovered = hover === null ? null : (points[hover] ?? null);
  const showTrain = trainKm !== null && trainKm >= 0 && trainKm <= totalKm;
  const trainElevation = showTrain ? elevationAt(points, trainKm) : 0;
  // Keep the label inside the plot when the train is near either end.
  const trainX = showTrain ? x(trainKm) : 0;
  const labelAnchor = trainX > W - 110 ? 'end' : trainX < PAD.left + 70 ? 'start' : 'middle';

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const km = ((px - PAD.left) / PLOT_W) * totalKm;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.km - km) < Math.abs((points[best]?.km ?? 0) - km)) best = i;
    });
    setHover(best);
  }

  const ticks = Array.from({ length: GRID_LINES + 1 }, (_, i) => lo + ((hi - lo) * i) / GRID_LINES);
  const kmTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * totalKm));

  return (
    <div className="terrain">
      <div className="terrain__readout type-body-sm" aria-live="off">
        {hovered ? (
          <>
            <strong className="tabular">{Math.round(hovered.km)} km</strong> · <strong className="tabular">{hovered.elevationM} m</strong>{' '}
            <span className="text-muted">{terrainLabel(hovered.elevationM)}</span>
          </>
        ) : showTrain ? (
          <>
            Train at <strong className="tabular">{Math.round(trainKm)} km</strong> · about{' '}
            <strong className="tabular">{Math.round(trainElevation)} m</strong>
          </>
        ) : (
          <span className="text-muted">Move over the graph to read the height at any point.</span>
        )}
      </div>

      <svg
        className="terrain__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Elevation profile from ${profile.origin} to ${profile.destination}. Highest ${highest.elevationM} metres near kilometre ${Math.round(highest.km)}, lowest ${lowest.elevationM} metres near kilometre ${Math.round(lowest.km)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="terrain__grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="terrain__tick">
              {Math.round(t)} m
            </text>
          </g>
        ))}
        {kmTicks.map((km, i) => (
          <text
            key={km}
            x={x(km)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === kmTicks.length - 1 ? 'end' : 'middle'}
            className="terrain__tick"
          >
            {km} km
          </text>
        ))}

        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} className="terrain__line" />

        {showTrain && (
          <g>
            <line x1={trainX} x2={trainX} y1={PAD.top} y2={base} className="terrain__train-line" />
            <circle cx={trainX} cy={y(trainElevation)} r="6" className="terrain__train-dot" />
            <text x={trainX} y={PAD.top - 4} textAnchor={labelAnchor} className="terrain__train-label">
              Train
            </text>
          </g>
        )}

        {hovered && (
          <g>
            <line x1={x(hovered.km)} x2={x(hovered.km)} y1={PAD.top} y2={base} className="terrain__hover-line" />
            <circle cx={x(hovered.km)} cy={y(hovered.elevationM)} r="4.5" className="terrain__hover-dot" />
          </g>
        )}
      </svg>

      <div className="terrain__ends type-label-sm text-muted">
        <span>{profile.origin}</span>
        <span>{profile.destination}</span>
      </div>

      <p className="terrain__source type-label-sm text-muted">Elevation: {profile.source}</p>

      <dl className="terrain__stats">
        <div className="card-white">
          <dt className="type-label-sm text-muted">Highest</dt>
          <dd className="type-headline-sm tabular">{highest.elevationM} m</dd>
          <span className="type-body-sm text-muted">near {Math.round(highest.km)} km</span>
        </div>
        <div className="card-white">
          <dt className="type-label-sm text-muted">Lowest</dt>
          <dd className="type-headline-sm tabular">{lowest.elevationM} m</dd>
          <span className="type-body-sm text-muted">near {Math.round(lowest.km)} km</span>
        </div>
        <div className="card-white">
          <dt className="type-label-sm text-muted">Start to finish</dt>
          <dd className="type-headline-sm tabular">
            {net >= 0 ? '+' : '−'}
            {Math.abs(net)} m
          </dd>
          <span className="type-body-sm text-muted">{net >= 0 ? 'higher' : 'lower'} at the end</span>
        </div>
      </dl>
    </div>
  );
}
