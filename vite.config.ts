/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
// Part of the render cache key (src/core/render/renderCache.ts).
const verovio = JSON.parse(readFileSync(new URL('./node_modules/verovio/package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __VEROVIO_VERSION__: JSON.stringify(verovio.version) },
  // Verovio ships its WASM inlined in an ES module: do not pre-bundle it.
  // comlink is only imported by the render worker: pre-bundle it upfront to avoid a reload when it is discovered.
  optimizeDeps: { exclude: ['verovio'], include: ['comlink'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 10_000 },
  worker: { format: 'es' },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
