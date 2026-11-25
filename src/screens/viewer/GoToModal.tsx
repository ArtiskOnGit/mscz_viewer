// "Go to bar / rehearsal mark" dialog.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonChip, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonTitle, IonToolbar,
} from '@ionic/react';
import { measureIndexForBar } from '../../core/navigation/navigation';

interface Props {
  isOpen: boolean;
  marks: readonly { label: string; measureIndex: number }[];
  /** Printed bar numbers by MusicXML measure rank (may be empty: ranks are then used). */
  numbers: readonly string[];
  measureCount: number;
  onGo(measureIndex: number): void;
  onDismiss(): void;
}

export function GoToModal({ isOpen, marks, numbers, measureCount, onGo, onDismiss }: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const [bar, setBar] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const i = measureIndexForBar(bar, numbers, measureCount);
    if (i === undefined) return setInvalid(true);
    onGo(i);
  };

  return (
    <IonModal
      isOpen={isOpen}
      onWillPresent={() => {
        setBar('');
        setInvalid(false);
      }}
      onDidDismiss={onDismiss}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('goTo.title')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem>
            <IonInput
              label={t('goTo.bar')}
              labelPlacement="stacked"
              inputmode="numeric"
              enterkeyhint="go"
              value={bar}
              data-testid="goto-input"
              placeholder={t('goTo.barPlaceholder', { count: measureCount })}
              onIonInput={(e) => {
                setBar(String(e.detail.value ?? ''));
                setInvalid(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <IonButton slot="end" onClick={submit} data-testid="goto-submit">{t('goTo.go')}</IonButton>
          </IonItem>
          {invalid && <IonItem lines="none"><IonNote color="danger" data-testid="goto-invalid">{t('goTo.invalid')}</IonNote></IonItem>}
          <IonItem lines="none"><IonLabel>{t('goTo.marks')}</IonLabel></IonItem>
          <div className="ion-padding-horizontal" data-testid="goto-marks">
            {marks.length === 0 && <IonNote>{t('goTo.noMarks')}</IonNote>}
            {marks.map((m, i) => (
              <IonChip key={`${i}-${m.label}`} onClick={() => onGo(m.measureIndex)} data-testid="goto-mark" data-measure={m.measureIndex}>
                {m.label}
              </IonChip>
            ))}
          </div>
        </IonList>
      </IonContent>
    </IonModal>
  );
}
