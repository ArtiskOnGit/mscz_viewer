// Global preferences (SPECIFICATIONS_FONCTIONNELLES §3.4). Per-score settings override them (ScoreViewState).
import { Preferences } from '@capacitor/preferences';
import type { PartNamesMode } from './musicxml/prepareDisplay';
import type { MyInstrumentProfile } from './profile/myInstrument';
import { DEFAULT_PEDAL_KEYS, normalizePedalKeys, type PedalKeys } from './navigation/pedalKeys';
import type { LayoutMode } from './model/types';
import type { NoteNamingSetting } from './music/keys';
import type { LanguageSetting } from '../i18n';
import type { BarNumbers, MusicFont } from './render/engraving';
import type { PageTurnAnimation, TurnLookahead } from './navigation/pageTurn';

export type OrientationLock = 'device' | 'portrait' | 'landscape';

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
  /** Keyboard / Bluetooth pedal keys (KeyboardEvent.code) for each action. */
  pedalKeys: PedalKeys;
  /** Page mode: "next" first replaces the top half of the screen with the top of the next page. */
  halfPageTurn: boolean;
  /** Layout of a score opened for the first time (then remembered per score, toolbar toggle). */
  defaultLayoutMode: LayoutMode;
  /** Continuous mode auto-scroll: height of the reading line, as a fraction of the screen from the top. */
  readingLine: number;
  /** Interface language ("system": the device language if translated, else English). */
  language: LanguageSetting;
  /** Note and key names ("auto": Do Ré Mi in French, C D E otherwise). */
  noteNaming: NoteNamingSetting;
  /** SMuFL music font (Verovio). */
  musicFont: MusicFont;
  barNumbers: BarNumbers;
  /** Title and composer above the first page. */
  showHeader: boolean;
  /** Width of each side tap zone, as a fraction of the screen width (0.2–0.45). */
  tapZoneWidth: number;
  /** Page mode: animation of the page turns (none under "reduce motion"). */
  pageTurnAnimation: PageTurnAnimation;
  /** Page mode auto-scroll: bars before the end of the page at which it turns ("half": halfway through the last bar). */
  turnLookahead: TurnLookahead;
  orientation: OrientationLock;
  /** Metronome on for scores opened for the first time. */
  metronomeDefault: boolean;
  /** Higher click on the first beat of each bar. */
  metronomeAccent: boolean;
  /** Score audio (synthesized from the MIDI file) on for scores whose sound was never switched. */
  soundDefault: boolean;
  /** Master volume of the score audio (0..1) for scores without their own. */
  soundVolume: number;
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
  pedalKeys: DEFAULT_PEDAL_KEYS,
  halfPageTurn: false,
  defaultLayoutMode: 'pages',
  readingLine: 0.33,
  language: 'system',
  noteNaming: 'auto',
  musicFont: 'Leipzig',
  barNumbers: 'system',
  showHeader: true,
  tapZoneWidth: 0.33,
  pageTurnAnimation: 'slide',
  turnLookahead: 'half',
  orientation: 'device',
  metronomeDefault: false,
  metronomeAccent: true,
  soundDefault: false,
  soundVolume: 0.8,
};

const KEY = 'settings';

export async function loadSettings(): Promise<AppSettings> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return DEFAULT_SETTINGS;
  try {
    const stored = JSON.parse(value) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...stored, pedalKeys: normalizePedalKeys(stored.pedalKeys), schemaVersion: 1 };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(settings) });
}
