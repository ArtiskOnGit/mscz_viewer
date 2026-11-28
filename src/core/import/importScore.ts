// Import pipeline: bytes → (dedupe) → engine → Score + files in the library. See SPECIFICATIONS_TECHNIQUES §4.
import type { Part, Score } from '../model/types';
import type { LibraryRepository } from '../storage/libraryRepository';
import type { XmlEnv } from '../musicxml/filterParts';
import { readMeasureFills, readTimeSignatures, timelineFromWebMscore } from '../timeline/timeline';
import { detectFormat, extensionOf, extractMsczThumbnail, sha256Hex, type ImportFormat } from './formats';
import type { EngineResult, ScoreEngine } from './scoreEngine';
import { unhideParts } from './unhideParts';
import { parseMidi } from '../audio/midiFile';
import { channelsByPart, staffCounts, trackParts } from '../audio/partMapping';
import { separatePartChannels } from '../audio/midiChannels';

/**
 * Bump when the pipeline output changes: older scores are re-imported from their original file.
 * 2: hidden MuseScore parts/staves are made visible before conversion (their beams were missing).
 * 3: MIDI file (repeats unfolded) + MIDI channels of each part, for audio playback (ADR-026).
 * 4: key signatures of MuseScore ≥ 4.4 files (<concertKey>/<actualKey>) converted for the 4.0 engine (they were lost).
 * 5: MIDI channels shared by several parts (past 16 channels) separated, each part has its own (midiChannels.ts);
 *    pickups and other incomplete measures marked in the timeline (count-in and clicks at the real tempo).
 */
export const IMPORTER_VERSION = 5;

export interface ImportInput {
  name: string;
  bytes: Uint8Array;
}

export type ImportErrorCode = 'unsupportedFormat' | 'emptyFile' | 'engineFailed' | 'invalidMusicXml';

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export type ImportOutcome = { status: 'imported'; score: Score } | { status: 'duplicate'; existing: Score };

export interface ImportDeps {
  repo: LibraryRepository;
  engine: ScoreEngine;
  xml?: XmlEnv;
  now?: () => Date;
  newId?: () => string;
}

// Placeholder texts of MuseScore's new-score wizard, not real metadata.
const PLACEHOLDERS = new Set(['untitled score', 'subtitle', 'composer / arranger', 'composer', 'lyricist']);
const meaningful = (s?: string) => (s && !PLACEHOLDERS.has(s.trim().toLowerCase()) ? s.trim() : undefined);

export async function importScore(input: ImportInput, deps: ImportDeps): Promise<ImportOutcome> {
  const { repo } = deps;
  if (input.bytes.length === 0) throw new ImportError('emptyFile', `${input.name} is empty`);
  const format = detectFormat(input.name, input.bytes);
  if (!format) throw new ImportError('unsupportedFormat', `${input.name}: unsupported format`);

  const sourceHash = await sha256Hex(input.bytes);
  const existing = await repo.findByHash(sourceHash);
  if (existing) return { status: 'duplicate', existing };

  const id = deps.newId?.() ?? crypto.randomUUID();
  const converted = await convert(input, format, deps);
  const title = converted.title ?? prettyFileName(input.name);
  const score: Score = {
    ...converted.fields,
    id,
    title,
    originalTitle: title,
    sourceFormat: format,
    sourceFileName: input.name,
    sourceHash,
    importedAt: (deps.now?.() ?? new Date()).toISOString(),
    tags: [],
  };

  await repo.add(score, {
    original: { bytes: input.bytes, ext: extensionOf(input.name) || format },
    musicXml: converted.musicXml,
    timeline: converted.timeline,
    midi: converted.midi,
    thumbnail: format === 'mscz' ? extractMsczThumbnail(input.bytes) : undefined,
  });
  return { status: 'imported', score };
}

/** Re-run the conversion of an already imported score from its original file (keeps id, title, settings). */
export async function reimportScore(score: Score, deps: ImportDeps): Promise<Score> {
  const bytes = await deps.repo.readOriginal(score);
  if (!bytes) throw new ImportError('emptyFile', `${score.sourceFileName}: original file missing`);
  const converted = await convert({ name: score.sourceFileName, bytes }, score.sourceFormat, deps);
  const updated: Score = { ...score, ...converted.fields };
  await deps.repo.replace(updated, { musicXml: converted.musicXml, timeline: converted.timeline, midi: converted.midi });
  return updated;
}

type ConvertedFields = Pick<Score, 'subtitle' | 'composer' | 'importerVersion' | 'museScoreVersion' | 'measures' | 'durationSec' | 'initialTempoBpm' | 'parts' | 'rehearsalMarks' | 'hasMidi'>;

