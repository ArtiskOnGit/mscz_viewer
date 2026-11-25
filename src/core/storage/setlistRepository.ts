// Setlists (setlists.json): ordered lists of scores for a rehearsal or a concert. See ADR-011.
import type { ScoreId, Setlist, SetlistItem } from '../model/types';
import type { FileStore } from './fileStore';

const FILE = 'setlists.json';
const SCHEMA_VERSION = 1;

interface SetlistFile {
  schemaVersion: number;
  setlists: Setlist[];
}

export type SetlistOverride = NonNullable<SetlistItem['override']>;

export class SetlistRepository {
  private cache: Setlist[] | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly fs: FileStore,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  async list(): Promise<Setlist[]> {
    if (!this.cache) {
      const text = await this.fs.readText(FILE);
      const file = text ? (JSON.parse(text) as SetlistFile) : undefined;
      if (file && file.schemaVersion > SCHEMA_VERSION) throw new Error(`setlists.json schema ${file.schemaVersion} is newer than this app`);
      this.cache = file?.setlists ?? [];
    }
    return [...this.cache];
  }

  async get(id: string): Promise<Setlist | undefined> {
    return (await this.list()).find((s) => s.id === id);
  }

  async create(name: string, date?: string): Promise<Setlist> {
    const ts = this.now().toISOString();
    const setlist: Setlist = { id: this.newId(), name: name.trim(), ...(date ? { date } : {}), createdAt: ts, updatedAt: ts, items: [] };
    await this.mutate((all) => [...all, setlist]);
    return setlist;
  }

  rename(id: string, name: string): Promise<void> {
    return this.edit(id, (s) => ({ ...s, name: name.trim() || s.name }));
  }

  remove(id: string): Promise<void> {
    return this.mutate((all) => all.filter((s) => s.id !== id));
  }

  async duplicate(id: string, name: string): Promise<Setlist | undefined> {
    const src = await this.get(id);
    if (!src) return undefined;
    const ts = this.now().toISOString();
    const copy: Setlist = {
      ...src,
      id: this.newId(),
      name: name.trim() || src.name,
      createdAt: ts,
      updatedAt: ts,
      items: src.items.map((it) => ({ ...it, id: this.newId(), ...(it.override ? { override: { ...it.override } } : {}) })),
    };
    await this.mutate((all) => [...all, copy]);
    return copy;
  }

  /** Append scores (the same score may appear several times: encore, reprise). */
  addScores(id: string, scoreIds: readonly ScoreId[]): Promise<void> {
    return this.edit(id, (s) => ({ ...s, items: [...s.items, ...scoreIds.map((scoreId) => ({ id: this.newId(), scoreId }))] }));
  }

  removeItem(id: string, itemId: string): Promise<void> {
    return this.edit(id, (s) => ({ ...s, items: s.items.filter((it) => it.id !== itemId) }));
  }

  moveItem(id: string, from: number, to: number): Promise<void> {
    return this.edit(id, (s) => {
      const items = [...s.items];
      const [moved] = items.splice(from, 1);
      if (!moved) return s;
      items.splice(Math.max(0, Math.min(to, items.length)), 0, moved);
      return { ...s, items };
    });
  }

  setNote(id: string, itemId: string, note: string): Promise<void> {
    return this.editItem(id, itemId, (it) => {
      const { note: _old, ...rest } = it;
      return note.trim() ? { ...rest, note: note.trim() } : rest;
    });
  }

  /** Merge into the item override; keys set to undefined are removed; an empty override is dropped. */
  setOverride(id: string, itemId: string, patch: SetlistOverride): Promise<void> {
    return this.editItem(id, itemId, (it) => {
      const merged: Record<string, unknown> = { ...it.override, ...patch };
      for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
      const { override: _old, ...rest } = it;
      return Object.keys(merged).length ? { ...rest, override: merged as SetlistOverride } : rest;
    });
  }

  /** Remove a deleted score from every setlist. Returns the names of the setlists that contained it. */
  async removeScoreEverywhere(scoreId: ScoreId): Promise<string[]> {
    const affected = (await this.list()).filter((s) => s.items.some((it) => it.scoreId === scoreId));
    if (!affected.length) return [];
    const ts = this.now().toISOString();
    const ids = new Set(affected.map((a) => a.id));
    await this.mutate((all) => all.map((s) => (ids.has(s.id) ? { ...s, updatedAt: ts, items: s.items.filter((it) => it.scoreId !== scoreId) } : s)));
    return affected.map((s) => s.name);
  }

  private editItem(id: string, itemId: string, fn: (item: SetlistItem) => SetlistItem): Promise<void> {
    return this.edit(id, (s) => ({ ...s, items: s.items.map((it) => (it.id === itemId ? fn(it) : it)) }));
  }

  private edit(id: string, fn: (s: Setlist) => Setlist): Promise<void> {
    return this.mutate((all) => all.map((s) => (s.id === id ? { ...fn(s), updatedAt: this.now().toISOString() } : s)));
  }

  private mutate(fn: (all: Setlist[]) => Setlist[]): Promise<void> {
    const run = this.queue.then(async () => {
      const next = fn(await this.list());
      await this.fs.writeTextAtomic(FILE, JSON.stringify({ schemaVersion: SCHEMA_VERSION, setlists: next } satisfies SetlistFile));
      this.cache = next;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
