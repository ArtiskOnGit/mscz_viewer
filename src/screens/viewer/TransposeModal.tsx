import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonChip, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote,
  IonSegment, IonSegmentButton, IonTitle, IonToggle, IonToolbar,
} from '@ionic/react';
import { addCircleOutline, removeCircleOutline } from 'ionicons/icons';
import { baseKey, enharmonicKeys, keyName, noteName, targetFifths, TRANSPOSE_PRESETS, type AccidentalPreference, type KeySig } from '../../core/music/keys';
import { useNoteNaming } from '../../state/useNoteNaming';

export interface TransposeValue {
  transposeSemitones: number;
  transposeOctave: number;
  concertPitch: boolean;
  accidentalPreference: AccidentalPreference;
}

const PREFERENCES: AccidentalPreference[] = ['auto', 'sharps', 'flats'];

interface Props {
  isOpen: boolean;
  value: TransposeValue;
  /** Written key of the score (undefined when unknown, e.g. from a setlist: the ♯/♭ choice is then always offered). */
  keySig: KeySig | undefined;
  /** Offer the brass-band "B♭ treble clef" preset (+ a major 9th; the caller switches low-clef parts to treble clef). */
  brassPreset?: boolean;
  /** `trebleClef`: the brass-band preset was chosen (and kept as is). */
  onApply(v: TransposeValue, trebleClef: boolean): void;
  onDismiss(): void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Brass band: trombone, euphonium, baritone read a treble clef written a major 9th above the sounding pitch. */
export const BRASS_TREBLE = { transposeSemitones: 2, transposeOctave: 1 } as const;

export function TransposeModal({ isOpen, value, keySig, brassPreset, onApply, onDismiss }: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const [draft, setDraftValue] = useState<TransposeValue>(value);
  const [brass, setBrass] = useState(false);
  // Any other change of the transposition cancels the brass-band preset (its clef change goes with it).
  const setDraft = (v: TransposeValue) => {
    setDraftValue(v);
    setBrass(false);
  };
  const naming = useNoteNaming();

  const key = keySig && baseKey(keySig, draft.concertPitch);
  const total = draft.transposeSemitones + 12 * draft.transposeOctave;
  const from = key && keyName(key.fifths, key.mode, naming);
  const to = key && keyName(targetFifths(key.fifths, total, draft.accidentalPreference), key.mode, naming);
  // Enharmonic alternative (D♭/C♯…): let the user choose the spelling.
  const choices = key ? enharmonicKeys(key.fifths, total) : [];
  const showPreference = !key || choices.length > 1;
  const choiceLabel = (p: AccidentalPreference) => {
    const name = key && p !== 'auto' ? keyName(targetFifths(key.fifths, total, p), key.mode, naming) : undefined;
    return name ?? t(`transpose.accidentals.${p}`);
  };

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
              <IonNote slot="end" data-testid="transpose-key">{t('transpose.keyValue', { from, to, mode: t(`transpose.${key!.mode}`) })}</IonNote>
            </IonItem>
          )}
          {showPreference && (
            <IonItem lines="none">
              <IonLabel className="ion-text-wrap">
                {t('transpose.accidentals.label')}
                <IonSegment
                  value={draft.accidentalPreference}
                  onIonChange={(e) => setDraft({ ...draft, accidentalPreference: e.detail.value as AccidentalPreference })}
                  data-testid="accidental-preference"
                  style={{ marginTop: 6 }}
                >
                  {PREFERENCES.map((p) => (
                    <IonSegmentButton key={p} value={p} data-testid={`accidentals-${p}`}>
                      <IonLabel>{choiceLabel(p)}</IonLabel>
                    </IonSegmentButton>
                  ))}
                </IonSegment>
              </IonLabel>
            </IonItem>
          )}
          <Stepper label={t('transpose.semitones')} value={draft.transposeSemitones} min={-11} max={11} testId="transpose-semitones" onChange={(n) => setDraft({ ...draft, transposeSemitones: n })} />
          <Stepper label={t('transpose.octave')} value={draft.transposeOctave} min={-2} max={2} testId="transpose-octave" onChange={(n) => setDraft({ ...draft, transposeOctave: n })} />
          <IonItem lines="none"><IonLabel>{t('transpose.presets')}</IonLabel></IonItem>
          <div className="ion-padding-horizontal">
            {TRANSPOSE_PRESETS.map((p) => (
              <IonChip key={p.id} outline={brass || draft.transposeSemitones !== p.semitones} onClick={() => setDraft({ ...draft, transposeSemitones: p.semitones })}>
                {t(`transpose.preset.${p.id}`, { note: noteName(p.note, naming) })}
              </IonChip>
            ))}
            {brassPreset && (
              <IonChip
                outline={!brass}
                data-testid="preset-bb-treble"
                onClick={() => {
                  setDraftValue({ ...draft, ...BRASS_TREBLE });
                  setBrass(true);
                }}
              >
                {t('transpose.preset.bbTreble', { note: noteName('B♭', naming) })}
              </IonChip>
            )}
          </div>
          {brass && <IonNote className="ion-padding-horizontal ion-text-wrap" style={{ display: 'block' }} data-testid="bb-treble-hint">{t('transpose.bbTrebleHint')}</IonNote>}
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
            <IonButton onClick={() => setDraft({ transposeSemitones: 0, transposeOctave: 0, concertPitch: false, accidentalPreference: 'auto' })}>{t('transpose.reset')}</IonButton>
          </IonButtons>
          <IonButtons slot="end">
            <IonButton strong onClick={() => onApply(draft, brass)}>{t('transpose.apply')}</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Stepper(p: { label: string; value: number; min: number; max: number; testId: string; onChange(n: number): void }) {
  const { t } = useTranslation('viewer');
  return (
    <IonItem>
      <IonLabel>{p.label}</IonLabel>
      <IonButtons slot="end">
        <IonButton onClick={() => p.onChange(clamp(p.value - 1, p.min, p.max))} disabled={p.value <= p.min} aria-label={t('transpose.decrease', { label: p.label })}><IonIcon slot="icon-only" icon={removeCircleOutline} aria-hidden="true" /></IonButton>
        <span style={{ minWidth: '2.5em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} data-testid={p.testId}>{signed(p.value)}</span>
        <IonButton onClick={() => p.onChange(clamp(p.value + 1, p.min, p.max))} disabled={p.value >= p.max} aria-label={t('transpose.increase', { label: p.label })}><IonIcon slot="icon-only" icon={addCircleOutline} aria-hidden="true" /></IonButton>
      </IonButtons>
    </IonItem>
  );
}
