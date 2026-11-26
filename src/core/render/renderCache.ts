// Persistent cache of rendered pages (ADR-025): for a given display XML and set of Verovio options, the layout
// (page count, measure ids, page of each measure) and the SVG of every page rendered so far are kept on disk, so a
// score opened again with the same settings is shown without loading Verovio. Size-limited, least recently used
// entries evicted first. Stored in the app cache directory (Android may clear it; it is rebuilt on demand).
import type { FileStore } from '../storage/fileStore';

/** Layout of a score for one set of options. */
export interface CachedLayout {
  pageCount: number;
  /** MEI measure ids in document order. */
  measureIds: string[];
  /** Page (1-based) of each measure of `measureIds`. */
  measurePages: number[];
}

interface Entry {
  /** Bytes used on disk (layout + pages, UTF-16 length as an estimate). */
  bytes: number;
  lastUsed: number;
  pages: number[];
}

interface Index {
  version: 1;
  entries: Record<string, Entry>;
}

export const RENDER_CACHE_DIR = 'render-cache';
export const DEFAULT_RENDER_CACHE_BYTES = 64 * 1024 * 1024;
/** Bump when the worker's fixed options or the cached data change. */
const FORMAT = 1;

/** JSON with sorted keys, so the same options always give the same text. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Cache key of a rendering: hash of the display XML (parts, multi-rests, names… are all in it), of every Verovio
 * option (zoom, page size, transposition, font… whatever the options object holds) and of the renderer version.
 */
export async function renderKey(xmlHash: string, options: Record<string, unknown>, rendererVersion: string): Promise<string> {
  return (await sha256Hex(`${FORMAT}|${rendererVersion}|${xmlHash}|${stableJson(options)}`)).slice(0, 40);
}

export class RenderCache {
  private index: Promise<Index> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: FileStore,
    private readonly maxBytes = DEFAULT_RENDER_CACHE_BYTES,
    private readonly now: () => number = Date.now,
  ) {}

  async getLayout(key: string): Promise<CachedLayout | undefined> {
    const entry = (await this.loadIndex()).entries[key];
    if (!entry) return undefined;
    const text = await this.store.readText(`${this.dir(key)}/layout.json`).catch(() => undefined);
    if (!text) return void (await this.drop(key));
    entry.lastUsed = this.now();
    this.scheduleSave();
    return JSON.parse(text) as CachedLayout;
  }

  async putLayout(key: string, layout: CachedLayout): Promise<void> {
    const text = JSON.stringify(layout);
    await this.write(key, 'layout.json', text, () => undefined);
  }

  async getPage(key: string, page: number): Promise<string | undefined> {
    const entry = (await this.loadIndex()).entries[key];
    if (!entry?.pages.includes(page)) return undefined;
    const svg = await this.store.readText(`${this.dir(key)}/${page}.svg`).catch(() => undefined);
    if (!svg) {
      entry.pages = entry.pages.filter((p) => p !== page);
      this.scheduleSave();
      return undefined;
    }
    entry.lastUsed = this.now();
    this.scheduleSave();
    return svg;
  }

  async putPage(key: string, page: number, svg: string): Promise<void> {
    await this.write(key, `${page}.svg`, svg, (entry) => {
      if (!entry.pages.includes(page)) entry.pages.push(page);
    });
  }

  /** Space used on disk (estimate), in bytes. */
  async size(): Promise<number> {
    return Object.values((await this.loadIndex()).entries).reduce((sum, e) => sum + e.bytes, 0);
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      clearTimeout(this.saveTimer);
      await this.store.removeDir(RENDER_CACHE_DIR);
      this.index = Promise.resolve({ version: 1, entries: {} });
    });
  }

  /** Writes the index now (tests, or before the app goes to the background). */
  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    await this.enqueue(() => this.saveIndex());
  }

  private dir(key: string) {
    return `${RENDER_CACHE_DIR}/${key}`;
  }

  private write(key: string, file: string, text: string, update: (entry: Entry) => void): Promise<void> {
    return this.enqueue(async () => {
      const index = await this.loadIndex();
      // An entry written without its layout is useless: the layout is always written first.
      if (file !== 'layout.json' && !index.entries[key]) return;
      await this.store.writeText(`${this.dir(key)}/${file}`, text);
      const entry = (index.entries[key] ??= { bytes: 0, lastUsed: this.now(), pages: [] });
      entry.bytes += text.length;
      entry.lastUsed = this.now();
      update(entry);
      await this.evict(index, key);
      this.scheduleSave();
    });
  }

  /** Least recently used entries out until the cache fits in 90 % of its size (never the entry being written). */
  private async evict(index: Index, keep: string): Promise<void> {
    let total = Object.values(index.entries).reduce((sum, e) => sum + e.bytes, 0);
    if (total <= this.maxBytes) return;
    const byAge = Object.entries(index.entries)
      .filter(([k]) => k !== keep)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed);
    for (const [k, e] of byAge) {
      if (total <= this.maxBytes * 0.9) break;
      delete index.entries[k];
      total -= e.bytes;
      await this.store.removeDir(this.dir(k));
    }
  }

  private async drop(key: string): Promise<void> {
    const index = await this.loadIndex();
    delete index.entries[key];
    this.scheduleSave();
  }

  private loadIndex(): Promise<Index> {
    this.index ??= this.store
      .readText(`${RENDER_CACHE_DIR}/index.json`)
      .then((text) => {
        const parsed = text ? (JSON.parse(text) as Index) : undefined;
        return parsed?.version === 1 && parsed.entries ? parsed : { version: 1 as const, entries: {} };
      })
      .catch(() => ({ version: 1 as const, entries: {} }));
    return this.index;
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.enqueue(() => this.saveIndex()).catch(() => undefined), 1000);
  }

  private async saveIndex(): Promise<void> {
    const index = await this.loadIndex();
    await this.store.writeTextAtomic(`${RENDER_CACHE_DIR}/index.json`, JSON.stringify(index));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
