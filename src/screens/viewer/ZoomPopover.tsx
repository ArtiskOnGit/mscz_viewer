// Zoom controls, opened from a single toolbar button: the header has no room for −/auto/+ on a phone in portrait
// (reported on a device: the "+" was cut off). Pinch-to-zoom stays available on the score.
import { useTranslation } from 'react-i18next';
import { IonButton, IonContent, IonIcon, IonPopover } from '@ionic/react';
import { addCircleOutline, removeCircleOutline } from 'ionicons/icons';

interface Props {
  isOpen: boolean;
  /** Zoom factor relative to the automatic zoom (1 = 100 %). */
  value: number;
  isAuto: boolean;
  onZoomOut(): void;
  onZoomIn(): void;
  onAuto(): void;
  onDismiss(): void;
}

export function ZoomPopover({ isOpen, value, isAuto, onZoomOut, onZoomIn, onAuto, onDismiss }: Props) {
  const { t } = useTranslation('viewer');
  return (
    <IonPopover isOpen={isOpen} onDidDismiss={onDismiss} className="tempo-popover" data-testid="zoom-popover">
      <IonContent className="ion-padding">
        <div className="tempo-popover-row">
          <IonButton fill="clear" onClick={onZoomOut} aria-label={t('zoomOut')} data-testid="zoom-out">
            <IonIcon slot="icon-only" icon={removeCircleOutline} aria-hidden="true" />
          </IonButton>
          <span className="tempo-popover-value" aria-live="polite">{t('zoomValue', { percent: Math.round(value * 100) })}</span>
          <IonButton fill="clear" onClick={onZoomIn} aria-label={t('zoomIn')} data-testid="zoom-in">
            <IonIcon slot="icon-only" icon={addCircleOutline} aria-hidden="true" />
          </IonButton>
        </div>
        <IonButton expand="block" fill="outline" onClick={onAuto} disabled={isAuto} data-testid="zoom-auto">
          {t('zoomReset')}
        </IonButton>
      </IonContent>
    </IonPopover>
  );
}
