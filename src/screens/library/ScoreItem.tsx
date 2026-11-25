import { useTranslation } from 'react-i18next';
import { IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonThumbnail } from '@ionic/react';
import { musicalNotesOutline } from 'ionicons/icons';
import type { Score } from '../../core/model/types';
import { formatDuration } from '../../ui/format';
import { useThumbnail } from './useThumbnail';
import './library.css';

interface Props {
  score: Score;
  onOpen(): void;
  onRename(): void;
  onDelete(): void;
}

export function ScoreItem({ score, onOpen, onRename, onDelete }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const thumbnail = useThumbnail(score.id);
  const details = [score.composer, t('card.parts', { count: score.parts.length }), formatDuration(score.durationSec)].filter(Boolean).join(' · ');

  return (
    <IonItemSliding>
      <IonItem button detail={false} onClick={onOpen}>
        <IonThumbnail slot="start" className="score-thumb">
          {thumbnail ? <img src={thumbnail} alt="" /> : <IonIcon icon={musicalNotesOutline} />}
        </IonThumbnail>
        <IonLabel>
          <h2>{score.title}</h2>
          <p>{details}</p>
        </IonLabel>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption onClick={onRename}>{t('common:actions.rename')}</IonItemOption>
        <IonItemOption color="danger" onClick={onDelete}>{t('common:actions.delete')}</IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
}
