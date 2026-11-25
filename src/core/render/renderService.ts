// Main-thread side of the renderer: options from the screen/zoom, page cache, pre-rendering.
import * as Comlink from 'comlink';
import type { LayoutInfo, RenderApi } from './render.worker';

export interface ViewportOptions {
  width: number;
  height: number;
  /** Verovio scale (percent); see autoScale(). */
  scale: number;
  /** Verovio "transpose" option ("" = none), e.g. "+2", "-3". */
  transpose: string;
  concertPitch: boolean;
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
    adjustPageHeight: false,
    header: 'none',
    footer: 'none',
    svgViewBox: true,
    // The "//" system separators only make sense on printed full scores.
    systemDivider: 'none',
    transpose: v.transpose,
    transposeToSoundingPitch: v.concertPitch,
  };
}

export class RenderService {
  private worker: Worker | undefined;
  private api: Comlink.Remote<RenderApi> | undefined;
  private cache = new Map<number, Promise<string>>();
  private generation = 0;
  layout: LayoutInfo = { pageCount: 0, measureIds: [] };

  private remote(): Comlink.Remote<RenderApi> {
    if (!this.api) {
      this.worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
      this.api = Comlink.wrap<RenderApi>(this.worker);
    }
    return this.api;
  }

  async load(xml: string, viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    this.layout = await this.remote().load(xml, verovioOptions(viewport));
    return this.layout;
  }

  async relayout(viewport: ViewportOptions): Promise<LayoutInfo> {
    this.invalidate();
    this.layout = await this.remote().relayout(verovioOptions(viewport));
    return this.layout;
  }

  /** SVG of a page (1-based), cached until the next layout. */
  page(n: number): Promise<string> {
    let svg = this.cache.get(n);
    if (!svg) {
      svg = this.remote().renderPage(n);
      this.cache.set(n, svg);
    }
    return svg;
  }

  /** Render neighbours in the background so page turns are instant. */
  prefetch(around: number): void {
    const gen = this.generation;
    for (const n of [around + 1, around - 1, around + 2]) {
      if (n >= 1 && n <= this.layout.pageCount && gen === this.generation) void this.page(n).catch(() => undefined);
    }
  }

  pagesOf(elementIds: string[]): Promise<number[]> {
    return this.remote().pagesOf(elementIds);
  }

  pageOf(elementId: string): Promise<number> {
    return this.remote().pageOf(elementId);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.api = undefined;
    this.invalidate();
  }

  private invalidate() {
    this.generation++;
    this.cache.clear();
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** First measure id of an SVG page (to keep the musical position across relayouts). */
export function firstMeasureId(svg: string): string | undefined {
  return /<g\b[^>]*\bid="([^"]+)"[^>]*\bclass="measure\b/.exec(svg)?.[1] ?? /<g\b[^>]*\bclass="measure\b[^"]*"[^>]*\bid="([^"]+)"/.exec(svg)?.[1];
}

/** Semitones + octaves → Verovio "transpose" option. */
export function transposeOption(semitones: number, octaves: number): string {
  const total = semitones + 12 * octaves;
  return total === 0 ? '' : total > 0 ? `+${total}` : `${total}`;
}
