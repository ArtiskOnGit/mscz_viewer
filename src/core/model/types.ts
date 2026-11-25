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

/** Display settings remembered per score. */
export interface ScoreViewState {
  scoreId: ScoreId;
  /** musicXmlId[]; empty = all parts. */
  selectedParts: string[];
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
  accidentalPreference: 'auto' | 'sharps' | 'flats';
  zoom: number | 'auto';
  layoutMode: LayoutMode;
  lastPage: number;
  lastMeasureIndex?: number;
  tempoFactor: number;
  metronomeEnabled: boolean;
}

export interface SetlistItem {
  id: string;
  scoreId: ScoreId;
  note?: string;
  override?: Partial<Pick<ScoreViewState, 'selectedParts' | 'transposeSemitones' | 'transposeOctave' | 'concertPitch'>>;
}

export interface Setlist {
  id: string;
  name: string;
  date?: string;
  createdAt: string;
  updatedAt: string;
  items: SetlistItem[];
}
