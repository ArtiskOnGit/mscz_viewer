/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Verovio ships its WASM inlined in an ES module: do not pre-bundle it.
  optimizeDeps: { exclude: ['verovio'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 10_000 },
  worker: { format: 'es' },
  server: { host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
