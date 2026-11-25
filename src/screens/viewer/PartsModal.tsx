import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonItem, IonList, IonModal, IonTitle, IonToolbar,
} from '@ionic/react';
import type { Part } from '../../core/model/types';

interface Props {
  isOpen: boolean;
  parts: Part[];
  /** Empty = all. */
  selected: string[];
  onApply(selected: string[]): void;
  onDismiss(): void;
}

export function PartsModal({ isOpen, parts, selected, onApply, onDismiss }: Props) {
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
    <IonModal isOpen={isOpen} onWillPresent={() => setChecked(new Set(selected.length ? selected : all))} onDidDismiss={onDismiss}>
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
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButton expand="block" disabled={checked.size === 0} onClick={() => onApply(allChecked ? [] : all.filter((id) => checked.has(id)))}>
            {t('parts.apply')}
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}
