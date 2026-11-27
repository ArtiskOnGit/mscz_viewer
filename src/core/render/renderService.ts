// Main-thread side of the renderer: options from the screen/zoom, page cache, pre-rendering.
import * as Comlink from 'comlink';
import type { LayoutInfo, RenderApi } from './render.worker';
import { targetFifths, transposeInterval, type AccidentalPreference } from '../music/keys';
import { renderKey, sha256Hex, stableJson, type RenderCache } from './renderCache';
import { engravingOptions, type EngravingSettings } from './engraving';

export interface ViewportOptions {
  width: number;
  height: number;
  /** Verovio scale (percent); see autoScale(). */
  scale: number;
  /** Verovio "transpose" option ("" = none), e.g. "+2", "-3". */
  transpose: string;
  concertPitch: boolean;
  /** Continuous mode: pages fitted to their content (stacked vertically by the viewer). */
  continuous?: boolean;
  /** Music font, bar numbers, title (settings). */
  engraving?: EngravingSettings;
}

/** Comfortable default scale for the number of staves shown, relative to a 412 px wide phone. */
export function autoScale(staves: number, width: number): number {
  const base = staves <= 1 ? 48 : staves === 2 ? 42 : staves <= 4 ? 34 : staves <= 8 ? 25 : 20;
  return clamp(Math.round(base * Math.min(2, Math.max(0.75, width / 412))), 15, 120);
}

export function verovioOptions(v: ViewportOptions): Record<string, unknown> {
  const margin = 40;
  return {
    scale: v.scale,
    pageWidth: Math.max(400, Math.round((v.width * 100) / v.scale)),
    pageHeight: Math.max(400, Math.round((v.height * 100) / v.scale)),
    pageMarginTop: margin,
    pageMarginBottom: margin,
    pageMarginLeft: margin,
    pageMarginRight: margin,
    breaks: 'auto', // ADR-002: always lay out for the screen
    // Continuous mode: no blank space at the bottom of the pages, which are stacked into one vertical scroll.
    adjustPageHeight: !!v.continuous,
    footer: 'none',
    svgViewBox: true,
    // The "//" system separators only make sense on printed full scores.
    systemDivider: 'none',
    transpose: v.transpose,
    transposeToSoundingPitch: v.concertPitch,
    ...engravingOptions(v.engraving), // font, mnumInterval, header
  };
}

/** What the worker must hold for a request: display XML and Verovio options (captured when the request is made). */
interface Target {
  xml: string;
  options: Record<string, unknown>;
  json: string;
  /** Disk cache key of this layout, if known when the request was made. */
  key: string | undefined;
  generation: number;
}

/** A request made for a layout that has been replaced since (its result would be of no use). */
export class StaleRenderError extends Error {
  constructor() {
    super('Render request superseded by a new layout');
    this.name = 'StaleRenderError';
  }
}

/**
 * Verovio's answer for a page that does not exist in its layout is an empty `<svg viewBox="0 0 0 0">`, drawn as a
 * blank page: never shown nor cached (iPhone bug, Motorcrypt: blank page "37 / 52").
 */
export function isBlankPage(svg: string | undefined): boolean {
  return !svg || /<svg\b[^>]*\bviewBox="0 0 0 0"/.test(svg.slice(0, 400)) || !/\bclass="(?:page-margin|system|measure)\b/.test(svg);
}

