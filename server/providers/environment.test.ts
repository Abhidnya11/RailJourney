import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError, PermanentProviderError } from '../errors';
import { FallbackElevationProvider, sampleBulk } from './elevation';
import { OpenMeteoElevationProvider } from './openmeteo';
import type { ElevationProvider } from './types';
import { OpenTopographyProvider, meanElevation } from './opentopography';
import { OpenWeatherProvider, placeCandidates } from './openweather';

describe('meanElevation', () => {
  it('averages an ASCII grid and ignores nodata', () => {
    const grid = 'ncols 3\nnrows 2\nxllcorner 72.8\nyllcorner 21.2\ncellsize 0.0003\nNODATA_value -9999\n 10 20 -9999\n 30 40 50\n';
    expect(meanElevation(grid)).toBe(30);
  });
  it('returns null when there is no data', () => {
    expect(meanElevation('ncols 1\nnrows 1\n -9999\n')).toBeNull();
  });
});

describe('OpenTopographyProvider', () => {
  it('requests a small DEM square around the point and caches by location', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(' 17 19\n 15 17\n'));
    const p = new OpenTopographyProvider('key', { fetch: fetchMock });
    expect(await p.sampleElevations([[72.84, 21.2]])).toEqual([17]);
    await p.sampleElevations([[72.8401, 21.2001]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('demtype')).toBe('COP30');
    expect(url.searchParams.get('API_Key')).toBe('key');
    expect(Number(url.searchParams.get('north')) - Number(url.searchParams.get('south'))).toBeCloseTo(0.004);
  });
  it('rejects with a sanitized error when the provider says no', async () => {
    const p = new OpenTopographyProvider('bad', { fetch: vi.fn().mockResolvedValue(new Response('no', { status: 401 })) });
    await expect(p.sampleElevations([[72.84, 21.2]])).rejects.toBeInstanceOf(PermanentProviderError);
  });
});

describe('OpenTopography quota', () => {
  const quota = () => new Response('<error>Error: API maximum rate limit reached. (50 API calls/24hrs)</error>', { status: 401 });

  it('stops asking once the daily limit is hit', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => quota());
    const p = new OpenTopographyProvider('key', { fetch: fetchMock });
    const err = (await p.sampleElevations([[72.84, 21.2]]).catch((e) => e)) as AppError;
    expect(err.code).toBe('RATE_LIMITED');
    await expect(p.sampleElevations([[73.18, 22.3]])).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps results on disk so a restart does not spend quota again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ot-'));
    const persistPath = join(dir, 'cache.json');
    try {
      const first = new OpenTopographyProvider('key', { fetch: vi.fn().mockResolvedValue(new Response(' 17 19\n 15 17\n')), persistPath });
      expect(await first.sampleElevations([[72.84, 21.2]])).toEqual([17]);
      await new Promise((r) => setTimeout(r, 1300));
      expect(Object.keys(JSON.parse(readFileSync(persistPath, 'utf8')))).toEqual(['21.20,72.84']);

      const fetchAgain = vi.fn();
      const second = new OpenTopographyProvider('key', { fetch: fetchAgain, persistPath });
      expect(await second.sampleElevations([[72.84, 21.2]])).toEqual([17]);
      expect(fetchAgain).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('OpenMeteoElevationProvider', () => {
  it('sends coordinates in batches of 100 and keeps order', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      return new Response(JSON.stringify({ elevation: Array.from({ length: n }, (_, i) => i) }));
    });
    const p = new OpenMeteoElevationProvider({ fetch: fetchMock });
    const coords = Array.from({ length: 250 }, (_, i) => [70 + i * 0.01, 20] as [number, number]);
    const out = await p.sampleMany(coords);
    expect(out).toHaveLength(250);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const first = new URL(fetchMock.mock.calls[0]![0] as string).searchParams;
    expect(first.get('longitude')!.split(',')[0]).toBe('70.00000');
  });
  it('rejects on errors, and sampleElevations rejects on gaps', async () => {
    const down = new OpenMeteoElevationProvider({ fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 500 })) });
    await expect(down.sampleMany([[72, 21]])).rejects.toThrow();
    const gap = new OpenMeteoElevationProvider({ fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ elevation: [null] }))) });
    await expect(gap.sampleElevations([[72, 21]])).rejects.toBeInstanceOf(PermanentProviderError);
  });
});

