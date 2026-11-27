/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { PWA_BASE, pupitrePwa } from './scripts/pwaPlugin.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
// Part of the render cache key (src/core/render/renderCache.ts).
const verovio = JSON.parse(readFileSync(new URL('./node_modules/verovio/package.json', import.meta.url), 'utf8')) as { version: string };

// `--mode pwa` (npm run build:pwa / preview:pwa): installable offline web app for GitHub Pages (ADR-027), under
// /mscz_viewer/ in dist-pwa/. Any other mode (dev server, `npm run build` for the Android app): base '/' in dist/.
export default defineConfig(({ mode }) => ({
  base: mode === 'pwa' ? PWA_BASE : '/',
  plugins: [react(), pupitrePwa()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __VEROVIO_VERSION__: JSON.stringify(verovio.version),
    __PWA__: JSON.stringify(mode === 'pwa'),
  },
  // Verovio ships its WASM inlined in an ES module: do not pre-bundle it.
  // comlink is only imported by the render worker: pre-bundle it upfront to avoid a reload when it is discovered.
  optimizeDeps: { exclude: ['verovio'], include: ['comlink'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 10_000, outDir: mode === 'pwa' ? 'dist-pwa' : 'dist' },
  worker: { format: 'es' },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}));
