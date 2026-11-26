// Verovio (WASM) in a Web Worker, so layout and SVG rendering never block the UI.
import * as Comlink from 'comlink';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

export interface LayoutInfo {
  pageCount: number;
  /** MEI measure ids in document order (merged multi-rest measures appear once). */
  measureIds: string[];
  /** Page (1-based) of each measure of `measureIds`. */
  measurePages: number[];
}

/**
 * Fixed options: ids seeded so that a score loaded again gets the same ids (pages cached on disk, ADR-025, are
 * mixed with pages rendered by a fresh worker).
 */
const FIXED_OPTIONS = { xmlIdSeed: 1 };

let toolkit: VerovioToolkit | undefined;
async function tk(): Promise<VerovioToolkit> {
  toolkit ??= new VerovioToolkit(await createVerovioModule());
  return toolkit;
}

const api = {
  async version(): Promise<string> {
    return (await tk()).getVersion();
  },

  async load(xml: string, options: Record<string, unknown>): Promise<LayoutInfo> {
    const t = await tk();
    t.setOptions({ ...options, ...FIXED_OPTIONS });
    if (!t.loadData(xml)) throw new Error(`Verovio could not load the score: ${t.getLog()}`);
    return info(t);
  },

  async relayout(options: Record<string, unknown>): Promise<LayoutInfo> {
    const t = await tk();
    t.setOptions(options);
    t.redoLayout();
    return info(t);
  },

  async renderPage(page: number): Promise<string> {
    return (await tk()).renderToSVG(page);
  },

  /** Page (1-based, 0 if not found) of each element, in one round trip. */
  async pagesOf(elementIds: string[]): Promise<number[]> {
    const t = await tk();
    return elementIds.map((id) => t.getPageWithElement(id));
  },

  async pageOf(elementId: string): Promise<number> {
    return (await tk()).getPageWithElement(elementId);
  },
};

function info(t: VerovioToolkit): LayoutInfo {
  const measureIds = [...t.getMEI().matchAll(/<measure\b[^>]*xml:id="([^"]+)"/g)].map((m) => m[1] ?? '');
  return { pageCount: t.getPageCount(), measureIds, measurePages: measureIds.map((id) => t.getPageWithElement(id)) };
}

export type RenderApi = typeof api;
Comlink.expose(api);
