// Settings section "Pedal / keyboard": keys of each action, key capture dialog, reset to defaults.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonListHeader, IonModal, IonNote, IonTitle, IonToolbar } from '@ionic/react';
import { DEFAULT_PEDAL_KEYS, PEDAL_ACTIONS, assignPedalKey, type PedalAction, type PedalKeys } from '../../core/navigation/pedalKeys';

interface Props {
  keys: PedalKeys;
  onChange(keys: PedalKeys): void;
}

export function PedalKeysSection({ keys, onChange }: Props) {
  const { t } = useTranslation(['settings', 'common']);
  const [capturing, setCapturing] = useState<PedalAction>();
  const [captured, setCaptured] = useState<string>();

  // Record the next key press (Escape cancels, as in any dialog).
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || !e.code) return;
      e.preventDefault();
      e.stopPropagation();
      setCaptured(e.code);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  const close = () => {
    setCapturing(undefined);
    setCaptured(undefined);
  };
  const apply = (mode: 'add' | 'replace') => {
    if (capturing && captured) onChange(assignPedalKey(keys, capturing, captured, mode));
    close();
  };

  return (
    <>
      <IonListHeader>{t('sections.pedal')}</IonListHeader>
      {PEDAL_ACTIONS.map((action) => (
        <IonItem key={action} data-testid={`pedal-${action}`}>
          <IonLabel className="ion-text-wrap">
            {t(`pedal.${action}`)}
            <IonNote style={{ display: 'block' }} data-testid={`pedal-keys-${action}`}>{keys[action].length ? keys[action].join(', ') : t('pedal.none')}</IonNote>
          </IonLabel>
          <IonButton slot="end" fill="outline" className="touch-48" onClick={() => setCapturing(action)} data-testid={`pedal-set-${action}`}>{t('pedal.setKey')}</IonButton>
        </IonItem>
      ))}
      <IonItem button detail={false} onClick={() => onChange(DEFAULT_PEDAL_KEYS)} data-testid="pedal-reset"><IonLabel>{t('pedal.reset')}</IonLabel></IonItem>

      <IonModal isOpen={!!capturing} onDidDismiss={close} initialBreakpoint={0.4} breakpoints={[0, 0.4]}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>{capturing ? t('pedal.captureTitle', { action: t(`pedal.${capturing}`) }) : ''}</IonTitle>
            <IonButtons slot="end"><IonButton onClick={close}>{t('common:actions.cancel')}</IonButton></IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding ion-text-center">
          <p data-testid="pedal-capture">{captured ? t('pedal.captured', { key: captured }) : t('pedal.capturePrompt')}</p>
          {captured && (
            <>
              <IonButton onClick={() => apply('add')} data-testid="pedal-add">{t('pedal.add')}</IonButton>
              <IonButton fill="outline" onClick={() => apply('replace')} data-testid="pedal-replace">{t('pedal.replace')}</IonButton>
            </>
          )}
        </IonContent>
      </IonModal>
    </>
  );
}
