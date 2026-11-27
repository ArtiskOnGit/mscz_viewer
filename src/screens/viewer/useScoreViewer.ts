// Loading, rendering and navigation state of the viewer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Score, ScoreViewState } from '../../core/model/types';
import { renderCache, viewStateRepository } from '../../core/services';
import type { AppSettings } from '../../core/settings';
import { useSettings } from '../../state/settingsStore';
import { xmlToRenderedMeasure } from '../../core/playback/measureMap';
import type { Timeline } from '../../core/model/types';
import { effectiveViewState, type SetlistOverride } from '../../core/setlists/effectiveView';
import { RenderService, StaleRenderError, firstMeasureId, type ViewportOptions } from '../../core/render/renderService';
import { clefsKeyOf, contentKeyOf, layoutStep, loadPiece, partsKeyOf, prepareDisplay, viewportOf, type PieceData, type RequestedLayout } from './pieceData';
import { adoptPreloaded, displayKeyOf } from '../setlists/preloadNext';

export type ViewerStatus = 'loading' | 'ready' | 'notFound' | 'error';

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 3;
/** A page not drawn after this long (worker stopped by the system, e.g. iOS under memory pressure): message + Retry. */
const PAGE_RENDER_TIMEOUT_MS = 30000;

export function useScoreViewer(
  scoreId: string,
  size: { width: number; height: number } | undefined,
  settings: AppSettings,
  /** Setlist item override (setlists): applied to the display, never saved into the score's view state. */
  override?: SetlistOverride,
) {
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [score, setScore] = useState<Score>();
  const [view, setView] = useState<ScoreViewState>();
  const [xml, setXml] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  // Incremented after every load/relayout: the page must be re-rendered even if its number did not change.
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [svg, setSvg] = useState<string>();
  const [staves, setStaves] = useState(1);
  // --- playback support (timeline, measure → page) ---
  const [timeline, setTimeline] = useState<Timeline>();
  const [measureIds, setMeasureIds] = useState<string[]>([]);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);
  // --- end playback support ---
  // "My instrument": parts preselected on the first opening of this score.
  const [matchedParts, setMatchedParts] = useState<string[]>([]);
  const renderer = useRef<RenderService>(undefined);
  const anchor = useRef<string | undefined>(undefined);
  const restoredPage = useRef<number | undefined>(undefined);
  // --- setlists: piece prepared in the background by the previous piece (preloadNext.ts) ---
  const [pre] = useState(() => adoptPreloaded(scoreId));
  // --- end setlists ---
  const settingsLoaded = useSettings((st) => st.loaded);

  renderer.current ??= pre?.renderer ?? new RenderService(renderCache); // render cache: pages kept on disk
  // Dispose the worker on unmount (deferred: StrictMode's simulated unmount/remount must keep it).
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!pre?.renderer) void renderer.current?.warmUp(); // Verovio starts while the score files are read and prepared
    return () => {
      mounted.current = false;
      setTimeout(() => !mounted.current && renderer.current?.dispose(), 0);
    };
  }, [pre]); // `pre` never changes (state)

  // 1. Load score, settings and MusicXML (once the global settings are known: they hold the "My instrument" profile).
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    const apply = (d: PieceData) => {
      setTimeline(d.timeline);
      if (!d.score || !d.xml) return setStatus('notFound');
      restoredPage.current = d.view.lastPage;
      setScore(d.score);
      setView(d.view);
      setXml(d.xml);
      setMatchedParts(d.matchedParts);
    };
    if (pre) {
      apply(pre.data);
      return;
    }
    void (async () => {
      const d = await loadPiece(scoreId, useSettings.getState().settings);
      if (!cancelled) apply(d);
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [scoreId, settingsLoaded, pre]);

  // --- setlists: state actually displayed = score view state + setlist item override ---
  const shown = useMemo(() => (view ? effectiveViewState(view, override) : undefined), [view, override]);
  // --- end setlists ---

  // 2. XML to display (parts, multi-rests, names): recomputed when the selection changes.
  const partsKey = shown && score ? partsKeyOf(shown, score) : undefined;
  const clefsKey = shown ? clefsKeyOf(shown) : '';
  const display = useMemo(() => {
    if (!xml || partsKey === undefined) return undefined;
    const ds = { multiRests: settings.multiRests, partNames: settings.partNames };
    if (pre?.display && pre.display.xml === xml && pre.display.key === displayKeyOf(partsKey, clefsKey, ds)) return pre.display.value; // setlists: preloaded
    return prepareDisplay(xml, partsKey, clefsKey, ds);
  }, [xml, partsKey, clefsKey, settings.multiRests, settings.partNames, pre]);

  const viewport = useMemo<ViewportOptions | undefined>(
    () => (display && shown ? viewportOf(display, shown, size, { defaultZoom: settings.defaultZoom, musicFont: settings.musicFont, barNumbers: settings.barNumbers, showHeader: settings.showHeader }) : undefined),
    [display, shown, size, settings.defaultZoom, settings.musicFont, settings.barNumbers, settings.showHeader],
  );

  // 3. Load into Verovio when the content changes, relayout when only the geometry changes.
  const contentKey = viewport && display && partsKey !== undefined ? contentKeyOf(partsKey, clefsKey, viewport, settings) : undefined;
  // What the renderer was last asked for (setlists: a preloaded renderer already holds this piece).
  const requested = useRef<RequestedLayout>({ content: pre?.renderer ? pre.contentKey : undefined, viewport: pre?.renderer ? pre.viewport : undefined, applied: false });
  const [layoutRetry, setLayoutRetry] = useState(0);
  useEffect(() => {
    if (!viewport || !display || !contentKey) return;
    const r = renderer.current!;
    const step = layoutStep(requested.current, contentKey, viewport);
    // Same content and geometry (e.g. only the tempo changed): nothing to lay out again.
    if (step === 'none') return;
    const reload = step === 'load';
    // Recorded at once: the renderer switches to this layout now, even if this run is cancelled later.
    requested.current = { content: contentKey, viewport, applied: false };
    let cancelled = false;
    void (async () => {
      // 'wait': layout already asked for (a cancelled run, or the renderer preloaded with this very piece).
      const layout = await (reload ? r.load(display.xml, viewport) : step === 'wait' ? r.current() : r.relayout(viewport));
      if (cancelled) return;
      setStaves(display.staves);
      setPageCount(layout.pageCount);
      setMeasureIds(layout.measureIds);
      setRenderedPages(await r.pagesOf(layout.measureIds));
      if (cancelled) return;
      // Keep the musical position: same first measure after a relayout, saved page on first load.
      let target = 1;
      if (!reload && anchor.current) target = (await r.pageOf(anchor.current)) || 1;
      else if (restoredPage.current) target = restoredPage.current;
      else if (anchor.current) target = 1;
      restoredPage.current = undefined;
      setPage(Math.min(Math.max(1, target), layout.pageCount));
      setLayoutVersion((n) => n + 1);
      setStatus('ready');
      requested.current.applied = true;
    })().catch((e) => {
      console.error('Score layout failed', e);
      if (cancelled) return;
      requested.current = { content: undefined, viewport: undefined, applied: false }; // Retry loads again
      setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [viewport, display, contentKey, layoutRetry]);

  // 4. Render the current page, pre-render its neighbours (page mode; the continuous view renders its own pages).
  // A page that cannot be drawn (or takes too long: worker stopped by the system) shows a message and Retry,
  // never a blank stage.
  const continuous = viewport?.continuous ?? false;
  const [pageError, setPageError] = useState<{ page: number; reason: 'failed' | 'timeout' }>();
  const [pageRetry, setPageRetry] = useState(0);
  useEffect(() => {
    if (status !== 'ready' || pageCount === 0 || continuous) return;
    let cancelled = false;
    const r = renderer.current!;
    const gen = r.generation;
    // A relayout started since this page number was chosen: the layout effect sets the page again when done.
    const outdated = () => cancelled || r.generation !== gen;
    const timer = setTimeout(() => !outdated() && setPageError({ page, reason: 'timeout' }), PAGE_RENDER_TIMEOUT_MS);
    r.page(page).then(
      (s) => {
        clearTimeout(timer);
        if (outdated()) return;
        setPageError(undefined);
        setSvg(s);
        anchor.current = firstMeasureId(s);
        r.prefetch(page);
      },
      (e: unknown) => {
        clearTimeout(timer);
        if (outdated() || e instanceof StaleRenderError) return;
        console.error(`Page ${page}/${pageCount} could not be drawn`, e);
        setPageError({ page, reason: 'failed' });
      },
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, page, pageCount, layoutVersion, continuous, pageRetry]);

  /** Retry button: a new Verovio worker, then the layout or the page again. */
  const retry = useCallback(() => {
    renderer.current?.restart();
    setPageError(undefined);
    if (status === 'error') {
      setStatus('loading');
      setLayoutRetry((n) => n + 1);
    } else setPageRetry((n) => n + 1);
  }, [status]);

  // 5. Persist settings (debounced).
  useEffect(() => {
    if (!view || status !== 'ready') return;
    const t = setTimeout(() => void viewStateRepository.save({ ...view, lastPage: page }), 400);
    return () => clearTimeout(t);
  }, [view, page, status]);

  const goTo = useCallback((p: number) => setPage((cur) => Math.min(Math.max(1, p), pageCount || cur)), [pageCount]);
  const next = useCallback(() => setPage((p) => Math.min(p + 1, pageCount || p)), [pageCount]);
  const prev = useCallback(() => setPage((p) => Math.max(p - 1, 1)), []);
  const update = useCallback((patch: Partial<ScoreViewState>) => setView((v) => (v ? { ...v, ...patch } : v)), []);
  const zoom = typeof view?.zoom === 'number' ? view.zoom : settings.defaultZoom;
  const setZoom = useCallback((z: number) => update({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100)) }), [update]);

  const selectedParts = useMemo(() => (partsKey ? partsKey.split(',') : []), [partsKey]);
  // MusicXML measure rank → rendered (Verovio) measure index, accounting for merged multi-measure rests.
  const xmlToRendered = useMemo(() => (score && display ? xmlToRenderedMeasure(score.measures, display.multiRestGroups) : []), [score, display]);
  const key = display?.key;
  const originalClefs = display?.originalClefs;
  // Half-page turns: SVG of another page (cached by the renderer).
  const pageSvg = useCallback((n: number) => renderer.current!.page(n), []);
  // --- continuous mode: the view reports the first measure on screen, kept across relayouts (zoom, rotation…) ---
  const setAnchor = useCallback((id: string | undefined) => {
    if (id) anchor.current = id;
  }, []);
  const getAnchor = useCallback(() => anchor.current, []);
  // --- end continuous mode ---
  // Page error shown for the current page only (pages turned since: those are being drawn).
  const shownPageError = pageError?.page === page ? pageError.reason : undefined;
  return { originalClefs, pageError: shownPageError, retry, continuous, layoutVersion, setAnchor, getAnchor, xml, pageSvg, status, score, view, shown, matchedParts, selectedParts, key, timeline, measureIds, renderedPages, xmlToRendered, svg, page, pageCount, staves, zoom, goTo, next, prev, update, setZoom };
}
