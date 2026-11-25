// Verovio (WASM) in a Web Worker, so layout and SVG rendering never block the UI.
import * as Comlink from 'comlink';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

export interface LayoutInfo {
  pageCount: number;
  /** MEI measure ids in document order (merged multi-rest measures appear once). */
  measureIds: string[];
}

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
    t.setOptions(options);
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

  async pageOf(elementId: string): Promise<number> {
    return (await tk()).getPageWithElement(elementId);
  },
};

function info(t: VerovioToolkit): LayoutInfo {
  const measureIds = [...t.getMEI().matchAll(/<measure\b[^>]*xml:id="([^"]+)"/g)].map((m) => m[1] ?? '');
  return { pageCount: t.getPageCount(), measureIds };
}

export type RenderApi = typeof api;
Comlink.expose(api);
