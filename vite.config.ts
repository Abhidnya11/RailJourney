import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * maplibre-gl 6 finds its worker at `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, i.e. a
 * sibling of whichever chunk contains it. Vite does not emit that file, so copy the worker and its
 * shared module next to the chunks under their original names.
 */
function maplibreWorker(): Plugin {
  return {
    name: 'maplibre-worker-assets',
    apply: 'build',
    generateBundle() {
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/${file}`,
          source: readFileSync(r(`./node_modules/maplibre-gl/dist/${file}`)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), maplibreWorker()],
  resolve: {
    alias: { '@': r('./src'), '@shared': r('./shared') },
  },
  // maplibre-gl 6 loads its worker via relative URL; pre-bundling would move the main file and break it.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
