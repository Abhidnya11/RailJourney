import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@': r('./src'), '@shared': r('./shared'), '@server': r('./server') },
  },
  test: {
    include: ['{src,server,shared}/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
