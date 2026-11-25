import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonModal, IonNote, IonTitle, IonToolbar, useIonToast,
} from '@ionic/react';
import type { Score } from '../../core/model/types';
import { viewStateRepository } from '../../core/services';
import { formatDuration } from '../../ui/format';

interface Props {
  score: Score | undefined;
  onDismiss(): void;
}

export function ScoreInfoModal({ score, onDismiss }: Props) {
  const { t, i18n } = useTranslation(['library', 'common']);
  const [toast] = useIonToast();
  const date = (iso?: string) => (iso ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : undefined);

  const rows: [string, string | undefined][] = score
    ? [
        [t('info.composer'), score.composer],
        [t('info.subtitle'), score.subtitle],
        [t('info.file'), score.sourceFileName],
        [t('info.format'), score.sourceFormat.toUpperCase()],
        [t('info.museScoreVersion'), score.museScoreVersion && t('info.museScore', { version: score.museScoreVersion })],
        [t('info.measures'), String(score.measures)],
        [t('info.duration'), formatDuration(score.durationSec)],
        [t('info.tempo'), score.initialTempoBpm ? t('info.tempoValue', { bpm: Math.round(score.initialTempoBpm) }) : undefined],
        [t('info.rehearsalMarks'), score.rehearsalMarks.map((r) => r.label).join(' ') || undefined],
        [t('info.imported'), date(score.importedAt)],
        [t('info.lastOpened'), date(score.lastOpenedAt)],
      ]
    : [];

  return (
    <IonModal isOpen={!!score} onDidDismiss={onDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{score?.title ?? t('info.title')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {score && (
          <IonList>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <IonItem key={k}><IonLabel className="ion-text-wrap"><IonNote style={{ display: 'block' }}>{k}</IonNote>{v}</IonLabel></IonItem>
            ))}
            <IonItem>
              <IonLabel className="ion-text-wrap">
                <IonNote style={{ display: 'block' }}>{t('info.instruments')}</IonNote>
                {score.parts.map((p) => (
                  <div key={p.musicXmlId}>{p.name}{p.hiddenInSource && <IonNote> · {t('info.hiddenInSource')}</IonNote>}</div>
                ))}
              </IonLabel>
            </IonItem>
            <IonItem
              button
              detail={false}
              onClick={() => void viewStateRepository.remove(score.id).then(() => toast({ message: t('info.resetDone'), duration: 1500 }))}
            >
              <IonLabel color="primary">{t('info.resetView')}</IonLabel>
            </IonItem>
          </IonList>
        )}
      </IonContent>
    </IonModal>
  );
}
