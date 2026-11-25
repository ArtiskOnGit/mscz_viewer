// Loading, rendering and navigation state of the viewer.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultPartIds, type Score, type ScoreViewState } from '../../core/model/types';
import { libraryRepository, viewStateRepository } from '../../core/services';
import { prepareDisplayXml } from '../../core/musicxml/prepareDisplay';
import type { AppSettings } from '../../core/settings';
import { RenderService, autoScale, firstMeasureId, transposeOption, type ViewportOptions } from '../../core/render/renderService';

export type ViewerStatus = 'loading' | 'ready' | 'notFound' | 'error';

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 3;

export function useScoreViewer(scoreId: string, size: { width: number; height: number } | undefined, settings: AppSettings) {
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [score, setScore] = useState<Score>();
  const [view, setView] = useState<ScoreViewState>();
  const [xml, setXml] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [svg, setSvg] = useState<string>();
  const [staves, setStaves] = useState(1);
  const renderer = useRef<RenderService>(undefined);
  const anchor = useRef<string | undefined>(undefined);
  const restoredPage = useRef<number | undefined>(undefined);

  renderer.current ??= new RenderService();
  useEffect(() => () => renderer.current?.dispose(), []);

  // 1. Load score, settings and MusicXML.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, v, x] = await Promise.all([libraryRepository.get(scoreId), viewStateRepository.get(scoreId), libraryRepository.readMusicXml(scoreId)]);
      if (cancelled) return;
      if (!s || !x) return setStatus('notFound');
      restoredPage.current = v.lastPage;
      setScore(s);
      setView(v);
      setXml(x);
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [scoreId]);

  // 2. XML to display (parts, multi-rests, names): recomputed when the selection changes.
  // Empty selection = default parts (those visible in MuseScore).
  const partsKey = view && score ? (view.selectedParts.length ? view.selectedParts : defaultPartIds(score.parts)).join(',') : undefined;
  const display = useMemo(() => {
    if (!xml || partsKey === undefined) return undefined;
    return prepareDisplayXml(xml, { selectedParts: partsKey ? partsKey.split(',') : [], multiRests: settings.multiRests, partNames: settings.partNames });
  }, [xml, partsKey, settings.multiRests, settings.partNames]);

  const viewport = useMemo<ViewportOptions | undefined>(() => {
    if (!display || !view || !size || size.width < 50 || size.height < 50) return undefined;
    const factor = typeof view.zoom === 'number' ? view.zoom : settings.defaultZoom;
    return {
      width: size.width,
      height: size.height,
      scale: Math.round(autoScale(display.staves, size.width) * factor),
      transpose: transposeOption(view.transposeSemitones, view.transposeOctave),
      concertPitch: view.concertPitch,
    };
  }, [display, view, size, settings.defaultZoom]);

  // 3. Load into Verovio when the content changes, relayout when only the geometry changes.
  const contentKey = viewport && display ? `${partsKey}|${viewport.transpose}|${viewport.concertPitch}|${settings.multiRests}|${settings.partNames}` : undefined;
  const loadedContent = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!viewport || !display || !contentKey) return;
    const r = renderer.current!;
    let cancelled = false;
    void (async () => {
      const reload = loadedContent.current !== contentKey;
      const layout = reload ? await r.load(display.xml, viewport) : await r.relayout(viewport);
      loadedContent.current = contentKey;
      if (cancelled) return;
      setStaves(display.staves);
      setPageCount(layout.pageCount);
      // Keep the musical position: same first measure after a relayout, saved page on first load.
      let target = 1;
      if (!reload && anchor.current) target = (await r.pageOf(anchor.current)) || 1;
      else if (restoredPage.current) target = restoredPage.current;
      else if (anchor.current) target = 1;
      restoredPage.current = undefined;
      setPage(Math.min(Math.max(1, target), layout.pageCount));
      setStatus('ready');
    })().catch((e) => {
      console.error(e);
      if (!cancelled) setStatus('error');
    });
    return () => {
      cancelled = true;
    };
  }, [viewport, display, contentKey]);

  // 4. Render the current page, pre-render its neighbours.
  useEffect(() => {
    if (status !== 'ready' || pageCount === 0) return;
    let cancelled = false;
    const r = renderer.current!;
    void r.page(page).then((s) => {
      if (cancelled) return;
      setSvg(s);
      anchor.current = firstMeasureId(s);
      r.prefetch(page);
    });
    return () => {
      cancelled = true;
    };
  }, [status, page, pageCount]);

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
  return { status, score, view, selectedParts, svg, page, pageCount, staves, zoom, goTo, next, prev, update, setZoom };
}
