import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonChip, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote,
  IonTitle, IonToggle, IonToolbar,
} from '@ionic/react';
import { addCircleOutline, removeCircleOutline } from 'ionicons/icons';
import { keyName, TRANSPOSE_PRESETS, transposeFifths } from '../../core/music/keys';

export interface TransposeValue {
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
}

interface Props {
  isOpen: boolean;
  value: TransposeValue;
  keySig: { fifths: number; mode: 'major' | 'minor' } | undefined;
  onApply(v: TransposeValue): void;
  onDismiss(): void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function TransposeModal({ isOpen, value, keySig, onApply, onDismiss }: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const [draft, setDraft] = useState<TransposeValue>(value);

  const from = keySig && keyName(keySig.fifths, keySig.mode);
  const to = keySig && keyName(transposeFifths(keySig.fifths, draft.transposeSemitones), keySig.mode);

  return (
    <IonModal isOpen={isOpen} onWillPresent={() => setDraft(value)} onDidDismiss={onDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('transpose.title')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          {from && to && (
            <IonItem>
              <IonLabel>{t('transpose.key')}</IonLabel>
              <IonNote slot="end" data-testid="transpose-key">{t('transpose.keyValue', { from, to, mode: t(`transpose.${keySig!.mode}`) })}</IonNote>
            </IonItem>
          )}
          <Stepper label={t('transpose.semitones')} value={draft.transposeSemitones} min={-11} max={11} testId="transpose-semitones" onChange={(n) => setDraft({ ...draft, transposeSemitones: n })} />
          <Stepper label={t('transpose.octave')} value={draft.transposeOctave} min={-2} max={2} testId="transpose-octave" onChange={(n) => setDraft({ ...draft, transposeOctave: n })} />
          <IonItem lines="none"><IonLabel>{t('transpose.presets')}</IonLabel></IonItem>
          <div className="ion-padding-horizontal">
            {TRANSPOSE_PRESETS.map((p) => (
              <IonChip key={p.id} outline={draft.transposeSemitones !== p.semitones} onClick={() => setDraft({ ...draft, transposeSemitones: p.semitones })}>
                {t(`transpose.preset.${p.id}`)}
              </IonChip>
            ))}
          </div>
          <IonItem>
            <IonToggle checked={draft.concertPitch} onIonChange={(e) => setDraft({ ...draft, concertPitch: e.detail.checked })}>
              <IonLabel>{t('transpose.concertPitch')}<IonNote className="ion-text-wrap" style={{ display: 'block' }}>{t('transpose.concertPitchHint')}</IonNote></IonLabel>
            </IonToggle>
          </IonItem>
        </IonList>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => setDraft({ transposeSemitones: 0, transposeOctave: 0, concertPitch: false })}>{t('transpose.reset')}</IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton strong onClick={() => onApply(draft)}>{t('transpose.apply')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Stepper(p: { label: string; value: number; min: number; max: number; testId: string; onChange(n: number): void }) {
  return (
    <IonItem>
      <IonLabel>{p.label}</IonLabel>
      <IonButtons slot="end">
        <IonButton onClick={() => p.onChange(clamp(p.value - 1, p.min, p.max))} disabled={p.value <= p.min}><IonIcon slot="icon-only" icon={removeCircleOutline} /></IonButton>
        <span style={{ minWidth: '2.5em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} data-testid={p.testId}>{signed(p.value)}</span>
        <IonButton onClick={() => p.onChange(clamp(p.value + 1, p.min, p.max))} disabled={p.value >= p.max}><IonIcon slot="icon-only" icon={addCircleOutline} /></IonButton>
      </IonButtons>
    </IonItem>
  );
}
