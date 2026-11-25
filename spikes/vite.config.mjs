import { defineConfig } from 'vite';

// Banc de test « appareil » de la phase 0 : `npm run device` puis ouvrir l'URL réseau sur le téléphone.
export default defineConfig({
  root: 'device-test',
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
  preview: { host: true, port: 4173 },
  optimizeDeps: { exclude: ['verovio'] },
  build: { outDir: '../device-test-dist', emptyOutDir: true, target: 'es2022' },
});