describe('FallbackElevationProvider', () => {
  const primary = (fn: ElevationProvider['sampleElevations']): ElevationProvider => ({ sampleElevations: fn });
  const secondary: ElevationProvider = {
    bulkSource: 'Backup',
    sampleElevations: async (c) => c.map(() => 99),
    sampleMany: async (c) => c.map(() => 99),
  };

  it('prefers the primary for fixed places and fills gaps from the secondary', async () => {
    const p = new FallbackElevationProvider(
      primary(async ([c]) => {
        if (c![0] === 2) throw new AppError('RATE_LIMITED', 'limit');
        return [50];
      }),
      secondary,
    );
    expect(await p.sampleElevations([[1, 0], [2, 0]])).toEqual([50, 99]);
    expect(p.bulkSource).toBe('Backup');
  });

  it('prefers the secondary for batches, and only retries the primary for a handful of points', async () => {
    const primaryFn = vi.fn(async (c: [number, number][]) => c.map(() => 7));
    const down: ElevationProvider = {
      sampleElevations: async () => { throw new Error('down'); },
      sampleMany: async () => { throw new Error('down'); },
    };
    const healthy = new FallbackElevationProvider(primary(primaryFn), secondary);
    expect(await healthy.sampleMany([[1, 0], [2, 0]])).toEqual([99, 99]);
    expect(primaryFn).not.toHaveBeenCalled();

    const few = new FallbackElevationProvider(primary(primaryFn), down);
    expect(await few.sampleMany([[1, 0], [2, 0]])).toEqual([7, 7]);
    const many = Array.from({ length: 20 }, (_, i) => [i, 0] as [number, number]);
    await expect(few.sampleMany(many)).rejects.toThrow('down');
  });

  it('sampleBulk falls back to point-by-point when there is no batch method', async () => {
    const flaky = primary(async ([c]) => {
      if (c![0] === 2) throw new Error('x');
      return [5];
    });
    expect(await sampleBulk(flaky, [[1, 0], [2, 0], [3, 0]])).toEqual([5, null, 5]);
  });
});

describe('placeCandidates', () => {
  it('falls back from station names to city names', () => {
    expect(placeCandidates('Lalgarh Jn')).toEqual(['Lalgarh Jn', 'Lalgarh']);
    expect(placeCandidates('Mumbai Central')).toEqual(['Mumbai Central', 'Mumbai']);
    expect(placeCandidates('New Delhi')).toEqual(['New Delhi']);
    expect(placeCandidates('Surat')).toEqual(['Surat']);
  });
});

describe('OpenWeatherProvider', () => {
  it('maps current conditions, converting wind to km/h', async () => {
    const body = { main: { temp: 28.94, humidity: 70 }, wind: { speed: 2.06 }, weather: [{ description: 'clear sky' }], dt: 1791294168 };
    const p = new OpenWeatherProvider('key', { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(body))) });
    const [snap] = await p.getWeather(21.2, 72.84, 0);
    expect(snap).toMatchObject({ temperatureC: 28.94, humidityPercent: 70, windKph: 7.4, summary: 'clear sky' });
  });

  it('looks a place up by name, returns null when unknown', async () => {
    const body = { main: { temp: 31, humidity: 60 }, visibility: 6500, weather: [{ description: 'haze' }], coord: { lat: 21.2, lon: 72.8 } };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(body))).mockResolvedValueOnce(new Response('{}', { status: 404 }));
    const p = new OpenWeatherProvider('key', { fetch: fetchMock });
    expect(await p.getWeatherForPlace('Surat')).toMatchObject({ place: 'Surat', temperatureC: 31, visibilityKm: 6.5, latitude: 21.2 });
    expect(new URL(fetchMock.mock.calls[0]![0] as string).searchParams.get('q')).toBe('Surat,IN');
    expect(await p.getWeatherForPlace('Nowhere')).toBeNull();
  });
});
