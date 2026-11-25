import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonPage, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/react';
import { addOutline, chevronBack, chevronForward, peopleOutline, removeOutline, scanOutline } from 'ionicons/icons';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { routes } from '../../app/routes';
import { defaultPartIds } from '../../core/model/types';
import { useScoreViewer } from './useScoreViewer';
import { PartsModal } from './PartsModal';
import { usePageGestures } from './usePageGestures';
import './viewer.css';

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', 'Space', 'Enter', 'NumpadEnter']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

export function ViewerScreen() {
  const { t } = useTranslation('viewer');
  const { scoreId = '' } = useParams<{ scoreId: string }>();
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [chrome, setChrome] = useState(true);
  const [partsOpen, setPartsOpen] = useState(false);
  const v = useScoreViewer(scoreId, size);

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
    void KeepAwake.keepAwake().catch(() => undefined);
    return () => void KeepAwake.allowSleep().catch(() => undefined);
  }, []);

  // Keyboard and Bluetooth page-turner pedals (they send key presses).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (partsOpen || e.target instanceof HTMLInputElement) return;
      if (NEXT_KEYS.has(e.code)) {
        e.preventDefault();
        v.next();
      } else if (PREV_KEYS.has(e.code)) {
        e.preventDefault();
        v.prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [v.next, v.prev, partsOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const pinchScale = usePageGestures(stageRef, {
    onNext: v.next,
    onPrev: v.prev,
    onToggleChrome: () => setChrome((c) => !c),
    onPinchEnd: (ratio) => v.setZoom(v.zoom * ratio),
  });

  const parts = v.score?.parts ?? [];
  const selectedCount = v.selectedParts.length;

  return (
    <IonPage className={chrome ? '' : 'score-chrome-hidden'}>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>
          <IonTitle>{v.score?.title ?? t('title')}</IonTitle>
          <IonButtons slot="end">
            {parts.length > 1 && (
              <IonButton onClick={() => setPartsOpen(true)} aria-label={t('parts.button')}>
                <IonIcon slot="start" icon={peopleOutline} />
                {selectedCount}/{parts.length}
              </IonButton>
            )}
            <IonButton onClick={() => v.setZoom(v.zoom / 1.15)} aria-label={t('zoomOut')}><IonIcon slot="icon-only" icon={removeOutline} /></IonButton>
            <IonButton onClick={() => v.setZoom(1)} aria-label={t('zoomReset')}><IonIcon slot="icon-only" icon={scanOutline} /></IonButton>
            <IonButton onClick={() => v.setZoom(v.zoom * 1.15)} aria-label={t('zoomIn')}><IonIcon slot="icon-only" icon={addOutline} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent scrollY={false}>
        <div ref={stageRef} className="score-stage" data-testid="score-stage">
          {v.status === 'ready' && v.svg && (
            <div
              className="score-page"
              style={pinchScale !== 1 ? { transform: `scale(${pinchScale})` } : undefined}
              dangerouslySetInnerHTML={{ __html: v.svg }}
            />
          )}
          {v.status === 'loading' && (
            <div className="score-message"><IonSpinner /> {t('loading')}</div>
          )}
          {v.status === 'notFound' && <div className="score-message">{t('notFound')}</div>}
          {v.status === 'error' && <div className="score-message">{t('renderError')}</div>}
        </div>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={v.prev} disabled={v.page <= 1} aria-label={t('previousPage')}><IonIcon slot="icon-only" icon={chevronBack} /></IonButton>
          </IonButtons>
          <div className="page-indicator" data-testid="page-indicator">
            {v.pageCount > 0 ? t('page', { page: v.page, count: v.pageCount }) : ''}
          </div>
          <IonButtons slot="end">
            <IonButton onClick={v.next} disabled={v.page >= v.pageCount} aria-label={t('nextPage')}><IonIcon slot="icon-only" icon={chevronForward} /></IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
      <PartsModal
        isOpen={partsOpen}
        parts={parts}
        selected={v.selectedParts}
        defaults={defaultPartIds(parts)}
        onDismiss={() => setPartsOpen(false)}
        onApply={(selectedParts) => {
          setPartsOpen(false);
          v.update({ selectedParts });
        }}
      />
    </IonPage>
  );
}
