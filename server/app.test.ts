import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { liveJourneySchema, routeSchema, stationsResponseSchema } from '../shared/domain.js';
import { buildApp } from './app.js';
import { MemoryCache } from './cache/memory.js';
import { loadEnv } from './config/env.js';
import { MemoryShareStore } from './modules/sharing/store.js';
import { MockTrainProvider } from './providers/mock/index.js';

const NOW = new Date('2026-10-05T10:20:00Z');

let app: FastifyInstance;
beforeEach(async () => {
  const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  app = await buildApp({
    env,
    provider: new MockTrainProvider(() => NOW),
    cache: new MemoryCache(),
    shares: new MemoryShareStore(),
    now: () => NOW,
  });
});
afterEach(() => app.close());

const get = (url: string) => app.inject({ method: 'GET', url });

describe('search', () => {
  it('finds trains by number and by name', async () => {
    const byNumber = await get('/api/trains/search?q=12952');
    expect(byNumber.statusCode).toBe(200);
    expect(byNumber.json().results[0]).toMatchObject({ number: '12952' });
    const byName = await get('/api/trains/search?q=rajdhani');
    expect(byName.json().results.length).toBeGreaterThan(1);
  });
  it('validates input without leaking details', async () => {
    const res = await get('/api/trains/search?q=a');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_REQUEST');
    expect((await get('/api/trains/search')).statusCode).toBe(400);
  });
  it('returns an empty list when nothing matches', async () => {
    expect((await get('/api/trains/search?q=zzzzzz')).json()).toEqual({ results: [] });
  });
});

describe('journey', () => {
  it('resolves a train to a journey and serves live/route/stations', async () => {
    const { journeyId } = (await get('/api/trains/12952/journey')).json();
    expect(journeyId).toBe('12952_2026-10-05');

    const live = liveJourneySchema.parse((await get(`/api/journeys/${journeyId}/live`)).json());
    expect(live.train.number).toBe('12952');
    expect(live.progress.percentage).toBeGreaterThan(0);
    expect(live.freshness).toBe('FRESH');
    expect(live.nextStation).not.toBeNull();

    const route = routeSchema.parse((await get(`/api/journeys/${journeyId}/route`)).json());
    expect(route.stations.length).toBeGreaterThan(2);

    const stations = stationsResponseSchema.parse((await get(`/api/journeys/${journeyId}/stations?limit=3`)).json());
    expect(stations.stations.length).toBeLessThanOrEqual(3);
    expect(stations.stations.every((s) => !s.passed)).toBe(true);
  });

  it('reports a stale feed as STALE', async () => {
    const live = liveJourneySchema.parse((await get('/api/journeys/12839_2026-10-05/live')).json());
    expect(live.freshness).toBe('STALE');
    expect(live.status).toBe('STALE');
  });

  it('reports cancelled trains with null progress', async () => {
    const live = liveJourneySchema.parse((await get('/api/journeys/12009_2026-10-05/live')).json());
    expect(live.status).toBe('CANCELLED');
    expect(live.progress.percentage).toBeNull();
    expect(live.current).toBeNull();
  });

  it('rejects malformed ids and 404s unknown trains', async () => {
    expect((await get('/api/journeys/not-valid/live')).statusCode).toBe(400);
    expect((await get('/api/journeys/99999_2026-10-05/live')).statusCode).toBe(404);
    expect((await get('/api/trains/99999/journey')).statusCode).toBe(404);
  });
});

describe('sharing', () => {
  it('creates and resolves a share', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/shares', payload: { journeyId: '12952_2026-10-05' } });
    expect(created.statusCode).toBe(201);
    const { shareId, url } = created.json();
    expect(url).toBe(`/journey/share/${shareId}`);
    const resolved = await get(`/api/shares/${shareId}`);
    expect(resolved.json()).toMatchObject({ journeyId: '12952_2026-10-05' });
  });
  it('rejects unknown journeys and bad bodies, and 404s unknown shares', async () => {
    const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/shares', payload: payload as object });
    expect((await post({ journeyId: '99999_2026-10-05' })).statusCode).toBe(404);
    expect((await post({})).statusCode).toBe(400);
    expect((await get('/api/shares/share_doesnotexist')).statusCode).toBe(404);
  });
});

describe('rate limiting', () => {
  it('returns 429 with retry-after once the search budget is spent', async () => {
    const env = loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', RATE_LIMIT_SEARCH_PER_MIN: '2' });
    const limited = await buildApp({
      env,
      provider: new MockTrainProvider(() => NOW),
      cache: new MemoryCache(),
      shares: new MemoryShareStore(),
    });
    await limited.inject({ method: 'GET', url: '/api/trains/search?q=12' });
    await limited.inject({ method: 'GET', url: '/api/trains/search?q=12' });
    const res = await limited.inject({ method: 'GET', url: '/api/trains/search?q=12' });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
    await limited.close();
  });
});

describe('env', () => {
  it('rejects the mock provider in production', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', TRAIN_PROVIDER: 'mock' })).toThrow(/not allowed in production/);
  });
  it('requires a strong share-signing secret in production', () => {
    const base = { NODE_ENV: 'production', TRAIN_PROVIDER: 'railradar', RAILRADAR_BASE_URL: 'https://x', RAILRADAR_API_KEY: 'k' };
    expect(() => loadEnv(base)).toThrow(/SHARE_SIGNING_SECRET/);
    expect(() => loadEnv({ ...base, SHARE_SIGNING_SECRET: 'too-short' })).toThrow(/SHARE_SIGNING_SECRET/);
    expect(() => loadEnv({ ...base, SHARE_SIGNING_SECRET: 'x'.repeat(32) })).not.toThrow();
  });
  it('enables the elevation fallback by default and lets it be switched off', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).ELEVATION_FALLBACK).toBe(true);
    expect(loadEnv({ NODE_ENV: 'test', ELEVATION_FALLBACK: 'false' }).ELEVATION_FALLBACK).toBe(false);
  });
  it('treats empty values from .env.example as unset', () => {
    expect(() => loadEnv({ NODE_ENV: 'development', CORS_ORIGINS: '', RAILRADAR_API_KEY: '' })).not.toThrow();
  });
});
