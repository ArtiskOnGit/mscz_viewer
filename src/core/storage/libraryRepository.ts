// Library index (library.json) + per-score files. See SPECIFICATIONS_TECHNIQUES §3.2.
import type { Folder, FolderId, Score, ScoreId, Timeline } from '../model/types';
import { isInside, sanitizeFolders, withoutFolder, withoutParent } from '../model/folders';
import type { FileStore } from './fileStore';

const INDEX = 'library.json';
/** 2: folders (ADR-029). */
export const LIBRARY_SCHEMA_VERSION = 2;

export interface LibraryIndex {
  scores: Score[];
  folders: Folder[];
}

interface IndexFile {
  schemaVersion: number;
  scores: Score[];
  /** Since schema 2. */
  folders?: Folder[];
}

/** Moving a folder into itself or one of its sub-folders. */
export class FolderCycleError extends Error {
  constructor() {
    super('a folder cannot be moved into itself or one of its sub-folders');
    this.name = 'FolderCycleError';
  }
}

export const scorePaths = (id: ScoreId) => ({
  dir: `scores/${id}`,
  original: (ext: string) => `scores/${id}/original.${ext}`,
  musicXml: `scores/${id}/score.musicxml`,
  timeline: `scores/${id}/timeline.json`,
  midi: `scores/${id}/score.mid`,
  thumbnail: `scores/${id}/thumbnail.png`,
});

export interface NewScoreFiles {
  original: { bytes: Uint8Array; ext: string };
  musicXml: string;
  timeline: Timeline;
  midi?: Uint8Array;
  thumbnail?: Uint8Array;
}

export class LibraryRepository {
  private cache: LibraryIndex | undefined;
  /** Serializes index writes. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly fs: FileStore,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private async index(): Promise<LibraryIndex> {
    if (!this.cache) {
      const text = await this.fs.readText(INDEX);
      this.cache = text ? migrate(JSON.parse(text) as IndexFile) : { scores: [], folders: [] };
    }
    return this.cache;
  }

  async list(): Promise<Score[]> {
    return [...(await this.index()).scores];
  }

  async listFolders(): Promise<Folder[]> {
    return [...(await this.index()).folders];
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
    if (files.midi) await this.fs.writeBytes(p.midi, files.midi);
    if (files.thumbnail) await this.fs.writeBytes(p.thumbnail, files.thumbnail);
    await this.mutateScores((scores) => [...scores, score]);
  }

  /** Replace the generated files and the entry of an existing score (re-import). */
  async replace(score: Score, files: Omit<NewScoreFiles, 'original'>): Promise<void> {
    const p = scorePaths(score.id);
    await this.fs.writeText(p.musicXml, files.musicXml);
    await this.fs.writeText(p.timeline, JSON.stringify(files.timeline));
    if (files.midi) await this.fs.writeBytes(p.midi, files.midi);
    else await this.fs.removeFile(p.midi);
    if (files.thumbnail) await this.fs.writeBytes(p.thumbnail, files.thumbnail);
    await this.mutateScores((scores) => scores.map((s) => (s.id === score.id ? score : s)));
  }

  readOriginal(score: Score): Promise<Uint8Array | undefined> {
    const ext = score.sourceFileName.includes('.') ? score.sourceFileName.split('.').pop()!.toLowerCase() : score.sourceFormat;
    return this.fs.readBytes(scorePaths(score.id).original(ext));
  }

