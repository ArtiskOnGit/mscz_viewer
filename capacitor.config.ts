import type { CapacitorConfig } from '@capacitor/cli';

// NOTE: appId is permanent once published on a store. Provisional until the app name is chosen (ADR-006).
const config: CapacitorConfig = {
  appId: 'app.pupitre.viewer',
  appName: 'Pupitre',
  webDir: 'dist',
  android: {
    // The app is fully offline: no mixed content, no remote debugging in release builds.
    allowMixedContent: false,
  },
};

export default config;
