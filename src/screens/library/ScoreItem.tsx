import { useTranslation } from 'react-i18next';
import { IonButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonThumbnail, useIonActionSheet } from '@ionic/react';
import { ellipsisVertical, musicalNotesOutline } from 'ionicons/icons';
import type { Score } from '../../core/model/types';
import { formatDuration } from '../../ui/format';
import { useSpokenDuration } from '../../ui/useSpokenDuration';
import { useThumbnail } from './useThumbnail';
import './library.css';

interface Props {
  score: Score;
  onOpen(): void;
  onRename(): void;
  onInfo(): void;
  onDelete(): void;
}

// The item is not an Ionic "button" item: the open button and the "more actions" button sit side by side (a button
// inside a button is not accessible). The swipe options stay; the "more actions" button gives the same actions to
// screen readers and keyboards, which cannot swipe.
export function ScoreItem({ score, onOpen, onRename, onInfo, onDelete }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const thumbnail = useThumbnail(score.id);
  const spoken = useSpokenDuration();
  const [presentActions] = useIonActionSheet();
  const details = [score.composer, t('card.parts', { count: score.parts.length }), formatDuration(score.durationSec)].filter(Boolean).join(' · ');
  // Screen readers: title (visible), then composer, instruments (names), duration in words.
  const label = [
    score.composer,
    t('card.partsNamed', { count: score.parts.length, names: score.parts.map((p) => p.name).join(', ') }),
    spoken(score.durationSec),
  ]
    .filter(Boolean)
    .join(', ');
  const more = () =>
    void presentActions({
      header: score.title,
      buttons: [
        { text: t('info.button'), handler: onInfo },
        { text: t('common:actions.rename'), handler: onRename },
        { text: t('common:actions.delete'), role: 'destructive', handler: onDelete },
        { text: t('common:actions.cancel'), role: 'cancel' },
      ],
    });

  return (
    <IonItemSliding>
      <IonItem className="score-item">
        <button type="button" className="item-open" onClick={onOpen} data-testid="score-open">
          <IonThumbnail className="score-thumb">
            {thumbnail ? <img src={thumbnail} alt="" /> : <IonIcon icon={musicalNotesOutline} aria-hidden="true" />}
          </IonThumbnail>
          <IonLabel>
            <h2>{score.title}</h2>
            <p aria-hidden="true">{details}</p>
            <span className="sr-only">{label}</span>
          </IonLabel>
        </button>
        <IonButton slot="end" fill="clear" color="medium" className="item-more" onClick={more} aria-label={t('moreActions', { title: score.title })} data-testid="score-more">
          <IonIcon slot="icon-only" icon={ellipsisVertical} aria-hidden="true" />
        </IonButton>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption color="medium" onClick={onInfo}>{t('info.button')}</IonItemOption>
        <IonItemOption onClick={onRename}>{t('common:actions.rename')}</IonItemOption>
        <IonItemOption color="danger" onClick={onDelete}>{t('common:actions.delete')}</IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
}
