import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import {
  chevronBack, chevronForward, pause, peopleOutline, play, timerOutline, removeCircleOutline, addCircleOutline,
  lockClosed, lockOpenOutline, navigateCircleOutline, documentOutline, reorderFourOutline, volumeHighOutline, volumeMuteOutline,
  searchOutline,
} from 'ionicons/icons';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { routes } from '../../app/routes';
import { defaultPartIds, type MixerState } from '../../core/model/types';
import { useScoreViewer } from './useScoreViewer';
import { PartsModal } from './PartsModal';
import { usePageGestures } from './usePageGestures';
import { usePlayback } from './usePlayback';
import { TransposeModal } from './TransposeModal';
import { useSettings } from '../../state/settingsStore';
import { useSetlistPlayback } from '../setlists/useSetlistPlayback';
import { SetlistBar } from '../setlists/SetlistBar';
import { usePreloadNext } from '../setlists/preloadNext';
import { transposeBadgeValue } from '../../core/setlists/effectiveView';
import { useMyPartToast } from './useMyPartToast';
import { pedalAction } from '../../core/navigation/pedalKeys';
import { boxAtPoint, halfPageSplit, measureNumbers, nextPosition, pageOfMeasure, previousPosition, xmlMeasureOfId } from '../../core/navigation/navigation';
import { GoToModal } from './GoToModal';
import { useLongPress } from './useLongPress';
import { ContinuousView, type ContinuousHandle } from './ContinuousView';
import { usePageTurnAnimation } from './usePageTurnAnimation';
import { useScoreAudio } from './useScoreAudio';
import { MixerModal } from './MixerModal';
import { TempoPopover } from './TempoPopover';
import { ZoomPopover } from './ZoomPopover';
import { matchMyInstrument } from '../../core/profile/myInstrument';
import './viewer.css';

const UNLOCK_PRESS_MS = 800;
const METRONOME_ONLY_PRESS_MS = 600;
const SOUND_TOGGLE_PRESS_MS = 600;
// Lock mode lasts for the app session (kept from one piece of a setlist to the next), never saved.
let sessionLocked = false;

// --- setlists: remount the viewer for each piece (next/previous piece only changes the URL) ---
export function ViewerScreen() {
  const { scoreId = '' } = useParams<{ scoreId: string }>();
  const [params] = useSearchParams();
  return <ScoreViewerScreen key={`${scoreId}|${params.get('item') ?? ''}`} scoreId={scoreId} />;
}
// --- end setlists ---

