import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

/**
 * Vercel serverless entry point: every `/api/*` request is routed here (see vercel.json). The app is built once per
 * instance and reused, so warm requests skip the setup. Secrets come from the Vercel project's environment
 * variables; nothing is read from a file.
 *
 * The app is loaded lazily inside the handler so that a failure while starting (a missing environment variable, a
 * module that cannot be loaded) becomes a readable JSON error instead of an opaque platform crash.
 */
let ready: Promise<FastifyInstance> | undefined;

async function start(): Promise<FastifyInstance> {
  const { createApp } = await import('../server/bootstrap.js');
  const app = await createApp();
  await app.ready();
  return app;
}

/** A short description of a startup error with anything that looks like a key or token removed. */
export function describeStartupError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : 'Unknown error';
  return text.replace(/[A-Za-z0-9_-]{24,}/g, '…').slice(0, 800);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    ready ??= start();
    const app = await ready;
    app.server.emit('request', req, res);
  } catch (err) {
    ready = undefined; // let the next request retry instead of caching a failed start
    console.error('API failed to start', err); // full detail is in the Vercel logs
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'STARTUP_FAILED', message: describeStartupError(err) } }));
  }
}
