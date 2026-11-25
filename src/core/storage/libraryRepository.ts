// Library index (library.json) + per-score files. See SPECIFICATIONS_TECHNIQUES §3.2.
import type { Score, ScoreId, Timeline } from '../model/types';
import type { FileStore } from './fileStore';

const INDEX = 'library.json';
const SCHEMA_VERSION = 1;

interface IndexFile {
  schemaVersion: number;
  scores: Score[];
}

export const scorePaths = (id: ScoreId) => ({
  dir: `scores/${id}`,
  original: (ext: string) => `scores/${id}/original.${ext}`,
  musicXml: `scores/${id}/score.musicxml`,
  timeline: `scores/${id}/timeline.json`,
  thumbnail: `scores/${id}/thumbnail.png`,
});

export interface NewScoreFiles {
  original: { bytes: Uint8Array; ext: string };
  musicXml: string;
  timeline: Timeline;
  thumbnail?: Uint8Array;
}

export class LibraryRepository {
  private cache: Score[] | undefined;
  /** Serializes index writes. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly fs: FileStore) {}

  async list(): Promise<Score[]> {
    if (!this.cache) {
      const text = await this.fs.readText(INDEX);
      this.cache = text ? migrate(JSON.parse(text) as IndexFile).scores : [];
    }
    return [...this.cache];
  }

  async get(id: ScoreId): Promise<Score | undefined> {
    return (await this.list()).find((s) => s.id === id);
  }

  async findByHash(hash: string): Promise<Score | undefined> {
    return (await this.list()).find((s) => s.sourceHash === hash);
  }

  /** Write the score files first, then the index: an interrupted import leaves no ghost entry. */
  async add(score: Score, files: NewScoreFiles): Promise<void> {
    const p = scorePaths(score.id);
    await this.fs.writeBytes(p.original(files.original.ext), files.original.bytes);
    await this.fs.writeText(p.musicXml, files.musicXml);
    await this.fs.writeText(p.timeline, JSON.stringify(files.timeline));
    if (files.thumbnail) await this.fs.writeBytes(p.thumbnail, files.thumbnail);
    await this.mutate((scores) => [...scores, score]);
  }

  /** Replace the generated files and the entry of an existing score (re-import). */
  async replace(score: Score, files: Omit<NewScoreFiles, 'original'>): Promise<void> {
    const p = scorePaths(score.id);
    await this.fs.writeText(p.musicXml, files.musicXml);
    await this.fs.writeText(p.timeline, JSON.stringify(files.timeline));
    if (files.thumbnail) await this.fs.writeBytes(p.thumbnail, files.thumbnail);
    await this.mutate((scores) => scores.map((s) => (s.id === score.id ? score : s)));
  }

  readOriginal(score: Score): Promise<Uint8Array | undefined> {
    const ext = score.sourceFileName.includes('.') ? score.sourceFileName.split('.').pop()!.toLowerCase() : score.sourceFormat;
    return this.fs.readBytes(scorePaths(score.id).original(ext));
  }

  async update(id: ScoreId, patch: Partial<Omit<Score, 'id'>>): Promise<void> {
    await this.mutate((scores) => scores.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async remove(id: ScoreId): Promise<void> {
    await this.mutate((scores) => scores.filter((s) => s.id !== id));
    await this.fs.removeDir(scorePaths(id).dir);
  }

  readMusicXml(id: ScoreId): Promise<string | undefined> {
    return this.fs.readText(scorePaths(id).musicXml);
  }

  async readTimeline(id: ScoreId): Promise<Timeline | undefined> {
    const text = await this.fs.readText(scorePaths(id).timeline);
    return text ? (JSON.parse(text) as Timeline) : undefined;
  }

  readThumbnail(id: ScoreId): Promise<Uint8Array | undefined> {
    return this.fs.readBytes(scorePaths(id).thumbnail);
  }

  private mutate(fn: (scores: Score[]) => Score[]): Promise<void> {
    const run = this.queue.then(async () => {
      const next = fn(await this.list());
      await this.fs.writeTextAtomic(INDEX, JSON.stringify({ schemaVersion: SCHEMA_VERSION, scores: next } satisfies IndexFile));
      this.cache = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function migrate(file: IndexFile): IndexFile {
  if (file.schemaVersion > SCHEMA_VERSION) throw new Error(`library.json schema ${file.schemaVersion} is newer than this app`);
  // Future migrations go here (schemaVersion 1 → 2 …).
  return file;
}
