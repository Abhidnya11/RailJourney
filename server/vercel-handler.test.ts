import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let server: Server;
let base: string;

/** Loads a fresh copy of the function (a new "serverless instance") and serves it on a random local port. */
async function startInstance() {
  vi.resetModules();
  const { default: handler } = await import('../api/index.js');
  server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const stop = () => new Promise<void>((resolve) => server?.close(() => resolve()));

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('TRAIN_PROVIDER', 'mock');
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('SHARE_SIGNING_SECRET', 's'.repeat(48));
});
afterEach(async () => {
  await stop();
  vi.unstubAllEnvs();
});

describe('Vercel function (api/index.ts)', () => {
  it('serves the API through the serverless handler', async () => {
    await startInstance();
    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', provider: 'mock' });

    const search = await fetch(`${base}/api/trains/search?q=12951`);
    expect(search.status).toBe(200);
    expect(((await search.json()) as { results: unknown[] }).results[0]).toMatchObject({ number: '12951' });

    expect((await fetch(`${base}/api/nothing-here`)).status).toBe(404);
  });

  it('share links made on one instance open on another (no shared memory)', async () => {
    await startInstance();
    const { journeyId } = (await (await fetch(`${base}/api/trains/12951/journey`)).json()) as { journeyId: string };
    const created = await fetch(`${base}/api/shares`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ journeyId }),
    });
    expect(created.status).toBe(201);
    const { shareId, url } = (await created.json()) as { shareId: string; url: string };
    expect(url).toBe(`/journey/share/${shareId}`);
    await stop();

    await startInstance(); // brand-new instance, empty memory
    const opened = await fetch(`${base}/api/shares/${shareId}`);
    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({ journeyId });

    const forged = await fetch(`${base}/api/shares/${shareId.slice(0, -3)}abc`);
    expect(forged.status).toBe(404);
  });
});
