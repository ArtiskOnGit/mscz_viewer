// Tempo factor popover, opened from the tempo value of the footer. On a phone in portrait the footer has no room for
// the −/+ buttons next to the value (sound button, ADR-026): they live here, with a slider and a reset to 100 %.
import { useTranslation } from 'react-i18next';
import { IonButton, IonContent, IonIcon, IonPopover, IonRange } from '@ionic/react';
import { addCircleOutline, removeCircleOutline } from 'ionicons/icons';

interface Props {
  isOpen: boolean;
  /** 0.5..1.5 */
  value: number;
  onChange(factor: number): void;
  onDismiss(): void;
}

export function TempoPopover({ isOpen, value, onChange, onDismiss }: Props) {
  const { t } = useTranslation('viewer');
  const percent = Math.round(value * 100);
  return (
    <IonPopover isOpen={isOpen} onDidDismiss={onDismiss} className="tempo-popover" data-testid="tempo-popover">
      <IonContent className="ion-padding">
        <div className="tempo-popover-row">
          <IonButton fill="clear" onClick={() => onChange(value - 0.05)} disabled={percent <= 50} aria-label={t('playback.slower')}>
            <IonIcon slot="icon-only" icon={removeCircleOutline} aria-hidden="true" />
          </IonButton>
          <span className="tempo-popover-value" aria-live="polite">{t('playback.tempo', { percent })}</span>
          <IonButton fill="clear" onClick={() => onChange(value + 0.05)} disabled={percent >= 150} aria-label={t('playback.faster')}>
            <IonIcon slot="icon-only" icon={addCircleOutline} aria-hidden="true" />
          </IonButton>
        </div>
        <IonRange
          aria-label={t('playback.tempoSlider')}
          min={50}
          max={150}
          step={5}
          snaps
          value={percent}
          onIonChange={(e) => onChange(Number(e.detail.value) / 100)}
        />
        <IonButton expand="block" fill="outline" onClick={() => onChange(1)} disabled={percent === 100}>
          {t('playback.tempoReset')}
        </IonButton>
      </IonContent>
    </IonPopover>
  );
}
