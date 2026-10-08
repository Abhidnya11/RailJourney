import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../server/bootstrap.js';

/**
 * Vercel serverless entry point: every `/api/*` request is routed here (see vercel.json). The app is built once per
 * instance and reused, so warm requests skip the setup. Secrets come from the Vercel project's environment
 * variables; nothing is read from a file.
 */
let ready: Promise<FastifyInstance> | undefined;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= createApp()
    .then(async (app) => {
      await app.ready();
      return app;
    })
    .catch((err: unknown) => {
      ready = undefined; // let the next request retry instead of caching a failed start
      throw err;
    });
  const app = await ready;
  app.server.emit('request', req, res);
}