async function convert(input: ImportInput, format: ImportFormat, deps: ImportDeps) {
  const env = deps.xml ?? globalThis;
  let bytes = input.bytes;
  let hidden: number[] = [];
  if (format === 'mscz' || format === 'mscx') {
    try {
      ({ bytes, hiddenPartIndexes: hidden } = unhideParts(format, input.bytes, env));
    } catch (e) {
      console.warn('unhideParts failed, converting the file as is', e);
    }
  }

  let result: EngineResult;
  try {
    result = await deps.engine.convert(format, bytes);
  } catch (e) {
    throw new ImportError('engineFailed', `${input.name}: the score engine could not read this file`, e);
  }

  const doc = new env.DOMParser().parseFromString(result.musicXml, 'application/xml');
  const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
  if (scoreParts.length === 0) throw new ImportError('invalidMusicXml', `${input.name}: no part found`);

  const meta = result.metadata;
  const parts: Part[] = scoreParts.map((sp, index) => {
    const engineParts = meta.parts?.[index];
    return {
      index,
      musicXmlId: sp.getAttribute('id') ?? `P${index + 1}`,
      name: sp.getElementsByTagName('part-name')[0]?.textContent?.trim() || engineParts?.name || `Part ${index + 1}`,
      instrumentId: engineParts?.instrumentId,
      midiProgram: engineParts?.program,
      ...(hidden.includes(index) ? { hiddenInSource: true } : {}),
    };
  });

  const drums = scoreParts.map((_, i) => meta.parts?.[i]?.drums ?? hasUnpitchedNotes(doc, parts[i]!.musicXmlId));
  const audio = readMidi(result.midi, doc, parts, drums);
  const midiChannels = audio?.channels;
  if (midiChannels) parts.forEach((p, i) => (p.midiChannels = midiChannels[i] ?? []));

  const timeline = timelineFromWebMscore(result.positions, readTimeSignatures(doc), meta.duration ? meta.duration * 1000 : undefined, readMeasureFills(doc));
  const fields: ConvertedFields = {
    subtitle: meaningful(meta.subtitle),
    composer: meaningful(meta.composer),
    importerVersion: IMPORTER_VERSION,
    museScoreVersion: meta.mscoreVersion,
    measures: countMeasures(doc) ?? meta.measures ?? 0,
    durationSec: timeline.totalMs ? Math.round(timeline.totalMs / 1000) : meta.duration,
    initialTempoBpm: meta.tempo,
    parts,
    rehearsalMarks: readRehearsalMarks(doc),
    hasMidi: !!midiChannels,
  };
  return { fields, title: meaningful(meta.title), musicXml: result.musicXml, timeline, midi: audio?.bytes };
}

/**
 * MIDI file to store and channels of each part; undefined without a readable MIDI file (no audio). Channels shared
 * by several parts in the engine's file (past 16) are separated first (midiChannels.ts).
 */
function readMidi(midi: Uint8Array | undefined, doc: Document, parts: Part[], drums: readonly (boolean | undefined)[]): { bytes: Uint8Array; channels: number[][] } | undefined {
  if (!midi?.length) return undefined;
  try {
    const file = parseMidi(midi);
    const owners = trackParts(file, staffCounts(doc), parts.map((p) => p.name));
    const separated = separatePartChannels(midi, owners, drums);
    const bytes = separated ?? midi;
    return { bytes, channels: channelsByPart(separated ? parseMidi(separated) : file, owners, parts.length) };
  } catch (e) {
    console.warn('unreadable MIDI file: no audio playback', e);
    return undefined;
  }
}

/** The MusicXML part has unpitched notes (drum kit), when the engine does not say. */
function hasUnpitchedNotes(doc: Document, partId: string): boolean | undefined {
  const part = Array.from(doc.getElementsByTagName('part')).find((p) => p.getAttribute('id') === partId);
  return part ? part.getElementsByTagName('unpitched').length > 0 : undefined;
}

/** "onlyfuhnbrass_-_medley_Russ.mscz" → "onlyfuhnbrass - medley Russ" */
function prettyFileName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

function firstPartMeasures(doc: Document): Element[] {
  const part = doc.getElementsByTagName('part')[0];
  return part ? Array.from(part.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).tagName === 'measure') : [];
}

function countMeasures(doc: Document): number | undefined {
  const n = firstPartMeasures(doc).length;
  return n > 0 ? n : undefined;
}

function readRehearsalMarks(doc: Document): Score['rehearsalMarks'] {
  const marks: Score['rehearsalMarks'] = [];
  firstPartMeasures(doc).forEach((measure, measureIndex) => {
    for (const r of Array.from(measure.getElementsByTagName('rehearsal'))) {
      const label = r.textContent?.trim();
      if (label) marks.push({ label, measureIndex });
    }
  });
  return marks;
}
