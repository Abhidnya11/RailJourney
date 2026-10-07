import type { StyleSpecification } from 'maplibre-gl';

const key = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

/** Dedicated dark basemap (PRD §5.12). Without a MapTiler key we fall back to a plain dark canvas (the design's near-black). */
export const hasTiles = Boolean(key);

export const MAP_STYLE: string | StyleSpecification = key
  ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${encodeURIComponent(key)}`
  : {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111827' } }],
    };

export const INDIA_CENTER: [number, number] = [78.9629, 22.5937];
