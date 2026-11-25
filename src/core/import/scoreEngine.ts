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
  parts?: { name: string; instrumentId?: string; program?: number }[];
}

export interface EngineResult {
  metadata: EngineMetadata;
  musicXml: string;
  positions: WebMscorePositions;
}

export interface ScoreEngine {
  convert(format: ImportFormat, bytes: Uint8Array): Promise<EngineResult>;
}
