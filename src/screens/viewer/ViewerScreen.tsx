import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/react';
import { addOutline, chevronBack, chevronForward, pause, peopleOutline, play, removeOutline, scanOutline, timerOutline, removeCircleOutline, addCircleOutline } from 'ionicons/icons';
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
import './viewer.css';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

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

  // Keyboard and Bluetooth page-turner pedals (they send key presses).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (partsOpen || transposeOpen || e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyP' || e.code === 'MediaPlayPause') {
        e.preventDefault();
        pb.toggle();
      } else if (NEXT_KEYS.has(e.code)) {
        e.preventDefault();
        if (sp.active && v.page >= v.pageCount) sp.nextAtEnd(); // setlists: last page → next piece
        else v.next();
      } else if (PREV_KEYS.has(e.code)) {
        e.preventDefault();
        v.prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [v.next, v.prev, v.page, v.pageCount, sp.active, sp.nextAtEnd, partsOpen, transposeOpen, pb.toggle]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinchScale = usePageGestures(stageRef, {
    // While playing, a tap pauses (setting) instead of turning the page.
    onNext: () => (pb.playing && settings.tapPauses ? pb.pause() : v.next()),
    onPrev: () => (pb.playing && settings.tapPauses ? pb.pause() : v.prev()),
    onToggleChrome: () => (pb.playing && settings.tapPauses ? pb.pause() : setChrome((c) => !c)),
    onPinchEnd: (ratio) => v.setZoom(v.zoom * ratio),
    tapZones: settings.tapZones,
    swipe: settings.swipe,
  });

  const parts = v.score?.parts ?? [];
  // Transposition actually shown (setlists: the piece's override wins over the score's settings).
  const transpose = {
    transposeSemitones: v.shown?.transposeSemitones ?? 0,
    transposeOctave: v.shown?.transposeOctave ?? 0,
    concertPitch: v.shown?.concertPitch ?? false,
  };
  const transposeBadge = transposeBadgeValue(transpose);
  const selectedCount = v.selectedParts.length;

  return (
    <IonPage className={chrome ? '' : 'score-chrome-hidden'}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>
          <IonTitle>{v.score?.title ?? t('title')}</IonTitle>
          <IonButtons slot="end">
            {parts.length > 1 && (
              <IonButton onClick={() => setPartsOpen(true)} aria-label={t('parts.button')} data-testid="parts-button">
                <IonIcon slot="start" icon={peopleOutline} />
                {selectedCount}/{parts.length}
              </IonButton>
            )}
            <IonButton onClick={() => setTransposeOpen(true)} aria-label={t('transpose.button')} data-testid="transpose-button">
              <span className="transpose-label">{t('transpose.badge', { value: transposeBadge })}</span>
            </IonButton>
            <IonButton onClick={() => v.setZoom(v.zoom / 1.15)} aria-label={t('zoomOut')}><IonIcon slot="icon-only" icon={removeOutline} /></IonButton>
            <IonButton onClick={() => v.update({ zoom: 'auto' })} aria-label={t('zoomReset')}><IonIcon slot="icon-only" icon={scanOutline} /></IonButton>
            <IonButton onClick={() => v.setZoom(v.zoom * 1.15)} aria-label={t('zoomIn')}><IonIcon slot="icon-only" icon={addOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div ref={stageRef} className="score-stage" data-testid="score-stage" data-score-theme={settings.scoreTheme}>
          {v.status === 'ready' && v.svg && (
            <div
              className="score-page"
              style={pinchScale !== 1 ? { transform: `scale(${pinchScale})` } : undefined}
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          )}
          <div className={`beat-dot ${pb.beat ?? ''}`} hidden={!pb.playing} />
          {pb.countingIn && <div className="count-in">{t('playback.countIn')}</div>}
          {v.status === 'loading' && (
            <div className="score-message"><IonSpinner /> {t('loading')}</div>
          )}
          {v.status === 'notFound' && <div className="score-message">{t('notFound')}</div>}
          {v.status === 'error' && <div className="score-message">{t('renderError')}</div>}
        </div>
      </IonContent>
      <IonFooter>
        <SetlistBar sp={sp} />
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={v.prev} disabled={v.page <= 1} aria-label={t('previousPage')}><IonIcon slot="icon-only" icon={chevronBack} /></IonButton>
          </IonButtons>
          <div className="playback-bar">
            <IonButton fill="clear" onClick={pb.toggle} disabled={!pb.available} aria-label={pb.playing ? t('playback.pause') : t('playback.play')}>
              <IonIcon slot="icon-only" icon={pb.playing ? pause : play} />
            </IonButton>
            <IonButton fill="clear" size="small" onClick={() => setTempo(tempoFactor - 0.05)} aria-label={t('playback.slower')}>
              <IonIcon slot="icon-only" icon={removeCircleOutline} />
            </IonButton>
            <span className="tempo-value" data-testid="tempo">{t('playback.tempo', { percent: Math.round(tempoFactor * 100) })}</span>
            <IonButton fill="clear" size="small" onClick={() => setTempo(tempoFactor + 0.05)} aria-label={t('playback.faster')}>
              <IonIcon slot="icon-only" icon={addCircleOutline} />
            </IonButton>
            <IonButton
              fill={metronome ? 'solid' : 'clear'}
              size="small"
              onClick={() => v.update({ metronomeEnabled: !metronome })}
              aria-label={metronome ? t('playback.metronomeOn') : t('playback.metronomeOff')}
              aria-pressed={metronome}
            >
              <IonIcon slot="icon-only" icon={timerOutline} />
            </IonButton>
            <span className="page-indicator" data-testid="page-indicator">
              {v.pageCount > 0 ? t('page', { page: v.page, count: v.pageCount }) : ''}
            </span>
          </div>
          <IonButtons slot="end">
            <IonButton onClick={v.next} disabled={v.page >= v.pageCount} aria-label={t('nextPage')}><IonIcon slot="icon-only" icon={chevronForward} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
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