// --- render cache (ADR-025): layout and pages served from disk when this display XML + options were seen before ---
export class RenderService {
  private api: RenderApi | undefined;
  private terminate: (() => void) | undefined;
  private cache = new Map<number, Promise<string>>();
  private gen = 0;
  layout: LayoutInfo = { pageCount: 0, measureIds: [], measurePages: [] };
  private xml: string | undefined;
  private xmlHash: Promise<string> | undefined;
  private options: Record<string, unknown> = {};
  /** Disk cache key of the current layout (undefined without a disk cache). */
  private key: string | undefined;
  /** Layout last asked for (load / relayout), resolved once laid out (from disk or by the worker). */
  private requested: Promise<LayoutInfo> | undefined;
  /**
   * What the Verovio worker holds (it may lag behind a layout served from disk). Worker operations run one at a
   * time (`exclusive`), each bringing the worker to the XML and options of its own request first: a page is always
   * drawn from the layout it was asked for, even when the layout changes meanwhile (A → B → A viewport changes).
   */
  private worked: { xml: string; json: string; layout: LayoutInfo } | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly disk?: RenderCache | null,
    /** Tests: a fake Verovio. */
    private readonly createApi: () => { api: RenderApi; terminate(): void } = workerApi,
  ) {}

  /** Incremented by every load / relayout / restart: a result obtained under another generation is outdated. */
  get generation(): number {
    return this.gen;
  }

  private remote(): RenderApi {
    if (!this.api) {
      const { api, terminate } = this.createApi();
      this.api = api;
      this.terminate = terminate;
    }
    return this.api;
  }

  /** Starts the worker and Verovio (WASM) in the background, while the score files are read and prepared. */
  warmUp(): Promise<void> {
    return this.remote()
      .version()
      .then(() => undefined, () => undefined);
  }

  load(xml: string, viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    // A load means new content (parts, transposition…: options applied by loadData only), never a mere relayout.
    this.worked = undefined;
    if (xml !== this.xml) {
      this.xml = xml;
      this.xmlHash = this.disk ? sha256Hex(xml) : undefined;
    }
    return (this.requested = this.layoutFor(verovioOptions(viewport)));
  }

  relayout(viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    return (this.requested = this.layoutFor(verovioOptions(viewport)));
  }

  /** The layout last asked for (load / relayout), once ready. */
  current(): Promise<LayoutInfo> {
    return this.requested ?? Promise.resolve(this.layout);
  }

  private target(): Target {
    const xml = this.xml;
    if (xml === undefined) throw new Error('RenderService: nothing loaded');
    return { xml, options: this.options, json: stableJson(this.options), key: this.key, generation: this.gen };
  }

  private async layoutFor(options: Record<string, unknown>): Promise<LayoutInfo> {
    // Synchronous up to the first await: from now on, requests are made for these options.
    this.options = options;
    this.key = undefined;
    const gen = this.gen;
    const target = this.target();
    let key: string | undefined;
    if (this.disk && this.xmlHash) {
      try {
        key = await renderKey(await this.xmlHash, options, RENDERER_VERSION);
        const cached = await this.disk.getLayout(key);
        if (cached && gen === this.gen) {
          this.key = key;
          this.layout = cached;
          return cached;
        }
      } catch (e) {
        console.warn('render cache unavailable', e);
        key = undefined;
      }
    }
    const layout = await this.exclusive(() => this.bring(target));
    if (gen === this.gen) {
      this.key = key;
      this.layout = layout;
      if (key) void this.disk?.putLayout(key, layout).catch(() => undefined);
    }
    return layout;
  }

  /** Runs worker operations one after the other. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Brings the worker to a request's XML and options (load, or relayout when only the options changed). Exclusive. */
  private async bring(t: Target): Promise<LayoutInfo> {
    const w = this.worked;
    if (w && w.xml === t.xml && w.json === t.json) return w.layout;
    this.worked = undefined; // until done: after a failure the worker state is unknown, the next request loads again
    const layout = w?.xml === t.xml ? await this.remote().relayout(t.options) : await this.remote().load(t.xml, t.options);
    this.worked = { xml: t.xml, json: t.json, layout };
    return layout;
  }

  /** SVG of a page (1-based) of the current layout, cached until the next layout. */
  page(n: number): Promise<string> {
    let svg = this.cache.get(n);
    if (!svg) {
      svg = this.renderPage(n, this.target());
      this.cache.set(n, svg);
      svg.catch(() => this.cache.get(n) === svg && this.cache.delete(n));
    }
    return svg;
  }

  private async renderPage(n: number, t: Target): Promise<string> {
    if (t.key && this.disk) {
      const hit = await this.disk.getPage(t.key, n).catch(() => undefined);
      if (hit && !isBlankPage(hit)) return hit;
    }
    const svg = await this.exclusive(async () => {
      // Superseded meanwhile (zoom, rotation…): not worth laying the worker out again for it.
      if (t.generation !== this.gen) throw new StaleRenderError();
      const layout = await this.bring(t);
      if (n < 1 || n > layout.pageCount) throw new RangeError(`Page ${n} does not exist (${layout.pageCount} pages)`);
      return this.remote().renderPage(n);
    });
    if (isBlankPage(svg)) throw new Error(`Verovio drew page ${n} blank`);
    // Drawn from the request's own layout: stored under that layout's key, whatever the current one.
    if (t.key && this.disk) void this.disk.putPage(t.key, n, svg).catch(() => undefined);
    return svg;
  }

  /** Render neighbours in the background so page turns are instant. */
  prefetch(around: number): void {
    const gen = this.gen;
    for (const n of [around + 1, around - 1, around + 2]) {
      if (n >= 1 && n <= this.layout.pageCount && gen === this.gen) void this.page(n).catch(() => undefined);
    }
  }

  /** Page of each element; measures are answered from the layout (no worker needed). */
  async pagesOf(elementIds: string[]): Promise<number[]> {
    const { measureIds, measurePages } = this.layout;
    const index = new Map(measureIds.map((id, i) => [id, i]));
    if (elementIds.every((id) => index.has(id))) return elementIds.map((id) => measurePages[index.get(id)!] ?? 0);
    const t = this.target();
    return this.exclusive(async () => {
      await this.bring(t);
      return this.remote().pagesOf(elementIds);
    });
  }

  async pageOf(elementId: string): Promise<number> {
    return (await this.pagesOf([elementId]))[0] ?? 0;
  }

  /**
   * New worker (a page could not be drawn, or the worker stopped answering): the next request loads the score in
   * it again. The layout and the disk cache are kept.
   */
  restart(): void {
    this.dispose();
  }

  dispose(): void {
    this.terminate?.();
    this.terminate = undefined;
    this.api = undefined;
    this.worked = undefined;
    this.queue = Promise.resolve(); // operations pending in a terminated worker never settle
    this.invalidate();
  }

  private invalidate() {
    this.gen++;
    this.cache.clear();
  }
}

