// Domain model — see docs/SPECIFICATIONS_TECHNIQUES.md §3.

export type ScoreId = string;

export type SourceFormat = 'mscz' | 'mscx' | 'mxl' | 'musicxml';

export interface Part {
  /** Order in the score. */
  index: number;
  /** MusicXML <score-part id>, e.g. "P1". */
  musicXmlId: string;
  name: string;
  instrumentId?: string;
  midiProgram?: number;
  /** Hidden in the original MuseScore file: not shown by default. */
  hiddenInSource?: boolean;
  /** Channels of the part in the score's MIDI file (0-based, + 16 × port; drums on 9). See core/audio/partMapping. */
  midiChannels?: number[];
}

/** Parts shown when the user has not chosen: the ones visible in MuseScore (all if none is). */
export function defaultPartIds(parts: readonly Part[]): string[] {
  const visible = parts.filter((p) => !p.hiddenInSource).map((p) => p.musicXmlId);
  return visible.length ? visible : parts.map((p) => p.musicXmlId);
}

export interface Score {
  id: ScoreId;
  title: string;
  originalTitle: string;
  subtitle?: string;
  composer?: string;
  sourceFormat: SourceFormat;
  sourceFileName: string;
  /** SHA-256 of the original file, hex. */
  sourceHash: string;
  importedAt: string;
  lastOpenedAt?: string;
  importerVersion: number;
  /** A MIDI file was generated at import (audio playback available). */
  hasMidi?: boolean;
  museScoreVersion?: string;
  measures: number;
  durationSec?: number;
  initialTempoBpm?: number;
  parts: Part[];
  rehearsalMarks: { label: string; measureIndex: number }[];
  tags: string[];
}

export interface TimeSignature {
  beats: number;
  beatType: number;
}

/** One measure occurrence in playing order (repeats unfolded). */
export interface TimelineEvent {
  /** 0-based rank of the measure in the MusicXML document. */
  measureIndex: number;
  /** Start time at the original tempo, in ms. */
  startMs: number;
  durationMs: number;
  timeSig: TimeSignature;
}

export interface Timeline {
  source: 'webmscore' | 'verovio';
  events: TimelineEvent[];
  totalMs: number;
}

export type LayoutMode = 'pages' | 'continuous';

/** Mixer of one part (score audio, ADR-026). */
export interface PartMix {
  /** 0..1 (slider position; the gain follows a fader curve, see core/audio/mixer.ts). */
  volume: number;
  muted: boolean;
  solo: boolean;
}

/** Score audio mixer. Parts not listed have the default mix (100 %, not muted, not soloed). */
export interface MixerState {
  /** Master volume 0..1; undefined = the default of the settings. */
  master?: number;
  /** By MusicXML part id. */
  parts: Record<string, PartMix>;
  /**
   * Metronome volume 0..1 for this score; undefined = the settings' metronome volume. Played by the synth with the
   * sound on, by the Web Audio click otherwise. Not affected by solo (see ADR-026).
   */
  metronome?: number;
}

/**
 * Clef chosen for a part instead of the score's (only the clef changes, not the notes). treble8vb = treble clef
 * with an 8 below, read an octave lower (tenor voice, trombone in treble clef at pitch). See ADR-028.
 */
export type ClefChoice = 'treble' | 'treble8vb' | 'bass' | 'alto' | 'tenor';

/** Display settings remembered per score. */
export interface ScoreViewState {
  scoreId: ScoreId;
  /** musicXmlId[]; empty = all parts. */
  selectedParts: string[];
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
  /** Spelling of the transposed key when it has an enharmonic alternative (D♭/C♯…). */
  accidentalPreference: 'auto' | 'sharps' | 'flats';
  /** Clef chosen per part (musicXmlId); parts not listed (or no map) keep the clefs of the score. */
  clefOverrides?: Record<string, ClefChoice>;
  zoom: number | 'auto';
  layoutMode: LayoutMode;
  lastPage: number;
  lastMeasureIndex?: number;
  tempoFactor: number;
  metronomeEnabled: boolean;
  /** Score audio on/off; undefined = the default of the settings. */
  soundEnabled?: boolean;
  mixer?: MixerState;
}

export interface SetlistItem {
  id: string;
  scoreId: ScoreId;
  note?: string;
  override?: Partial<Pick<ScoreViewState, 'selectedParts' | 'transposeSemitones' | 'transposeOctave' | 'concertPitch' | 'accidentalPreference' | 'clefOverrides' | 'mixer'>>;
}

export interface Setlist {
  id: string;
  name: string;
  date?: string;
  createdAt: string;
  updatedAt: string;
  items: SetlistItem[];
}
