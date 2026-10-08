import { describe, expect, it, vi } from 'vitest';
import { AppError, PermanentProviderError } from '../../errors.js';
import { RailRadarProvider, cleanTrainName, toSnapshot, type LiveData } from './index.js';

const config = { baseUrl: 'https://api.test/v1', apiKey: 'k', timeoutMs: 1000, maxRetries: 0 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const live = (over: Partial<LiveData> = {}): { data: LiveData } => ({
  data: {
    status: 'running',
    isLive: true,
    lastUpdatedAt: '2026-10-06T19:18:26+05:30',
    delayMinutes: 4,
    train: { distance: 1388.4 },
    currentLocation: {
      stationCode: 'BIM',
      status: 'departed',
      isHalt: false,
      coordinates: { lat: 20.8, lng: 72.95 },
      distanceFromOriginKm: 217.5,
      speedKmh: 88,
    },
    exceptions: [{ type: 'DIVERTED', message: 'Diverted via Ratlam' }],
    route: [
      { stationCode: 'MMCT', stationName: 'Mumbai Central', platform: '5', isHalt: true, status: 'departed', lat: 18.97, lng: 72.82, distance: 0, scheduledDeparture: '2026-10-06T17:00:00+05:30' },
      { stationCode: 'AML', stationName: 'Amalsad', isHalt: false, status: 'upcoming', lat: 20.81, lng: 72.95, distance: 218.2, scheduledArrival: '2026-10-06T19:16:00+05:30' },
      { stationCode: 'ST', stationName: 'Surat', isHalt: true, status: 'upcoming', lat: 21.2, lng: 72.84, distance: 263.6, scheduledArrival: '2026-10-06T19:34:00+05:30', scheduledDeparture: '2026-10-06T19:37:00+05:30' },
    ],
    ...over,
  },
});

describe('RailRadarProvider', () => {
  it('maps search results and sends the bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ data: [{ number: '12926', name: 'Paschim SF Express', sourceName: 'Amritsar', destName: 'Bandra Terminus' }] }),
    );
    const p = new RailRadarProvider(config, { fetch: fetchMock });
    expect(await p.searchTrains('129')).toEqual([
      { id: '12926', number: '12926', name: 'Paschim SF Express', origin: 'Amritsar', destination: 'Bandra Terminus' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/lookup/search/trains?q=129&limit=20');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer k');
  });

  it('returns null for an unknown train and does not cache the failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    const p = new RailRadarProvider(config, { fetch: fetchMock });
    expect(await p.getTrain('00000')).toBeNull();
    expect(await p.getTrain('00000')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches successful responses within the TTL', async () => {
    const body = { data: { train: { number: '12951', name: 'Tejas', source: { name: 'Mumbai Central' }, destination: { name: 'New Delhi' } }, route: [] } };
    const fetchMock = vi.fn().mockImplementation(async () => json(body));
    const p = new RailRadarProvider(config, { fetch: fetchMock });
    await p.getTrain('12951');
    await p.getTrain('12951');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies upstream errors', async () => {
    const limited = new RailRadarProvider(config, { fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '30' } })) });
    const err = (await limited.searchTrains('x').catch((e) => e)) as AppError;
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfterSeconds).toBe(30);

    const denied = new RailRadarProvider(config, { fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 401 })) });
    await expect(denied.searchTrains('x')).rejects.toBeInstanceOf(PermanentProviderError);
  });

  it('builds the route from halting stops only, with geometry', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes('/route')
        ? json({ data: { geojson: { geometry: { coordinates: [[72.8, 18.9], [77.2, 28.6]] } } } })
        : json(live()),
    );
    const route = await new RailRadarProvider(config, { fetch: fetchMock }).getRoute('12951');
    expect(route.stations.map((s) => s.id)).toEqual(['MMCT', 'ST']);
    expect(route.stations[1]).toMatchObject({ code: 'ST', sequence: 1, distanceFromStartKm: 263.6 });
    expect(route.stations[0]?.platform).toBe('5');
    expect(route.stations[1]?.platform).toBeUndefined();
    expect(route.geometry?.coordinates).toHaveLength(2);
    expect(route.distanceKm).toBe(1388.4);
  });
});

