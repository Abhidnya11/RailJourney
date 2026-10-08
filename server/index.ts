import { createApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';

// Node does not auto-load .env; do it for local development. (On Vercel the variables come from the dashboard.)
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file — rely on the real environment */
}

const env = loadEnv();
const app = await createApp(env);

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => void app.close().then(() => process.exit(0)));
}
