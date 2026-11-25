// Global preferences (SPECIFICATIONS_FONCTIONNELLES §3.4). Per-score settings override them (ScoreViewState).
import { Preferences } from '@capacitor/preferences';
import type { PartNamesMode } from './musicxml/prepareDisplay';
import type { MyInstrumentProfile } from './profile/myInstrument';

export type AppTheme = 'system' | 'light' | 'dark';
export type ScoreTheme = 'light' | 'sepia' | 'dark' | 'highContrast';

export interface AppSettings {
  schemaVersion: 1;
  appTheme: AppTheme;
  scoreTheme: ScoreTheme;
  partNames: PartNamesMode;
  multiRests: boolean;
  tapZones: boolean;
  swipe: boolean;
  keepAwake: boolean;
  /** Initial zoom of a score never opened before, relative to the automatic zoom. */
  defaultZoom: number;
  /** Auto-scroll and metronome. */
  countInMeasures: 0 | 1 | 2;
  countInSound: boolean;
  metronomeVolume: number;
  highlightMeasure: boolean;
  tapPauses: boolean;
  /** "My instrument" profile: parts preselected on the first opening of a score. */
  myInstrument: MyInstrumentProfile;
  /** Transposition (semitones) applied on the first opening of a score. */
  defaultTranspose: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  appTheme: 'system',
  scoreTheme: 'light',
  partNames: 'auto',
  multiRests: true,
  tapZones: true,
  swipe: true,
  keepAwake: true,
  defaultZoom: 1,
  countInMeasures: 1,
  countInSound: true,
  metronomeVolume: 0.7,
  highlightMeasure: true,
  tapPauses: true,
  myInstrument: { names: [], instrumentIds: [] },
  defaultTranspose: 0,
};

const KEY = 'settings';

export async function loadSettings(): Promise<AppSettings> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(value) as Partial<AppSettings>), schemaVersion: 1 };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(settings) });
}
