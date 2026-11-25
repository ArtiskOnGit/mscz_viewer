import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonItem, IonList, IonModal, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import type { Part } from '../../core/model/types';

interface Props {
  isOpen: boolean;
  parts: Part[];
  /** Parts currently displayed. */
  selected: string[];
  /** Default parts (visible in MuseScore): choosing exactly these is stored as "default". */
  defaults: string[];
  onApply(selected: string[]): void;
  onDismiss(): void;
}

export function PartsModal({ isOpen, parts, selected, defaults, onApply, onDismiss }: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const all = parts.map((p) => p.musicXmlId);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allChecked = checked.size === all.length;

  return (
    <IonModal isOpen={isOpen} onWillPresent={() => setChecked(new Set(selected))} onDidDismiss={onDismiss}>
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
          {parts.map((p) => (
            <IonItem key={p.musicXmlId}>
              <IonCheckbox checked={checked.has(p.musicXmlId)} onIonChange={(e) => toggle(p.musicXmlId, e.detail.checked)}>
                {p.name}
                {p.hiddenInSource && <IonText color="medium"> · {t('parts.hiddenInSource')}</IonText>}
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButton expand="block" disabled={checked.size === 0} onClick={() => {
              const chosen = all.filter((id) => checked.has(id));
              onApply(sameSet(chosen, defaults) ? [] : chosen);
            }}>
            {t('parts.apply')}
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
