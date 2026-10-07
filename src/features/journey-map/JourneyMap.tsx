import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Map as MapLibreMapCtor, Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LiveJourney, Route } from '@shared/domain';
import { EMPTY_FC, routeBounds, splitRoute, stationFeatures, toFC, type LngLat } from '@/lib/geo';
import { MapControls } from './MapControls';
import { hasTiles, INDIA_CENTER, MAP_STYLE } from './mapStyle';
import { useAnimatedMarker } from './useAnimatedMarker';

interface Props {
  route: Route | undefined;
  live: LiveJourney | undefined;
  /** Stops the train has already passed, so they can be drawn differently from upcoming ones. */
  passedIds?: ReadonlySet<string>;
  /** Short status text shown in the tag beside the train. */
  statusLabel?: string;
}

const NO_PASSED: ReadonlySet<string> = new Set();

const MARKER_ARROW =
  '<svg class="train-marker__arrow" viewBox="-4 -5 9 10" aria-hidden="true"><path d="M -3,-4 L 4,0 L -3,4 Z" fill="#fff"/></svg>';

const SRC = { completed: 'route-completed', remaining: 'route-remaining', stations: 'stations' } as const;
/** Only recentre in follow mode when the train leaves the middle 60% of the viewport. */
const SAFE_BOX = 0.3;

function addLayers(map: MapLibreMap) {
  for (const id of Object.values(SRC)) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC });
  }
  const add = (layer: Parameters<MapLibreMap['addLayer']>[0]) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };
  add({
    id: 'route-remaining',
    type: 'line',
    source: SRC.remaining,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-opacity': 0.25, 'line-dasharray': [1.7, 2.3] },
  });
  add({
    id: 'route-glow',
    type: 'line',
    source: SRC.completed,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 7, 'line-blur': 6, 'line-opacity': 0.8 },
  });
  add({
    id: 'route-completed',
    type: 'line',
    source: SRC.completed,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#93c5fd', 'line-width': 3 },
  });
  add({
    id: 'stations',
    type: 'circle',
    source: SRC.stations,
    paint: {
      'circle-radius': ['case', ['get', 'current'], 6, 4.5],
      'circle-color': ['case', ['get', 'current'], '#ffffff', ['get', 'passed'], '#ffffff', '#6b7280'],
      'circle-stroke-color': '#2563eb',
      'circle-stroke-width': ['case', ['get', 'current'], 2, 0],
    },
  });
  // Text labels need the style's glyph set, which the tile-less fallback style does not have.
  if (map.getStyle().glyphs) {
    add({
      id: 'station-labels',
      type: 'symbol',
      source: SRC.stations,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 12,
        'text-offset': [1, 0],
        'text-anchor': 'left',
        'text-optional': true,
      },
      paint: {
        'text-color': ['case', ['get', 'current'], '#ffffff', ['get', 'passed'], 'rgba(255,255,255,0.7)', '#9ca3af'],
        'text-halo-color': '#111827',
        'text-halo-width': 1.5,
      },
    });
  }
}

