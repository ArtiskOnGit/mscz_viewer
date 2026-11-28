// Conversion engine used at import time: MuseScore/MusicXML file → MusicXML + metadata + playing-order positions.
import type { ImportFormat } from './formats';
import type { WebMscorePositions } from '../timeline/timeline';

export interface EngineMetadata {
  title?: string;
  subtitle?: string;
  composer?: string;
  mscoreVersion?: string;
  measures?: number;
  /** seconds */
  duration?: number;
  /** BPM of the first tempo mark */
  tempo?: number;
  /** Parts in score order; `drums`: the part has a drum staff (its MIDI channel 10 is a drum kit). */
  parts?: { name: string; instrumentId?: string; program?: number; drums?: boolean }[];
}

export interface EngineResult {
  metadata: EngineMetadata;
  musicXml: string;
  positions: WebMscorePositions;
  /** Standard MIDI file, repeats unfolded (audio playback). Missing if the engine could not export it. */
  midi?: Uint8Array;
}

export interface ScoreEngine {
  convert(format: ImportFormat, bytes: Uint8Array): Promise<EngineResult>;
}
