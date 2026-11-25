import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import {
  addOutline, chevronBack, chevronForward, pause, peopleOutline, play, removeOutline, scanOutline, timerOutline, removeCircleOutline, addCircleOutline,
  lockClosed, lockOpenOutline, navigateCircleOutline,
} from 'ionicons/icons';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { routes } from '../../app/routes';
import { defaultPartIds } from '../../core/model/types';
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
import { halfPageSplit, measureNumbers, nextPosition, pageOfMeasure, previousPosition } from '../../core/navigation/navigation';
import { GoToModal } from './GoToModal';
import { useLongPress } from './useLongPress';
import './viewer.css';

const UNLOCK_PRESS_MS = 800;
const METRONOME_ONLY_PRESS_MS = 600;
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
  const [gotoOpen, setGotoOpen] = useState(false);
  const [locked, setLockedState] = useState(sessionLocked);
  const setLocked = (l: boolean) => {
    sessionLocked = l;
    setLockedState(l);
  };
  // Half-page turn: page for which the composite view (top of page + 1 over bottom of page) is shown.
  const [halfOf, setHalfOf] = useState<number>();
  const [composite, setComposite] = useState<{ base: string; svg: string }>();
  const [toast] = useIonToast();
  const { settings } = useSettings();
  const sp = useSetlistPlayback(); // setlists
  const v = useScoreViewer(scoreId, size, settings, sp.override);
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
  });
  const setTempo = (f: number) => v.update({ tempoFactor: Math.round(Math.min(1.5, Math.max(0.5, f)) * 100) / 100 });
  // --- end auto-scroll & metronome ---

  // --- page turns (full or half page) ---
  const half = settings.halfPageTurn && halfOf === v.page && v.page < v.pageCount;
  const turn = (to: { page: number; half: boolean }) => {
    setHalfOf(to.half ? to.page : undefined);
    v.goTo(to.page);
  };
  const turnNext = () => turn(nextPosition({ page: v.page, half }, v.pageCount, settings.halfPageTurn));
  const turnPrev = () => turn(previousPosition({ page: v.page, half }, settings.halfPageTurn));
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
    pb.toggle();
  };
  // --- end page turns ---

  // Keyboard and Bluetooth page-turner pedals (they send key presses; keys configurable in the settings).
  const onKey = useRef<(e: KeyboardEvent) => void>(undefined);
  useLayoutEffect(() => {
    onKey.current = (e) => {
      if (partsOpen || transposeOpen || gotoOpen || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = pedalAction(e.code, settings.pedalKeys);
      if (!action) return;
      e.preventDefault();
      if (action === 'playPause') togglePlay();
      else if (action === 'prev') turnPrev();
      else if (sp.active && v.page >= v.pageCount) sp.nextAtEnd(); // setlists: last page → next piece
      else turnNext();
    };
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

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
    swipe: settings.swipe,
    pinch: !locked,
  });

  // --- go to bar / rehearsal mark ---
  const numbers = useMemo(() => (gotoOpen && v.xml ? measureNumbers(v.xml) : []), [gotoOpen, v.xml]);
  const goToMeasure = (measureIndex: number) => {
    setGotoOpen(false);
    const target = pageOfMeasure(measureIndex, v.xmlToRendered, v.renderedPages);
    if (!target) return;
    setHalfOf(undefined);
    v.goTo(target);
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
    () => (pb.metronomeOnly ? pb.pause() : v.update({ metronomeEnabled: !metronome })),
    METRONOME_ONLY_PRESS_MS,
  );
  // --- end lock mode & metronome only ---

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
              <IonIcon slot="icon-only" icon={locked ? lockClosed : lockOpenOutline} />
            </IonButton>
            {!locked && parts.length > 1 && (
              <IonButton onClick={() => setPartsOpen(true)} aria-label={t('parts.button')} data-testid="parts-button">
                <IonIcon slot="start" icon={peopleOutline} />
                {selectedCount}/{parts.length}
              </IonButton>
            )}
            {!locked && <>
            <IonButton onClick={() => setTransposeOpen(true)} aria-label={t('transpose.button')} data-testid="transpose-button">
              <span className="transpose-label">{t('transpose.badge', { value: transposeBadge })}</span>
            </IonButton>
            <IonButton onClick={() => v.setZoom(v.zoom / 1.15)} aria-label={t('zoomOut')}><IonIcon slot="icon-only" icon={removeOutline} /></IonButton>
            <IonButton onClick={() => v.update({ zoom: 'auto' })} aria-label={t('zoomReset')}><IonIcon slot="icon-only" icon={scanOutline} /></IonButton>
            <IonButton onClick={() => v.setZoom(v.zoom * 1.15)} aria-label={t('zoomIn')}><IonIcon slot="icon-only" icon={addOutline} /></IonButton>
            </>}
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div ref={stageRef} className="score-stage" data-testid="score-stage" data-score-theme={settings.scoreTheme}>
          {v.status === 'ready' && v.svg && topSvg && (
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
          {v.status === 'ready' && v.svg && !topSvg && (
            <div
              className="score-page"
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
            <IonButton onClick={turnPrev} disabled={v.page <= 1 && !half} aria-label={t('previousPage')}><IonIcon slot="icon-only" icon={chevronBack} /></IonButton>
          </IonButtons>
          <div className="playback-bar">
            <IonButton fill="clear" onClick={togglePlay} disabled={!pb.available} aria-label={pb.playing ? t('playback.pause') : t('playback.play')}>
              <IonIcon slot="icon-only" icon={pb.playing ? pause : play} />
            </IonButton>
            <IonButton fill="clear" size="small" onClick={() => setTempo(tempoFactor - 0.05)} aria-label={t('playback.slower')}>
              <IonIcon slot="icon-only" icon={removeCircleOutline} />
            </IonButton>
            <span className="tempo-value" data-testid="tempo">{t('playback.tempo', { percent: Math.round(tempoFactor * 100) })}</span>
            <IonButton fill="clear" size="small" onClick={() => setTempo(tempoFactor + 0.05)} aria-label={t('playback.faster')}>
              <IonIcon slot="icon-only" icon={addCircleOutline} />
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
            >
              <IonIcon slot="icon-only" icon={timerOutline} />
            </IonButton>
            {pageLabel}
          </div>
          <IonButtons slot="end">
            <IonButton onClick={() => setGotoOpen(true)} aria-label={t('goTo.button')} data-testid="goto-button"><IonIcon slot="icon-only" icon={navigateCircleOutline} /></IonButton>
            <IonButton onClick={turnNext} disabled={v.page >= v.pageCount} aria-label={t('nextPage')}><IonIcon slot="icon-only" icon={chevronForward} /></IonButton>
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