describe('train details', () => {
  it('maps type, run days and departure time', async () => {
    const body = {
      data: {
        train: { number: '12951', name: 'Mumbai Central - New Delhi Tejas Rajdhani Express', type: 'Rajdhani Express', runDays: ['Mon', 'WED'], source: { name: 'Mumbai Central' }, destination: { name: 'New Delhi' } },
        route: [{ sequence: 1, station: { code: 'MMCT', name: 'Mumbai Central', lat: 18.97, lng: 72.82 }, isHalt: true, departure: '17:00', distance: 0 }],
      },
    };
    const p = new RailRadarProvider(config, { fetch: vi.fn().mockResolvedValue(json(body)) });
    expect(await p.getTrain('12951')).toEqual({
      id: '12951',
      number: '12951',
      name: 'Tejas Rajdhani Express',
      origin: 'Mumbai Central',
      destination: 'New Delhi',
      type: 'Rajdhani Express',
      runDays: ['mon', 'wed'],
      departs: '17:00',
    });
  });
  it('carries the train type through search', async () => {
    const p = new RailRadarProvider(config, { fetch: vi.fn().mockResolvedValue(json({ data: [{ number: '1', name: 'X', type: 'Superfast Express' }] })) });
    expect((await p.searchTrains('x'))[0]?.type).toBe('Superfast Express');
  });
});

describe('cleanTrainName', () => {
  it('drops the leading origin - destination', () => {
    expect(cleanTrainName('Mumbai Central - New Delhi Tejas Rajdhani Express', 'Mumbai Central', 'New Delhi')).toBe('Tejas Rajdhani Express');
    expect(cleanTrainName('Delhi - Amritsar Vande Bharat Express', 'Delhi Jn', 'Amritsar')).toBe('Vande Bharat Express');
  });
  it('leaves other names alone', () => {
    expect(cleanTrainName('Paschim SF Express', 'Amritsar', 'Bandra Terminus')).toBe('Paschim SF Express');
    expect(cleanTrainName('Howrah - Puri Express', undefined, undefined)).toBe('Howrah - Puri Express');
  });
});

describe('toSnapshot', () => {
  it('reports a running train with position, delay and ETAs shifted by the delay', () => {
    const snap = toSnapshot(live().data);
    expect(snap.alerts).toEqual([{ type: 'DIVERTED', message: 'Diverted via Ratlam' }]);
    expect(snap).toMatchObject({
      status: 'RUNNING',
      delayMinutes: 4,
      currentStationId: null,
      distanceCoveredKm: 217.5,
      position: { latitude: 20.8, longitude: 72.95, speedKph: 88 },
      source: 'railradar',
    });
    expect(snap.stationEstimates['ST']).toEqual({ eta: '2026-10-06T14:08:00.000Z', delayMinutes: 4 });
    expect(Object.keys(snap.stationEstimates)).toEqual(['MMCT', 'ST']);
  });

  it('treats a speed of 0 as unknown', () => {
    const snap = toSnapshot(live({ currentLocation: { stationCode: 'BIM', status: 'departed', isHalt: false, coordinates: { lat: 20.8, lng: 72.95 }, speedKmh: 0 } }).data);
    expect(snap.position?.speedKph).toBeNull();
  });

  it('maps delay, standing and terminal states', () => {
    expect(toSnapshot(live({ delayMinutes: 27 }).data).status).toBe('DELAYED');
    expect(toSnapshot(live({ delayMinutes: -3 }).data).status).toBe('AHEAD');
    expect(toSnapshot(live({ delayMinutes: null }).data).delayMinutes).toBeNull();
    expect(toSnapshot(live({ status: 'cancelled' }).data).status).toBe('CANCELLED');
    expect(toSnapshot(live({ status: 'not_started', isLive: false }).data).status).toBe('NOT_STARTED');
    expect(toSnapshot(live({ status: 'completed' }).data).status).toBe('COMPLETED');
    expect(toSnapshot(live({ status: 'mystery', isLive: false }).data).status).toBe('UNKNOWN');
    const standing = live({ currentLocation: { stationCode: 'ST', status: 'arrived', isHalt: true, coordinates: { lat: 21.2, lng: 72.84 } } });
    const snap = toSnapshot(standing.data);
    expect(snap.status).toBe('AT_STATION');
    expect(snap.currentStationId).toBe('ST');
  });
});