  async update(id: ScoreId, patch: Partial<Omit<Score, 'id'>>): Promise<void> {
    await this.mutateScores((scores) => scores.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async remove(id: ScoreId): Promise<void> {
    await this.mutateScores((scores) => scores.filter((s) => s.id !== id));
    await this.fs.removeDir(scorePaths(id).dir);
  }

  readMusicXml(id: ScoreId): Promise<string | undefined> {
    return this.fs.readText(scorePaths(id).musicXml);
  }

  async readTimeline(id: ScoreId): Promise<Timeline | undefined> {
    const text = await this.fs.readText(scorePaths(id).timeline);
    return text ? (JSON.parse(text) as Timeline) : undefined;
  }

  /** MIDI file of the score (repeats unfolded), for audio playback. */
  readMidi(id: ScoreId): Promise<Uint8Array | undefined> {
    return this.fs.readBytes(scorePaths(id).midi);
  }

  readThumbnail(id: ScoreId): Promise<Uint8Array | undefined> {
    return this.fs.readBytes(scorePaths(id).thumbnail);
  }

  // --- Folders (ADR-029) ---

  /** New folder in `parentId` (undefined or an unknown folder = the root). An empty name is refused. */
  async createFolder(name: string, parentId?: FolderId): Promise<Folder> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('empty folder name');
    let folder: Folder | undefined;
    await this.mutate((index) => {
      folder = { id: this.newId(), name: trimmed, createdAt: this.now().toISOString() };
      if (parentId && index.folders.some((f) => f.id === parentId)) folder.parentId = parentId;
      return { ...index, folders: [...index.folders, folder] };
    });
    return folder!;
  }

  /** An empty name keeps the previous one. */
  async renameFolder(id: FolderId, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    await this.mutate((index) => ({ ...index, folders: index.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)) }));
  }

  /** Deletes a folder only: its scores and sub-folders move to its parent folder (never deletes a score). */
  async deleteFolder(id: FolderId): Promise<void> {
    await this.mutate((index) => {
      const folder = index.folders.find((f) => f.id === id);
      if (!folder) return index;
      const up = folder.parentId;
      return {
        folders: index.folders
          .filter((f) => f.id !== id)
          .map((f) => (f.parentId === id ? (up ? { ...f, parentId: up } : withoutParent(f)) : f)),
        scores: index.scores.map((s) => (s.folderId === id ? (up ? { ...s, folderId: up } : withoutFolder(s)) : s)),
      };
    });
  }

  /** Moves scores into a folder (undefined = the root). An unknown folder is refused. */
  async moveScores(ids: readonly ScoreId[], folderId: FolderId | undefined): Promise<void> {
    const moving = new Set(ids);
    await this.mutate((index) => {
      if (folderId && !index.folders.some((f) => f.id === folderId)) throw new Error(`unknown folder ${folderId}`);
      return {
        ...index,
        scores: index.scores.map((s) => (moving.has(s.id) ? (folderId ? { ...s, folderId } : withoutFolder(s)) : s)),
      };
    });
  }

  /** Moves a folder into another (undefined = the root). Throws FolderCycleError for itself or a sub-folder. */
  async moveFolder(id: FolderId, parentId: FolderId | undefined): Promise<void> {
    await this.mutate((index) => {
      if (parentId && !index.folders.some((f) => f.id === parentId)) throw new Error(`unknown folder ${parentId}`);
      if (parentId && isInside(index.folders, parentId, id)) throw new FolderCycleError();
      return {
        ...index,
        folders: index.folders.map((f) => (f.id === id ? (parentId ? { ...f, parentId } : withoutParent(f)) : f)),
      };
    });
  }

  private mutateScores(fn: (scores: Score[]) => Score[]): Promise<void> {
    return this.mutate((index) => ({ ...index, scores: fn(index.scores) }));
  }

  private mutate(fn: (index: LibraryIndex) => LibraryIndex): Promise<void> {
    const run = this.queue.then(async () => {
      const next = fn(await this.index());
      const file: IndexFile = { schemaVersion: LIBRARY_SCHEMA_VERSION, scores: next.scores, folders: next.folders };
      await this.fs.writeTextAtomic(INDEX, JSON.stringify(file));
      this.cache = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Upgrades library.json from an older schema (the file is rewritten at the next change). */
export function migrate(file: IndexFile): LibraryIndex {
  if (file.schemaVersion > LIBRARY_SCHEMA_VERSION) throw new Error(`library.json schema ${file.schemaVersion} is newer than this app`);
  // 1 → 2: folders. Existing scores have no folderId: they stay at the root.
  const folders = file.schemaVersion < 2 ? [] : (file.folders ?? []);
  return sanitizeFolders(folders, file.scores ?? []);
}
