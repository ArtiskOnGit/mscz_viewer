// Per-score display settings (viewstates.json).
import type { ScoreId, ScoreViewState } from '../model/types';
import type { FileStore } from './fileStore';

const FILE = 'viewstates.json';

export function defaultViewState(scoreId: ScoreId): ScoreViewState {
  return {
    scoreId,
    selectedParts: [],
    transposeSemitones: 0,
    transposeOctave: 0,
    concertPitch: false,
    accidentalPreference: 'auto',
    zoom: 'auto',
    layoutMode: 'pages',
    lastPage: 1,
    tempoFactor: 1,
    metronomeEnabled: false,
  };
}

export class ViewStateRepository {
  private cache: Record<ScoreId, ScoreViewState> | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly fs: FileStore) {}

  async get(id: ScoreId): Promise<ScoreViewState> {
    const all = await this.all();
    return { ...defaultViewState(id), ...all[id] };
  }

  save(state: ScoreViewState): Promise<void> {
    return this.mutate((all) => ({ ...all, [state.scoreId]: state }));
  }

  remove(id: ScoreId): Promise<void> {
    return this.mutate((all) => {
      const { [id]: _removed, ...rest } = all;
      return rest;
    });
  }

  private async all() {
    if (!this.cache) {
      const text = await this.fs.readText(FILE);
      this.cache = text ? (JSON.parse(text) as Record<ScoreId, ScoreViewState>) : {};
    }
    return this.cache;
  }

  private mutate(fn: (all: Record<ScoreId, ScoreViewState>) => Record<ScoreId, ScoreViewState>): Promise<void> {
    const run = this.queue.then(async () => {
      const next = fn(await this.all());
      await this.fs.writeTextAtomic(FILE, JSON.stringify(next));
      this.cache = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