function ScoreViewerScreen({ scoreId }: { scoreId: string }) {
  const { t } = useTranslation('viewer');
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [chrome, setChrome] = useState(true);
  const [partsOpen, setPartsOpen] = useState(false);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [gotoOpen, setGotoOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false); // tempo popover
  const [locked, setLockedState] = useState(sessionLocked);
  const setLocked = (l: boolean) => {
    sessionLocked = l;
    setLockedState(l);
  };
  // Half-page turn: page for which the composite view (top of page + 1 over bottom of page) is shown.
  const [halfOf, setHalfOf] = useState<number>();
  const [picked, setPicked] = useState<number>(); // bar picked by a long press (MusicXML measure rank)
  const [composite, setComposite] = useState<{ base: string; svg: string }>();
  const [toast] = useIonToast();
  const { settings } = useSettings();
  const sp = useSetlistPlayback(); // setlists
  const v = useScoreViewer(scoreId, size, settings, sp.override);
  // --- continuous mode ---
  const contRef = useRef<ContinuousHandle>(null);
  const continuous = v.continuous;
  const pageOfId = useMemo(() => {
    const map = new Map(v.measureIds.map((id, i) => [id, v.renderedPages[i] ?? 0]));
    return (id: string) => map.get(id) || undefined;
  }, [v.measureIds, v.renderedPages]);
  const { setAnchor, goTo } = v;
  const onVisible = useCallback((page: number, topMeasureId: string | undefined) => {
    setAnchor(topMeasureId);
    goTo(page);
  }, [setAnchor, goTo]);
  // --- end continuous mode ---
  // --- my instrument & setlist preload ---
  useMyPartToast(v.matchedParts, v.score?.parts ?? [], v.status === 'ready', !!sp.override?.selectedParts?.length);
  usePreloadNext(scoreId, sp.nextItem, v.status === 'ready', size, settings);
  // --- end my instrument & setlist preload ---

  // Track the stage size (rotation, split screen…), debounced.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([entry]) => {
      clearTimeout(timer);
      const { width, height } = entry!.contentRect;
      timer = setTimeout(() => setSize((s) => (s && Math.abs(s.width - width) < 2 && Math.abs(s.height - height) < 2 ? s : { width, height })), 200);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Never let the screen sleep while a score is open.
  useEffect(() => {
    if (!settings.keepAwake) return;
    void KeepAwake.keepAwake().catch(() => undefined);
    return () => void KeepAwake.allowSleep().catch(() => undefined);
  }, [settings.keepAwake]);

  // --- auto-scroll & metronome ---
  const tempoFactor = v.view?.tempoFactor ?? 1;
  const metronome = v.view?.metronomeEnabled ?? false;
  // --- score audio (ADR-026): sound per score (default from the settings), mixer per score or setlist piece ---
  const mixer = v.shown?.mixer;
  const audio = useScoreAudio({ score: v.score, mixer, defaultMaster: settings.soundVolume });
  const soundOn = (v.view?.soundEnabled ?? settings.soundDefault) && audio.available;
  const setSound = (on: boolean) => {
    v.update({ soundEnabled: on });
    if (on) void audio.prepare(); // in the user gesture: the synth and SoundFont load now
  };
  const setMixer = (m: MixerState) => (sp.active ? sp.setMixer(m) : v.update({ mixer: m }));
  const myParts = useMemo(() => matchMyInstrument(v.score?.parts ?? [], settings.myInstrument), [v.score, settings.myInstrument]);
  // --- end score audio ---
  const pb = usePlayback({
    timeline: v.timeline,
    xmlToRendered: v.xmlToRendered,
    renderedPages: v.renderedPages,
    measureIds: v.measureIds,
    page: v.page,
    goTo: v.goTo,
    stageRef,
    svg: v.svg,
    tempoFactor,
    metronome,
    settings,
    continuous: continuous ? contRef : undefined,
    audio: { on: soundOn, source: audio.source, prepare: audio.prepare },
  });
  // Tap on the metronome button / pedal "metronome" action: metronome with the auto-scroll on/off (stops "metronome only").
  const toggleMetronome = () => (pb.metronomeOnly ? pb.pause() : v.update({ metronomeEnabled: !metronome }));
  const setTempo = (f: number) => v.update({ tempoFactor: Math.round(Math.min(1.5, Math.max(0.5, f)) * 100) / 100 });
  // --- end auto-scroll & metronome ---

  // --- page turns (full or half page) ---
  // Continuous mode: no half pages; "next" / "previous" scroll by about one screen.
  const half = settings.halfPageTurn && !continuous && halfOf === v.page && v.page < v.pageCount;
  const turn = (to: { page: number; half: boolean }) => {
    setHalfOf(to.half ? to.page : undefined);
    v.goTo(to.page);
  };
  const turnNext = () => (continuous ? contRef.current?.scrollScreen(1) : turn(nextPosition({ page: v.page, half }, v.pageCount, settings.halfPageTurn)));
  const turnPrev = () => (continuous ? contRef.current?.scrollScreen(-1) : turn(previousPosition({ page: v.page, half }, settings.halfPageTurn)));
  const atLastScreen = () => (continuous ? !!contRef.current?.atEnd() : v.page >= v.pageCount);
  const { svg: pageSvgShown, page: pageShown, pageSvg } = v;
  useEffect(() => {
    if (!half || !pageSvgShown) return;
    let cancelled = false;
    void pageSvg(pageShown + 1).then((svg) => !cancelled && setComposite({ base: pageSvgShown, svg }));
    return () => {
      cancelled = true;
    };
  }, [half, pageSvgShown, pageShown, pageSvg]);
  const topSvg = half && composite && composite.base === v.svg ? composite.svg : undefined;
  // Split the composite view between two systems (never through a staff).
  const halfRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = halfRef.current;
    if (!el || !topSvg) return;
    const origin = el.getBoundingClientRect().top;
    const bands = (layer: string) =>
      [...el.querySelectorAll(`.${layer} g.system`)].map((g) => {
        const r = g.getBoundingClientRect();
        return { top: r.top - origin, bottom: r.bottom - origin };
      });
    const height = el.clientHeight;
    const { topEnd, bottomStart } = halfPageSplit(bands('half-bottom'), bands('half-top'), height);
    el.style.setProperty('--half-top-clip', `${Math.max(0, height - topEnd - 4)}px`);
    el.style.setProperty('--half-bottom-clip', `${bottomStart - 2}px`);
    el.style.setProperty('--half-split', `${(topEnd + bottomStart) / 2}px`);
  }, [topSvg, v.svg]);
  const togglePlay = () => {
    setHalfOf(undefined); // auto-scroll turns full pages
    if (!pb.playing) setPicked(undefined); // the picked bar (long press) is used by this ▶
    pb.toggle();
  };
  // --- end page turns ---

  // Keyboard and Bluetooth page-turner pedals (they send key presses; keys configurable in the settings).
  const onKey = useRef<(e: KeyboardEvent) => void>(undefined);
  useLayoutEffect(() => {
    onKey.current = (e) => {
      if (partsOpen || transposeOpen || gotoOpen || mixerOpen || tempoOpen || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = pedalAction(e.code, settings.pedalKeys);
      if (!action) return;
      e.preventDefault();
      if (action === 'playPause') togglePlay();
      else if (action === 'metronome') toggleMetronome();
      else if (action === 'nextPiece') sp.goNext(); // setlists (no-op outside a setlist or on the last piece)
      else if (action === 'previousPiece') sp.goPrev();
      else if (action === 'prev') turnPrev();
      else if (sp.active && atLastScreen()) sp.nextAtEnd(); // setlists: last page → next piece
      else turnNext();
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // --- long press on a bar: the next ▶ starts there (restarts there while playing) ---
  /** SVG id of the measure under a point (on a drawn element, else in the bounding box of a measure). */
  const measureIdAt = (x: number, y: number): string | undefined => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const hit = document.elementsFromPoint(x, y).map((el) => el.closest('g.measure')).find((g) => g && stage.contains(g));
    if (hit?.id) return hit.id;
    let scope: ParentNode = stage;
    const halfView = halfRef.current;
    if (halfView) {
      // Half page: only the layer shown at this height.
      const split = parseFloat(halfView.style.getPropertyValue('--half-split'));
      scope = halfView.querySelector(y - halfView.getBoundingClientRect().top < split ? '.half-top' : '.half-bottom') ?? stage;
    }
    const measures = [...scope.querySelectorAll<SVGGElement>('g.measure')];
    return measures[boxAtPoint(measures.map((m) => m.getBoundingClientRect()), x, y)]?.id || undefined;
  };
  const pickMeasureAt = (x: number, y: number) => {
    if (locked || !pb.available) return;
    const id = measureIdAt(x, y);
    const measure = id ? xmlMeasureOfId(id, v.measureIds, v.xmlToRendered) : undefined;
    if (measure === undefined) return;
    if (!pb.playing && measure === picked) {
      pb.pickMeasure(undefined);
      setPicked(undefined);
      return void toast({ message: t('playback.startAtCleared'), duration: 1200, position: 'top' });
    }
    if (!pb.pickMeasure(measure) || pb.playing) return;
    setPicked(measure);
    const bar = (v.xml ? measureNumbers(v.xml)[measure] : undefined) ?? String(measure + 1);
    void toast({ message: t('playback.startAt', { bar }), duration: 1500, position: 'top' }); // not over the score centre nor ▶
  };
  const pickedId = picked !== undefined ? v.measureIds[v.xmlToRendered[picked] ?? -1] : undefined;
  // --- end long press on a bar ---

  const pinchScale = usePageGestures(stageRef, {
    // While playing, a tap pauses (setting) instead of turning the page; in lock mode, taps only turn pages.
    onNext: () => (pb.playing && settings.tapPauses && !locked ? pb.pause() : turnNext()),
    onPrev: () => (pb.playing && settings.tapPauses && !locked ? pb.pause() : turnPrev()),
    onToggleChrome: () => {
      if (locked) return;
      if (pb.playing && settings.tapPauses) pb.pause();
      else setChrome((c) => !c);
    },
    onPinchEnd: (ratio) => v.setZoom(v.zoom * ratio),
    tapZones: settings.tapZones,
    tapZoneWidth: settings.tapZoneWidth,
    swipe: settings.swipe,
    pinch: !locked,
    onLongPress: pickMeasureAt, // long press on a bar
  });

  // --- go to bar / rehearsal mark ---
  const numbers = useMemo(() => (gotoOpen && v.xml ? measureNumbers(v.xml) : []), [gotoOpen, v.xml]);
  const goToMeasure = (measureIndex: number) => {
    setGotoOpen(false);
    setPicked(undefined); // replaces a bar picked by a long press
    const target = pageOfMeasure(measureIndex, v.xmlToRendered, v.renderedPages);
    if (!target) return;
    setHalfOf(undefined);
    const id = v.measureIds[v.xmlToRendered[measureIndex] ?? -1];
    if (continuous && id) contRef.current?.scrollToMeasure(id);
    else v.goTo(target);
    pb.startFrom(measureIndex); // next ▶ starts from this bar
  };
  // --- end go to ---

  // --- lock mode & metronome only (long presses) ---
  const lockPress = useLongPress(
    () => locked && setLocked(false),
    () => (locked ? void toast({ message: t('lock.holdToUnlock'), duration: 1500, position: 'middle' }) : setLocked(true)),
    UNLOCK_PRESS_MS,
  );
  const metronomePress = useLongPress(
    () => void pb.toggleMetronomeOnly(),
    toggleMetronome,
    METRONOME_ONLY_PRESS_MS,
  );
  // Sound button: tap = sound and mixer sheet; long press = sound on/off.
  const soundPress = useLongPress(
    () => {
      setSound(!soundOn);
      void toast({ message: soundOn ? t('sound.off') : t('sound.on'), duration: 1200, position: 'top' });
    },
    () => setMixerOpen(true),
    SOUND_TOGGLE_PRESS_MS,
  );
  // --- end lock mode & metronome only ---

  const turnAnim = usePageTurnAnimation(v.svg, v.page, settings.pageTurnAnimation);
  const parts = v.score?.parts ?? [];
  // Transposition actually shown (setlists: the piece's override wins over the score's settings).
  const transpose = {
    transposeSemitones: v.shown?.transposeSemitones ?? 0,
    transposeOctave: v.shown?.transposeOctave ?? 0,
    concertPitch: v.shown?.concertPitch ?? false,
    accidentalPreference: v.shown?.accidentalPreference ?? 'auto',
  };
  const transposeBadge = transposeBadgeValue(transpose);
  const selectedCount = v.selectedParts.length;
  const pageLabel = (
    <span className="page-indicator" data-testid="page-indicator">
      {v.pageCount > 0 ? (half ? t('pageHalf', { page: v.page, next: v.page + 1, count: v.pageCount }) : t('page', { page: v.page, count: v.pageCount })) : ''}
    </span>
  );

  return (
    <IonPage className={locked ? 'score-locked' : chrome ? '' : 'score-chrome-hidden'}>
      <IonHeader>
        <IonToolbar>
          {!locked && <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>}
          <IonTitle>{v.score?.title ?? t('title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton
              {...lockPress}
              aria-label={locked ? t('lock.unlock') : t('lock.lock')}
              aria-pressed={locked}
              data-testid="lock-button"
              data-locked={String(locked)}
            >
              <IonIcon slot="icon-only" icon={locked ? lockClosed : lockOpenOutline} aria-hidden="true" />
            </IonButton>
            {!locked && parts.length > 1 && (
              <IonButton onClick={() => setPartsOpen(true)} aria-label={t('parts.buttonCount', { selected: selectedCount, total: parts.length })} data-testid="parts-button">
                <IonIcon slot="start" icon={peopleOutline} aria-hidden="true" />
                {selectedCount}/{parts.length}
              </IonButton>
            )}
            {!locked && <>
            <IonButton
              onClick={() => v.update({ layoutMode: continuous ? 'pages' : 'continuous' })}
              aria-label={continuous ? t('layout.toPages') : t('layout.toContinuous')}
              data-testid="layout-toggle"
              data-layout={continuous ? 'continuous' : 'pages'}
            >
              <IonIcon slot="icon-only" icon={continuous ? documentOutline : reorderFourOutline} aria-hidden="true" />
            </IonButton>
            <IonButton onClick={() => setTransposeOpen(true)} aria-label={t('transpose.button')} data-testid="transpose-button">
              <span className="transpose-label">{t('transpose.badge', { value: transposeBadge })}</span>
            </IonButton>
            <IonButton onClick={() => setZoomOpen(true)} aria-label={t('zoom')} data-testid="zoom-button">
              <IonIcon slot="icon-only" icon={searchOutline} aria-hidden="true" />
            </IonButton>
            </>}
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div
          ref={stageRef}
          className={continuous ? 'score-stage continuous' : 'score-stage'}
          data-testid="score-stage"
          data-score-theme={settings.scoreTheme}
          data-bar-numbers={settings.barNumbers}
          data-layout={continuous ? 'continuous' : 'pages'}
          data-picked-measure={pickedId}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Bar picked by a long press (any page rendered later, continuous mode included, gets the mark too). */}
          {pickedId && <style>{`.score-page g.measure[id="${CSS.escape(pickedId)}"] { color: var(--pupitre-picked-measure); }`}</style>}
          {v.status === 'ready' && continuous && v.pageCount > 0 && (
            <ContinuousView
              key={v.layoutVersion}
              ref={contRef}
              pageCount={v.pageCount}
              page={v.page}
              getAnchor={v.getAnchor}
              pageSvg={v.pageSvg}
              pageOfId={pageOfId}
              estimate={size?.height ?? 800}
              readingLine={settings.readingLine}
              pinchScale={pinchScale}
              onVisible={onVisible}
            />
          )}
          {v.status === 'ready' && !continuous && v.svg && topSvg && (
            <div
              ref={halfRef}
              className="score-page score-half"
              data-testid="half-page"
              style={pinchScale !== 1 ? { transform: `scale(${pinchScale})` } : undefined}
            >
              <div className="half-layer half-bottom" dangerouslySetInnerHTML={{ __html: v.svg }} />
              <div className="half-layer half-top" dangerouslySetInnerHTML={{ __html: topSvg }} />
              <div className="half-separator" />
            </div>
          )}
          {v.status === 'ready' && !continuous && v.svg && !topSvg && (
            <div
              key={turnAnim.key}
              className={`score-page${turnAnim.className}`}
              data-turn={turnAnim.dir}
              style={pinchScale !== 1 ? { transform: `scale(${pinchScale})` } : undefined}
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          )}
          <div className={`beat-dot ${pb.beat ?? ''}`} hidden={!pb.playing && !pb.metronomeOnly} />
          {pb.countingIn && <div className="count-in">{t('playback.countIn')}</div>}
          {v.status === 'loading' && (
            <div className="score-message"><IonSpinner /> {t('loading')}</div>
          )}
          {v.status === 'notFound' && <div className="score-message">{t('notFound')}</div>}
          {v.status === 'error' && <div className="score-message">{t('renderError')}</div>}
        </div>
      </IonContent>
      <IonFooter>
        {!locked && <SetlistBar sp={sp} />}
        {locked ? (
          <IonToolbar>
            <div className="playback-bar">{pageLabel}</div>
          </IonToolbar>
        ) : (
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={turnPrev} disabled={!continuous && v.page <= 1 && !half} aria-label={t('previousPage')}><IonIcon slot="icon-only" icon={chevronBack} aria-hidden="true" /></IonButton>
          </IonButtons>
          <div className="playback-bar">
            <IonButton fill="clear" onClick={togglePlay} disabled={!pb.available} aria-label={pb.playing ? t('playback.pause') : t('playback.play')}>
              <IonIcon slot="icon-only" icon={pb.playing ? pause : play} aria-hidden="true" />
            </IonButton>
            {/* −/+ next to the tempo when the footer is wide enough (CSS); the tempo value opens the tempo popover. */}
            <IonButton className="tempo-step" fill="clear" size="small" onClick={() => setTempo(tempoFactor - 0.05)} aria-label={t('playback.slower')}>
              <IonIcon slot="icon-only" icon={removeCircleOutline} aria-hidden="true" />
            </IonButton>
            <IonButton
              className="tempo-button"
              fill="clear"
              size="small"
              onClick={() => setTempoOpen(true)}
              aria-label={t('playback.tempoButton', { percent: Math.round(tempoFactor * 100) })}
              data-testid="tempo-button"
            >
              <span className="tempo-value" data-testid="tempo">{t('playback.tempo', { percent: Math.round(tempoFactor * 100) })}</span>
            </IonButton>
            <IonButton className="tempo-step" fill="clear" size="small" onClick={() => setTempo(tempoFactor + 0.05)} aria-label={t('playback.faster')}>
              <IonIcon slot="icon-only" icon={addCircleOutline} aria-hidden="true" />
            </IonButton>
            {/* Click: metronome with the auto-scroll on/off. Long press: metronome alone (no scrolling), again to stop. */}
            <IonButton
              {...metronomePress}
              fill={metronome || pb.metronomeOnly ? 'solid' : 'clear'}
              color={pb.metronomeOnly ? 'warning' : undefined}
              size="small"
              disabled={!pb.available}
              aria-label={pb.metronomeOnly ? t('playback.metronomeOnlyStop') : metronome ? t('playback.metronomeOn') : t('playback.metronomeOff')}
              aria-pressed={metronome}
              title={t('playback.metronomeHint')}
              data-testid="metronome-button"
              data-metronome-only={String(pb.metronomeOnly)}
              data-metronome={String(metronome)}
            >
              <IonIcon slot="icon-only" icon={timerOutline} aria-hidden="true" />
            </IonButton>
            {/* Tap: sound and mixer sheet. Long press: sound on/off. */}
            {audio.available && (
              <IonButton
                {...soundPress}
                fill={soundOn ? 'solid' : 'clear'}
                size="small"
                aria-label={`${t('sound.button')} (${soundOn ? t('sound.on') : t('sound.off')})`}
                title={t('sound.hint')}
                data-testid="sound-button"
                data-sound={String(soundOn)}
                data-status={audio.status}
              >
                <IonIcon slot="icon-only" icon={soundOn ? volumeHighOutline : volumeMuteOutline} aria-hidden="true" />
              </IonButton>
            )}
            {pageLabel}
          </div>
          <IonButtons slot="end">
            <IonButton onClick={() => setGotoOpen(true)} aria-label={t('goTo.button')} data-testid="goto-button"><IonIcon slot="icon-only" icon={navigateCircleOutline} aria-hidden="true" /></IonButton>
            <IonButton onClick={turnNext} disabled={!continuous && v.page >= v.pageCount} aria-label={t('nextPage')}><IonIcon slot="icon-only" icon={chevronForward} aria-hidden="true" /></IonButton>
          </IonButtons>
        </IonToolbar>
        )}
      </IonFooter>
      <GoToModal
        isOpen={gotoOpen}
        marks={v.score?.rehearsalMarks ?? []}
        numbers={numbers}
        measureCount={v.score?.measures ?? 0}
        onGo={goToMeasure}
        onDismiss={() => setGotoOpen(false)}
      />
      <ZoomPopover
        isOpen={zoomOpen}
        value={v.zoom}
        isAuto={v.view?.zoom === 'auto' || v.view?.zoom === undefined}
        onZoomOut={() => v.setZoom(v.zoom / 1.15)}
        onZoomIn={() => v.setZoom(v.zoom * 1.15)}
        onAuto={() => v.update({ zoom: 'auto' })}
        onDismiss={() => setZoomOpen(false)}
      />
      <TransposeModal
        isOpen={transposeOpen}
        keySig={v.key}
        value={transpose}
        onDismiss={() => setTransposeOpen(false)}
        onApply={(value) => {
          setTransposeOpen(false);
          if (sp.active && v.view) sp.setTranspose(value, v.view); // setlists: stored in the item override
          else v.update(value);
        }}
      />
      <TempoPopover isOpen={tempoOpen} value={tempoFactor} onChange={setTempo} onDismiss={() => setTempoOpen(false)} />
      <MixerModal
        isOpen={mixerOpen}
        parts={parts}
        soundOn={soundOn}
        available={audio.available}
        status={audio.status}
        mixer={mixer}
        defaultMaster={settings.soundVolume}
        mine={myParts}
        noProfile={!settings.myInstrument.names.length && !settings.myInstrument.instrumentIds.length}
        inSetlist={sp.active}
        onSound={setSound}
        onChange={setMixer}
        onDismiss={() => setMixerOpen(false)}
      />
      <PartsModal
        isOpen={partsOpen}
        parts={parts}
        selected={v.selectedParts}
        defaults={defaultPartIds(parts)}
        onDismiss={() => setPartsOpen(false)}
        onApply={(selectedParts) => {
          setPartsOpen(false);
          if (sp.active) sp.setParts(selectedParts); // setlists: stored in the item override
          else v.update({ selectedParts });
        }}
      />
    </IonPage>
  );
}
