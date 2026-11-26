// Main-thread side of the renderer: options from the screen/zoom, page cache, pre-rendering.
import * as Comlink from 'comlink';
import type { LayoutInfo, RenderApi } from './render.worker';
import { targetFifths, transposeInterval, type AccidentalPreference } from '../music/keys';
import { renderKey, sha256Hex, stableJson, type RenderCache } from './renderCache';

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
    header: 'none',
    footer: 'none',
    svgViewBox: true,
    // The "//" system separators only make sense on printed full scores.
    systemDivider: 'none',
    transpose: v.transpose,
    transposeToSoundingPitch: v.concertPitch,
  };
}

// --- render cache (ADR-025): layout and pages served from disk when this display XML + options were seen before ---
export class RenderService {
  private worker: Worker | undefined;
  private api: Comlink.Remote<RenderApi> | undefined;
  private cache = new Map<number, Promise<string>>();
  private generation = 0;
  layout: LayoutInfo = { pageCount: 0, measureIds: [], measurePages: [] };
  private xml: string | undefined;
  private xmlHash: Promise<string> | undefined;
  private options: Record<string, unknown> = {};
  /** Disk cache key of the current layout (undefined without a disk cache). */
  private key: string | undefined;
  /** What the Verovio worker holds: loaded XML and laid-out options (it may lag behind a layout served from disk). */
  private worked: { xml: string; options: string; layout: Promise<LayoutInfo> } | undefined;

  constructor(private readonly disk?: RenderCache | null) {}

  private remote(): Comlink.Remote<RenderApi> {
    if (!this.api) {
      this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      this.api = Comlink.wrap<RenderApi>(this.worker);
    }
    return this.api;
  }

  /** Starts the worker and Verovio (WASM) in the background, while the score files are read and prepared. */
  warmUp(): Promise<void> {
    return this.remote()
      .version()
      .then(() => undefined, () => undefined);
  }

  async load(xml: string, viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    // A load means new content (parts, transposition…: options applied by loadData only), never a mere relayout.
    this.worked = undefined;
    if (xml !== this.xml) {
      this.xml = xml;
      this.xmlHash = this.disk ? sha256Hex(xml) : undefined;
    }
    return this.layoutFor(verovioOptions(viewport));
  }

  async relayout(viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    return this.layoutFor(verovioOptions(viewport));
  }

  private async layoutFor(options: Record<string, unknown>): Promise<LayoutInfo> {
    this.options = options;
    this.key = undefined;
    const gen = this.generation;
    let key: string | undefined;
    if (this.disk && this.xmlHash) {
      try {
        key = await renderKey(await this.xmlHash, options, RENDERER_VERSION);
        const cached = await this.disk.getLayout(key);
        if (cached && gen === this.generation) {
          this.key = key;
          this.layout = cached;
          return cached;
        }
      } catch (e) {
        console.warn('render cache unavailable', e);
        key = undefined;
      }
    }
    const layout = await this.ensureWorker();
    if (gen === this.generation) {
      this.key = key;
      this.layout = layout;
      if (key) void this.disk?.putLayout(key, layout).catch(() => undefined);
    }
    return layout;
  }

  /** Brings the worker to the current XML and options (load, or relayout when only the options changed). */
  private ensureWorker(): Promise<LayoutInfo> {
    const xml = this.xml;
    if (xml === undefined) return Promise.reject(new Error('RenderService: nothing loaded'));
    const options = this.options;
    const json = stableJson(options);
    const w = this.worked;
    if (w && w.xml === xml && w.options === json) return w.layout;
    const sameXml = w?.xml === xml;
    const layout = (sameXml ? w!.layout.then(() => this.remote().relayout(options)) : this.remote().load(xml, options));
    this.worked = { xml, options: json, layout };
    layout.catch(() => {
      if (this.worked?.layout === layout) this.worked = undefined;
    });
    return layout;
  }

  /** SVG of a page (1-based), cached until the next layout. */
  page(n: number): Promise<string> {
    let svg = this.cache.get(n);
    if (!svg) {
      svg = this.renderPage(n);
      this.cache.set(n, svg);
      svg.catch(() => this.cache.get(n) === svg && this.cache.delete(n));
    }
    return svg;
  }

  private async renderPage(n: number): Promise<string> {
    const key = this.key;
    if (key && this.disk) {
      const hit = await this.disk.getPage(key, n).catch(() => undefined);
      if (hit) return hit;
    }
    await this.ensureWorker();
    const svg = await this.remote().renderPage(n);
    if (key && this.disk && key === this.key) void this.disk.putPage(key, n, svg).catch(() => undefined);
    return svg;
  }

  /** Render neighbours in the background so page turns are instant. */
  prefetch(around: number): void {
    const gen = this.generation;
    for (const n of [around + 1, around - 1, around + 2]) {
      if (n >= 1 && n <= this.layout.pageCount && gen === this.generation) void this.page(n).catch(() => undefined);
    }
  }

  /** Page of each element; measures are answered from the layout (no worker needed). */
  async pagesOf(elementIds: string[]): Promise<number[]> {
    const { measureIds, measurePages } = this.layout;
    const index = new Map(measureIds.map((id, i) => [id, i]));
    if (elementIds.every((id) => index.has(id))) return elementIds.map((id) => measurePages[index.get(id)!] ?? 0);
    await this.ensureWorker();
    return this.remote().pagesOf(elementIds);
  }

  async pageOf(elementId: string): Promise<number> {
    return (await this.pagesOf([elementId]))[0] ?? 0;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.api = undefined;
    this.worked = undefined;
    this.invalidate();
  }

  private invalidate() {
    this.generation++;
    this.cache.clear();
  }
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
