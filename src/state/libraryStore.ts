import { create } from 'zustand';
import type { Folder, FolderId, Score, ScoreId } from '../core/model/types';
import { libraryRepository, viewStateRepository } from '../core/services';
import { IMPORTER_VERSION, ImportError, importScore, reimportScore, type ImportInput } from '../core/import/importScore';
import { webMscoreEngine } from '../core/import/webmscoreEngine';
import { useSetlists } from './setlistStore';

export interface ImportReport {
  imported: Score[];
  duplicates: Score[];
  failed: { name: string; code: ImportError['code'] | 'unknown' }[];
}

interface LibraryState {
  scores: Score[];
  folders: Folder[];
  loaded: boolean;
  importing: { done: number; total: number; current?: string } | undefined;
  /** Re-import of scores converted by an older pipeline. */
  upgrading: { done: number; total: number } | undefined;
  load(): Promise<void>;
  upgrade(outdated: Score[]): Promise<void>;
  /** Imports into `folderId` (undefined = the root of the library). */
  importFiles(inputs: ImportInput[], folderId?: FolderId): Promise<ImportReport>;
  rename(id: ScoreId, title: string): Promise<void>;
  remove(id: ScoreId): Promise<void>;
  markOpened(id: ScoreId): Promise<void>;
  createFolder(name: string, parentId?: FolderId): Promise<Folder>;
  renameFolder(id: FolderId, name: string): Promise<void>;
  /** Its scores and sub-folders move to its parent folder. */
  deleteFolder(id: FolderId): Promise<void>;
  moveScores(ids: readonly ScoreId[], folderId: FolderId | undefined): Promise<void>;
  /** Rejects with FolderCycleError for the folder itself or one of its sub-folders. */
  moveFolder(id: FolderId, parentId: FolderId | undefined): Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  scores: [],
  folders: [],
  loaded: false,
  importing: undefined,
  upgrading: undefined,

  async load() {
    const [scores, folders] = await Promise.all([libraryRepository.list(), libraryRepository.listFolders()]);
    set({ scores, folders, loaded: true });
    const outdated = scores.filter((s) => s.importerVersion < IMPORTER_VERSION);
    if (outdated.length && !get().upgrading) void get().upgrade(outdated);
  },

  async upgrade(outdated) {
    set({ upgrading: { done: 0, total: outdated.length } });
    try {
      for (const [i, score] of outdated.entries()) {
        set({ upgrading: { done: i, total: outdated.length } });
        try {
          await reimportScore(score, { repo: libraryRepository, engine: webMscoreEngine });
        } catch (e) {
          // Keep the previous conversion: still displayable.
          console.error('re-import failed', score.sourceFileName, e);
        }
      }
    } finally {
      set({ upgrading: undefined, scores: await libraryRepository.list() });
    }
  },

  async importFiles(inputs, folderId) {
    const report: ImportReport = { imported: [], duplicates: [], failed: [] };
    set({ importing: { done: 0, total: inputs.length } });
    try {
      for (const [i, input] of inputs.entries()) {
        set({ importing: { done: i, total: inputs.length, current: input.name } });
        try {
          const outcome = await importScore(input, { repo: libraryRepository, engine: webMscoreEngine, folderId });
          if (outcome.status === 'imported') report.imported.push(outcome.score);
          else report.duplicates.push(outcome.existing);
        } catch (e) {
          console.error('import failed', input.name, e);
          report.failed.push({ name: input.name, code: e instanceof ImportError ? e.code : 'unknown' });
        }
      }
    } finally {
      set({ importing: undefined });
      await get().load();
    }
    return report;
  },

  async rename(id, title) {
    const score = await libraryRepository.get(id);
    if (!score) return;
    // An empty name restores the original title.
    await libraryRepository.update(id, { title: title.trim() || score.originalTitle });
    await get().load();
  },

  async remove(id) {
    await libraryRepository.remove(id);
    await viewStateRepository.remove(id);
    await useSetlists.getState().removeScore(id);
    await get().load();
  },

  async markOpened(id) {
    await libraryRepository.update(id, { lastOpenedAt: new Date().toISOString() });
    await get().load();
  },

  async createFolder(name, parentId) {
    const folder = await libraryRepository.createFolder(name, parentId);
    await get().load();
    return folder;
  },

  async renameFolder(id, name) {
    await libraryRepository.renameFolder(id, name);
    await get().load();
  },

  async deleteFolder(id) {
    await libraryRepository.deleteFolder(id);
    await get().load();
  },

  async moveScores(ids, folderId) {
    await libraryRepository.moveScores(ids, folderId);
    await get().load();
  },

  async moveFolder(id, parentId) {
    await libraryRepository.moveFolder(id, parentId);
    await get().load();
  },
}));