function workerApi() {
  const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('error', (e) => console.error('Render worker error', e.message || e));
  // Every method of the API already returns a promise: the Comlink proxy has the same shape.
  return { api: Comlink.wrap<RenderApi>(worker) as unknown as RenderApi, terminate: () => worker.terminate() };
}

/** Verovio build: part of the render cache key (a new Verovio may lay out differently). */
const RENDERER_VERSION = `${__VEROVIO_VERSION__}/${__APP_VERSION__}`;
// --- end render cache ---

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** First measure id of an SVG page (to keep the musical position across relayouts). */
export function firstMeasureId(svg: string): string | undefined {
  return /<g\b[^>]*\bid="([^"]+)"[^>]*\bclass="measure\b/.exec(svg)?.[1] ?? /<g\b[^>]*\bclass="measure\b[^"]*"[^>]*\bid="([^"]+)"/.exec(svg)?.[1];
}

/**
 * Semitones + octaves → Verovio "transpose" option. With the written key known, an interval name ("m2", "-A1"…)
 * is passed instead of a semitone count, so that the resulting key is the one shown in the Transpose dialog and
 * follows the accidental preference (D♭ or C♯…). Verovio also accepts a key name ("Db"), but without octave control.
 */
export function transposeOption(semitones: number, octaves: number, key?: { fifths: number }, preference: AccidentalPreference = 'auto'): string {
  const total = semitones + 12 * octaves;
  const plain = total === 0 ? '' : total > 0 ? `+${total}` : `${total}`;
  if (!key) return plain;
  const to = targetFifths(key.fifths, total, preference);
  if (total === 0 && to === key.fifths) return '';
  return transposeInterval(key.fifths, to, total) ?? plain;
}
