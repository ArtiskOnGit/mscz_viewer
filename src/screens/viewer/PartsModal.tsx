import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonItem, IonList, IonModal, IonNote, IonSelect, IonSelectOption, IonText,
  IonTitle, IonToolbar,
} from '@ionic/react';
import type { ClefChoice, Part } from '../../core/model/types';
import { CLEF_CHOICES, isClefChoice, type OriginalClef } from '../../core/musicxml/clefs';

interface Props {
  isOpen: boolean;
  parts: Part[];
  /** Parts currently displayed. */
  selected: string[];
  /** Default parts (visible in MuseScore): choosing exactly these is stored as "default". */
  defaults: string[];
  /** Clef of each part in the score: a clef menu is offered for pitched parts. Undefined = no clef menu. */
  originalClefs?: Record<string, OriginalClef>;
  /** Clefs currently chosen (musicXmlId → clef). */
  clefs?: Record<string, ClefChoice>;
  /** Show the setlist note under the list (clefs are kept for this piece only). */
  inSetlist?: boolean;
  onApply(selected: string[], clefs: Record<string, ClefChoice>): void;
  onDismiss(): void;
}

const ORIGINAL = 'original';

export function PartsModal({ isOpen, parts, selected, defaults, originalClefs, clefs, inSetlist, onApply, onDismiss }: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const all = parts.map((p) => p.musicXmlId);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [clefDraft, setClefDraft] = useState<Record<string, ClefChoice>>({});

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const setClef = (id: string, value: unknown) =>
    setClefDraft((prev) => {
      const { [id]: _old, ...rest } = prev;
      return isClefChoice(value) && value !== originalClefs?.[id] ? { ...rest, [id]: value } : rest;
    });
  const allChecked = checked.size === all.length;
  const clefName = (c: OriginalClef) => t(`parts.clef.${c === 'unpitched' ? 'other' : c}`);

  return (
    <IonModal
      isOpen={isOpen}
      onWillPresent={() => {
        setChecked(new Set(selected));
        setClefDraft({ ...clefs });
      }}
      onDidDismiss={onDismiss}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('parts.title')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem>
            <IonCheckbox checked={allChecked} indeterminate={!allChecked && checked.size > 0} onIonChange={(e) => setChecked(new Set(e.detail.checked ? all : []))}>
              <strong>{t('parts.all')}</strong>
            </IonCheckbox>
          </IonItem>
          {parts.map((p) => {
            const original = originalClefs?.[p.musicXmlId];
            const chosen = clefDraft[p.musicXmlId];
            const clefLabel = chosen ? t(`parts.clef.${chosen}`) : t('parts.clef.original');
            return (
              <IonItem key={p.musicXmlId} data-testid={`part-${p.musicXmlId}`}>
                <IonCheckbox
                  justify="start"
                  labelPlacement="end"
                  checked={checked.has(p.musicXmlId)}
                  onIonChange={(e) => toggle(p.musicXmlId, e.detail.checked)}
                  className="parts-checkbox"
                >
                  <span className="ion-text-wrap">
                    {p.name}
                    {p.hiddenInSource && <IonText color="medium"> · {t('parts.hiddenInSource')}</IonText>}
                  </span>
                </IonCheckbox>
                {original && original !== 'unpitched' && (
                  <IonSelect
                    slot="end"
                    interface="action-sheet"
                    interfaceOptions={{ header: t('parts.clef.title', { name: p.name }) }}
                    value={chosen ?? ORIGINAL}
                    selectedText={chosen ? t(`parts.clef.short.${chosen}`) : t('parts.clef.short.original')}
                    aria-label={t('parts.clef.label', { name: p.name, clef: clefLabel })}
                    cancelText={t('common:actions.cancel')}
                    className={chosen ? 'clef-select clef-overridden' : 'clef-select'}
                    data-testid={`clef-${p.musicXmlId}`}
                    data-clef={chosen ?? ORIGINAL}
                    onIonChange={(e) => setClef(p.musicXmlId, e.detail.value)}
                  >
                    <IonSelectOption value={ORIGINAL}>{t('parts.clef.originalOf', { clef: clefName(original) })}</IonSelectOption>
                    {CLEF_CHOICES.filter((c) => c !== original).map((c) => (
                      <IonSelectOption key={c} value={c}>{t(`parts.clef.${c}`)}</IonSelectOption>
                    ))}
                  </IonSelect>
                )}
              </IonItem>
            );
          })}
        </IonList>
        {inSetlist && originalClefs && <IonNote className="ion-padding" style={{ display: 'block' }}>{t('parts.clefSetlistNote')}</IonNote>}
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButton expand="block" disabled={checked.size === 0} onClick={() => {
              const chosen = all.filter((id) => checked.has(id));
              onApply(sameSet(chosen, defaults) ? [] : chosen, clefDraft);
            }} data-testid="parts-apply">
            {t('parts.apply')}
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
