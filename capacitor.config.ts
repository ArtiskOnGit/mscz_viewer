import type { CapacitorConfig } from '@capacitor/cli';

// Permanent Android applicationId (ADR-006): never change it once published on a store.
const config: CapacitorConfig = {
  appId: 'io.github.artiskongit.pupitre',
  appName: 'Pupitre',
  webDir: 'dist',
  android: {
    // The app is fully offline: no mixed content, no remote debugging in release builds.
    allowMixedContent: false,
  },
};

export default config;