export default function JourneyMap({ route, live, passedIds = NO_PASSED, statusLabel }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [marker, setMarker] = useState<Marker | null>(null);
  const [tagHost, setTagHost] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<'webgl' | 'tiles' | null>(null);
  // The design opens with the camera locked to the train ("Auto-pan on").
  const [follow, setFollow] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const framed = useRef(false);

  const lng = live?.current?.longitude;
  const lat = live?.current?.latitude;
  const position = useMemo<LngLat | null>(
    () => (lng !== undefined && lat !== undefined ? [lng, lat] : null),
    [lng, lat],
  );
  const followRef = useRef(follow);
  followRef.current = follow;

  // Create the map exactly once; all later changes go through sources/layers (never re-created).
  const init = useCallback(() => {
    const el = container.current;
    if (!el) return;
    setFailure(null);
    setReady(false);
    let map: MapLibreMap;
    try {
      map = new MapLibreMapCtor({
        container: el,
        style: MAP_STYLE,
        center: INDIA_CENTER,
        zoom: 3.8,
        attributionControl: { compact: true },
        maxPitch: 70,
      });
    } catch {
      setFailure('webgl');
      return;
    }
    mapRef.current = map;

    const el2 = document.createElement('div');
    el2.className = 'train-marker';
    el2.setAttribute('role', 'img');
    el2.setAttribute('aria-label', 'Train position');
    el2.innerHTML = `<span class="train-marker__ping"></span>${MARKER_ARROW}`;
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    el2.appendChild(host);
    const m = new Marker({ element: el2 });
    setMarker(m);
    setTagHost(host);

    map.on('style.load', () => {
      addLayers(map);
      setReady(true);
    });
    // Tile/style failures are non-fatal: textual status elsewhere keeps working.
    map.on('error', (e) => {
      const msg = String(e.error?.message ?? '');
      if (hasTiles && /tile|style|fetch|network|failed|401|403/i.test(msg)) setFailure('tiles');
    });
    // User-initiated gestures carry originalEvent; programmatic camera moves do not.
    const stopFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && followRef.current) setFollow(false);
    };
    map.on('dragstart', stopFollow);
    map.on('zoomstart', stopFollow);
    map.on('rotatestart', stopFollow);
    map.on('pitchstart', stopFollow);
  }, []);

  useEffect(() => {
    init();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      framed.current = false;
    };
  }, [init]);

  // Attach the marker once we have a position and a ready map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !marker) return;
    if (position) marker.setLngLat(position).addTo(map);
    else marker.remove();
  }, [ready, marker, position]);

  useAnimatedMarker(ready ? marker : null, position);

  // Route + stations data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(SRC.stations) as GeoJSONSource | undefined)?.setData(
      stationFeatures(route, live?.currentStation?.id ?? null, passedIds),
    );
  }, [ready, route, live?.currentStation?.id, passedIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { completed, remaining } = splitRoute(route, position);
    (map.getSource(SRC.completed) as GeoJSONSource | undefined)?.setData(toFC(completed));
    (map.getSource(SRC.remaining) as GeoJSONSource | undefined)?.setData(toFC(remaining));
  }, [ready, route, position]);

  // Route-glow pulse (skipped for reduced motion).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 66 && map.getLayer('route-glow')) {
        last = t;
        map.setPaintProperty('route-glow', 'line-opacity', 0.75 + 0.2 * Math.sin(t / 700));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // Initial camera: fit the whole route, then move to the train.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || framed.current) return;
    const bounds = routeBounds(route, position);
    if (!bounds) return;
    framed.current = true;
    map.fitBounds(bounds, { padding: 48, animate: false, maxZoom: 9 });
    if (position) map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 7), duration: 1600, essential: false });
  }, [ready, route, position]);

  // Follow mode: only recentre when the train leaves the safe box.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || !position) return;
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const p = map.project(position);
    const outside = p.x < w * SAFE_BOX || p.x > w * (1 - SAFE_BOX) || p.y < h * SAFE_BOX || p.y > h * (1 - SAFE_BOX);
    if (outside) map.easeTo({ center: position, duration: 800 });
  }, [ready, follow, position]);

  const followTrain = () => {
    setFollow(true);
    if (position) mapRef.current?.easeTo({ center: position, zoom: Math.max(mapRef.current.getZoom(), 8), duration: 700 });
  };
  const locateUser = () => {
    setNote(null);
    if (!navigator.geolocation) {
      setNote('Location is not available on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setFollow(false);
        const map = mapRef.current;
        map?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: Math.max(map.getZoom(), 10) });
      },
      () => setNote('Could not get your location.'),
      { timeout: 8000 },
    );
  };

  const hasGeometry = Boolean(route?.geometry);

  return (
    <div style={{ position: 'absolute', inset: 0, minHeight: 280 }}>
      <div
        ref={container}
        role="region"
        aria-label="Journey map. The same information is available as text below."
        style={{ position: 'absolute', inset: 0 }}
      />
      {tagHost &&
        createPortal(
          <div className="speed-tag">
            <span className="dot pulse" />
            <span className="speed-tag__speed type-data-md tabular">
              {live?.current?.speedKph != null ? `${Math.round(live.current.speedKph)} km/h` : '— km/h'}
            </span>
            {statusLabel && (
              <>
                <span className="speed-tag__sep speed-tag__extra type-body-sm">·</span>
                <span className="speed-tag__label speed-tag__extra type-label-md">{statusLabel}</span>
              </>
            )}
          </div>,
          tagHost,
        )}

      <MapControls
        following={follow}
        onToggleFollow={() => (follow ? setFollow(false) : followTrain())}
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onResetNorth={() => mapRef.current?.resetNorthPitch()}
        onLocateUser={locateUser}
      />

      {!hasGeometry && route && (
        <p role="status" className="map-note type-body-sm" style={{ bottom: 40 }}>
          Route line unavailable for this train — showing position only.
        </p>
      )}
      {!hasTiles && (
        <p className="map-note type-body-sm">Basemap off (no MapTiler key configured).</p>
      )}
      {note && (
        <p role="status" className="map-note type-body-sm" style={{ bottom: 64 }}>
          {note}
        </p>
      )}
      {failure && (
        <div role="alert" className="map-alert type-body-md">
          {failure === 'webgl' ? 'The map could not be started on this device.' : 'Some map tiles failed to load.'}{' '}
          Train status is still available below.{' '}
          <button
            type="button"
            onClick={() => {
              mapRef.current?.remove();
              mapRef.current = null;
              framed.current = false;
              init();
            }}
          >
            Retry map
          </button>
        </div>
      )}
    </div>
  );
}
