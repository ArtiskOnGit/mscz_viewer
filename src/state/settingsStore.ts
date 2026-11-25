import { create } from 'zustand';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '../core/settings';

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load(): Promise<void>;
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  reset(): void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    set({ settings: await loadSettings(), loaded: true });
  },
  set(key, value) {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    void saveSettings(settings);
  },
  reset() {
    set({ settings: DEFAULT_SETTINGS });
    void saveSettings(DEFAULT_SETTINGS);
  },
}));
