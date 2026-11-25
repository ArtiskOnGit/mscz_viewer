import { create } from 'zustand';
import type { ScoreId, Setlist } from '../core/model/types';
import { setlistRepository } from '../core/services';
import type { SetlistOverride } from '../core/storage/setlistRepository';

interface SetlistState {
  setlists: Setlist[];
  loaded: boolean;
  load(): Promise<void>;
  create(name: string): Promise<Setlist>;
  rename(id: string, name: string): Promise<void>;
  duplicate(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  addScores(id: string, scoreIds: ScoreId[]): Promise<void>;
  removeItem(id: string, itemId: string): Promise<void>;
  moveItem(id: string, from: number, to: number): Promise<void>;
  setNote(id: string, itemId: string, note: string): Promise<void>;
  setOverride(id: string, itemId: string, override: SetlistOverride): Promise<void>;
  /** Called when a score is deleted from the library. Returns the names of the affected setlists. */
  removeScore(scoreId: ScoreId): Promise<string[]>;
}

export const useSetlists = create<SetlistState>((set, get) => {
  const refresh = async () => set({ setlists: await setlistRepository.list(), loaded: true });
  const after = <A extends unknown[]>(fn: (...args: A) => Promise<unknown>) => async (...args: A) => {
    await fn(...args);
    await refresh();
  };
  return {
    setlists: [],
    loaded: false,
    load: refresh,
    async create(name) {
      const s = await setlistRepository.create(name);
      await refresh();
      return s;
    },
    rename: after((id: string, name: string) => setlistRepository.rename(id, name)),
    duplicate: after((id: string, name: string) => setlistRepository.duplicate(id, name)),
    remove: after((id: string) => setlistRepository.remove(id)),
    addScores: after((id: string, scoreIds: ScoreId[]) => setlistRepository.addScores(id, scoreIds)),
    removeItem: after((id: string, itemId: string) => setlistRepository.removeItem(id, itemId)),
    moveItem: after((id: string, from: number, to: number) => setlistRepository.moveItem(id, from, to)),
    setNote: after((id: string, itemId: string, note: string) => setlistRepository.setNote(id, itemId, note)),
    setOverride: after((id: string, itemId: string, override: SetlistOverride) => setlistRepository.setOverride(id, itemId, override)),
    async removeScore(scoreId) {
      const affected = await setlistRepository.removeScoreEverywhere(scoreId);
      if (affected.length || get().loaded) await refresh();
      return affected;
    },
  };
});
