import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { conditionsSchema, environmentSchema, placeWeatherSchema, terrainProfileSchema, trainSchema } from '../shared/domain';
import { buildApp } from './app';
import { MemoryCache } from './cache/memory';
import { loadEnv } from './config/env';
import { MemoryShareStore } from './modules/sharing/store';
import { SAMPLE_COUNT } from './modules/journeys/terrain';
import { MockTrainProvider } from './providers/mock';
import type { ElevationProvider, WeatherProvider } from './providers/types';

const NOW = new Date('2026-10-05T10:20:00Z');

const weather: WeatherProvider = {
  async getWeather(lat, lon) {
    return [{ latitude: lat, longitude: lon, observedAt: NOW.toISOString(), temperatureC: 29.44, humidityPercent: 70, windKph: 7.4, summary: 'clear sky' }];
  },
  async getWeatherForPlace(name) {
    return name === 'Nowhere'
      ? null
      : { place: name, latitude: 0, longitude: 0, observedAt: NOW.toISOString(), temperatureC: 31.04, humidityPercent: 60, visibilityKm: 6.5, summary: 'haze' };
  },
};
const elevation: ElevationProvider = { sampleElevations: async (coords) => coords.map(() => 17.4) };

let app: FastifyInstance;
async function start(extra: { weather?: WeatherProvider; elevation?: ElevationProvider } = {}) {
  app = await buildApp({
    env: loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    provider: new MockTrainProvider(() => NOW),
    cache: new MemoryCache(),
    shares: new MemoryShareStore(),
    now: () => NOW,
    ...extra,
  });
}
afterEach(() => app.close());

const get = (url: string) => app.inject({ method: 'GET', url });
const journeyId = async () => (await get('/api/trains/12951/journey')).json().journeyId as string;

describe('environment', () => {
  it('reports weather and elevation at the train', async () => {
    await start({ weather, elevation });
    const res = await get(`/api/journeys/${await journeyId()}/environment`);
    expect(res.statusCode).toBe(200);
    const env = environmentSchema.parse(res.json());
    expect(env).toMatchObject({ temperatureC: 29.4, humidityPercent: 70, windKph: 7.4, summary: 'clear sky', elevationM: 17 });
  });

  it('returns nulls, not an error, when providers are not configured', async () => {
    await start();
    const env = environmentSchema.parse((await get(`/api/journeys/${await journeyId()}/environment`)).json());
    expect(env).toMatchObject({ temperatureC: null, elevationM: null });
  });
});

describe('conditions', () => {
  it('lists the current station, next halt and destination with weather and terrain', async () => {
    await start({ weather, elevation });
    const res = await get(`/api/journeys/${await journeyId()}/conditions`);
    expect(res.statusCode).toBe(200);
    const { places } = conditionsSchema.parse(res.json());
    const roles = places.flatMap((p) => p.roles);
    expect(roles).toContain('Current station');
    expect(roles).toContain('Destination');
    expect(new Set(places.map((p) => p.name)).size).toBe(places.length);
    for (const p of places) {
      expect(p.weather).toMatchObject({ temperatureC: 29.4, summary: 'clear sky' });
      expect(p.elevationM).toBe(17);
    }
  });

  it('still lists the places, without data, when providers are not configured', async () => {
    await start();
    const { places } = conditionsSchema.parse((await get(`/api/journeys/${await journeyId()}/conditions`)).json());
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((p) => p.weather === null && p.elevationM === null)).toBe(true);
  });
});

describe('terrain profile', () => {
  it('samples elevation along the route and reports where the train is', async () => {
    let calls = 0;
    const counting: ElevationProvider = {
      sampleElevations: async (coords) => {
        calls += 1;
        return coords.map(([lon]) => 100 + Math.round(lon));
      },
    };
    await start({ elevation: counting });
    const id = await journeyId();
    const profile = terrainProfileSchema.parse((await get(`/api/journeys/${id}/terrain`)).json());
    expect(profile.points).toHaveLength(SAMPLE_COUNT);
    expect(profile.source).toBe('OpenTopography');
    expect(profile.points[0]?.km).toBe(0);
    expect(profile.points.at(-1)?.km).toBeCloseTo(profile.totalKm, 0);
    expect(profile.points.map((p) => p.km)).toEqual([...profile.points.map((p) => p.km)].sort((a, b) => a - b));
    expect(profile.trainKm).not.toBeNull();
    expect(profile.origin).toBeTruthy();
    // Second request is served from the cache: no new elevation lookups.
    const before = calls;
    await get(`/api/journeys/${id}/terrain`);
    expect(calls).toBe(before);
  });

  it('keeps going when some points fail, and fails clearly when too many do', async () => {
    let n = 0;
    const flaky: ElevationProvider = {
      sampleElevations: async (coords) => {
        n += 1;
        if (n % 2 === 0) throw new Error('boom');
        return coords.map(() => 50);
      },
    };
    await start({ elevation: flaky });
    const partial = terrainProfileSchema.parse((await get(`/api/journeys/${await journeyId()}/terrain`)).json());
    expect(partial.points.length).toBe(SAMPLE_COUNT / 2);

    await app.close();
    await start({ elevation: { sampleElevations: async () => { throw new Error('down'); } } });
    expect((await get(`/api/journeys/${await journeyId()}/terrain`)).statusCode).toBe(502);
  });

  it('uses one batch request when the provider supports it', async () => {
    let batchCalls = 0;
    const batch: ElevationProvider = {
      bulkSource: 'Test DEM',
      sampleElevations: async () => {
        throw new Error('should not be called point by point');
      },
      sampleMany: async (coords) => {
        batchCalls += 1;
        return coords.map((_, i) => 10 + i);
      },
    };
    await start({ elevation: batch });
    const profile = terrainProfileSchema.parse((await get(`/api/journeys/${await journeyId()}/terrain`)).json());
    expect(batchCalls).toBe(1);
    expect(profile.points).toHaveLength(SAMPLE_COUNT);
    expect(profile.source).toBe('Test DEM');
    expect(profile.points[0]?.elevationM).toBe(10);
  });

  it('reports unavailable when elevation is not configured', async () => {
    await start();
    expect((await get(`/api/journeys/${await journeyId()}/terrain`)).statusCode).toBe(502);
  });
});

describe('place weather', () => {
  it('returns rounded weather for a place and 404s unknown ones', async () => {
    await start({ weather });
    const ok = await get('/api/weather?place=Surat');
    expect(placeWeatherSchema.parse(ok.json())).toMatchObject({ place: 'Surat', temperatureC: 31, visibilityKm: 6.5, summary: 'haze' });
    expect((await get('/api/weather?place=Nowhere')).statusCode).toBe(404);
    expect((await get('/api/weather?place=a')).statusCode).toBe(400);
  });
  it('reports unavailable when weather is not configured', async () => {
    await start();
    expect((await get('/api/weather?place=Surat')).statusCode).toBe(502);
  });
});

describe('train details', () => {
  it('returns the train record and 404s unknown numbers', async () => {
    await start();
    expect(trainSchema.parse((await get('/api/trains/12951')).json())).toMatchObject({ number: '12951' });
    expect((await get('/api/trains/99999')).statusCode).toBe(404);
  });
});
