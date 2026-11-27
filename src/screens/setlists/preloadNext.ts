// Setlist play mode: prepare the next piece in the background (score, view state, display XML, Verovio layout and
// first page) so that opening it is fast. A single slot: memory stays bounded to the next piece.
import { useEffect } from 'react';
import type { DisplayXml } from '../../core/musicxml/prepareDisplay';
import { RenderService, type ViewportOptions } from '../../core/render/renderService';
import { renderCache } from '../../core/services';
import type { AppSettings } from '../../core/settings';
import { effectiveViewState, type SetlistOverride } from '../../core/setlists/effectiveView';
import { clefsKeyOf, contentKeyOf, loadPiece, partsKeyOf, prepareDisplay, viewportOf, type PieceData } from '../viewer/pieceData';

export interface Preloaded {
  scoreId: string;
  data: PieceData;
  display?: { xml: string; key: string; value: DisplayXml };
  /** Verovio worker with the piece loaded (contentKey) and laid out (viewport); set once ready. */
  renderer?: RenderService;
  contentKey?: string;
  viewport?: ViewportOptions;
  /** Taken over by a viewer: the viewer owns (and disposes) the renderer. */
  adopted: boolean;
}

let slot: Preloaded | undefined;
let generation = 0;

export const displayKeyOf = (partsKey: string, clefsKey: string, s: Pick<AppSettings, 'multiRests' | 'partNames'>) => `${partsKey}|${clefsKey}|${s.multiRests}|${s.partNames}`;

/** The preloaded piece for this score, if any; the caller takes ownership (idempotent, StrictMode-safe). */
export function adoptPreloaded(scoreId: string): Preloaded | undefined {
  if (slot?.scoreId !== scoreId) return undefined;
  slot.adopted = true;
  return slot;
}

/** Drop the preloaded piece (and its worker) unless a viewer took it over. Also cancels a preload in progress. */
export function releasePreloaded(): void {
  generation++;
  if (slot && !slot.adopted) slot.renderer?.dispose();
  slot = undefined;
}

export async function preloadPiece(
  scoreId: string,
  override: SetlistOverride | undefined,
  settings: AppSettings,
  size: { width: number; height: number },
): Promise<void> {
  releasePreloaded();
  const gen = generation;
  const data = await loadPiece(scoreId, settings);
  if (gen !== generation || !data.score || !data.xml) return;
  const entry: Preloaded = { scoreId, data, adopted: false };
  slot = entry;
  const shown = effectiveViewState(data.view, override);
  const partsKey = partsKeyOf(shown, data.score);
  const clefsKey = clefsKeyOf(shown);
  await idle();
  if (gen !== generation) return;
  const display = prepareDisplay(data.xml, partsKey, clefsKey, settings);
  entry.display = { xml: data.xml, key: displayKeyOf(partsKey, clefsKey, settings), value: display };
  const viewport = viewportOf(display, shown, size, settings);
  if (!viewport) return;
  const renderer = new RenderService(renderCache); // render cache: the next piece may not need Verovio at all
  try {
    const layout = await renderer.load(display.xml, viewport);
    await renderer.page(Math.min(Math.max(1, data.view.lastPage), layout.pageCount));
  } catch (e) {
    console.warn('Preload failed', e);
    renderer.dispose();
    return;
  }
  // Superseded, or the viewer already opened the piece with its own renderer.
  if (gen !== generation || entry.adopted) return renderer.dispose();
  entry.renderer = renderer;
  entry.contentKey = contentKeyOf(partsKey, clefsKey, viewport, settings);
  entry.viewport = viewport;
}

const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Preload `next` once the current piece is displayed (after a short delay, so the current piece's own page
 * pre-rendering goes first). The slot is released when the viewer goes away, unless the next viewer adopted it.
 */
export function usePreloadNext(
  currentScoreId: string,
  next: { scoreId: string; override?: SetlistOverride } | undefined,
  ready: boolean,
  size: { width: number; height: number } | undefined,
  settings: AppSettings,
): void {
  // The same score twice in a row: its view state is being edited by the current viewer, nothing to gain.
  const nextId = next && next.scoreId !== currentScoreId ? next.scoreId : undefined;
  const overrideKey = JSON.stringify(next?.override ?? null);
  const width = size?.width;
  const height = size?.height;
  useEffect(() => {
    if (!ready || !nextId || !width || !height) return;
    const override = JSON.parse(overrideKey) as SetlistOverride | null;
    const t = setTimeout(() => void preloadPiece(nextId, override ?? undefined, settings, { width, height }), 800);
    return () => clearTimeout(t);
  }, [ready, nextId, overrideKey, width, height, settings]);
  // Leaving the viewer: release the slot after the next viewer (if any) had a chance to adopt it.
  useEffect(() => () => void setTimeout(() => slot && !slot.adopted && releasePreloaded(), 0), []);
}
