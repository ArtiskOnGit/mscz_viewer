import { create } from 'zustand';
import type { Score, ScoreId } from '../core/model/types';
import { libraryRepository, viewStateRepository } from '../core/services';
import { ImportError, importScore, type ImportInput } from '../core/import/importScore';
import { webMscoreEngine } from '../core/import/webmscoreEngine';

export interface ImportReport {
  imported: Score[];
  duplicates: Score[];
  failed: { name: string; code: ImportError['code'] | 'unknown' }[];
}

interface LibraryState {
  scores: Score[];
  loaded: boolean;
  importing: { done: number; total: number; current?: string } | undefined;
  load(): Promise<void>;
  importFiles(inputs: ImportInput[]): Promise<ImportReport>;
  rename(id: ScoreId, title: string): Promise<void>;
  remove(id: ScoreId): Promise<void>;
  markOpened(id: ScoreId): Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  scores: [],
  loaded: false,
  importing: undefined,

  async load() {
    set({ scores: await libraryRepository.list(), loaded: true });
  },

  async importFiles(inputs) {
    const report: ImportReport = { imported: [], duplicates: [], failed: [] };
    set({ importing: { done: 0, total: inputs.length } });
    try {
      for (const [i, input] of inputs.entries()) {
        set({ importing: { done: i, total: inputs.length, current: input.name } });
        try {
          const outcome = await importScore(input, { repo: libraryRepository, engine: webMscoreEngine });
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
    await get().load();
  },

  async markOpened(id) {
    await libraryRepository.update(id, { lastOpenedAt: new Date().toISOString() });
    await get().load();
  },
}));
