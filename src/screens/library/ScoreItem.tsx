import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IonButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonThumbnail, useIonActionSheet } from '@ionic/react';
import { checkmarkCircle, ellipseOutline, ellipsisVertical, musicalNotesOutline } from 'ionicons/icons';
import type { Score } from '../../core/model/types';
import { formatDuration } from '../../ui/format';
import { useSpokenDuration } from '../../ui/useSpokenDuration';
import { useThumbnail } from './useThumbnail';
import './library.css';

interface Props {
  score: Score;
  /** Folder path, shown in search results. */
  path?: string;
  onOpen(): void;
  onRename(): void;
  onInfo(): void;
  onMove(): void;
  onDelete(): void;
  /** Starts the multi-selection with this score (long press or "Select" action). */
  onSelect(): void;
  /** Multi-selection mode: a tap toggles the selection instead of opening. */
  selecting?: boolean;
  selected?: boolean;
}

const LONG_PRESS_MS = 500;

// The item is not an Ionic "button" item: the open button and the "more actions" button sit side by side (a button
// inside a button is not accessible). The swipe options stay; the "more actions" button gives the same actions to
// screen readers and keyboards, which cannot swipe (and "Select" replaces the long press).
export function ScoreItem({ score, path, onOpen, onRename, onInfo, onMove, onDelete, onSelect, selecting, selected }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const thumbnail = useThumbnail(score.id);
  const spoken = useSpokenDuration();
  const [presentActions] = useIonActionSheet();
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean }>(undefined);
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
        { text: t('folders.move'), handler: onMove },
        { text: t('select.action'), handler: onSelect },
        { text: t('common:actions.delete'), role: 'destructive', handler: onDelete },
        { text: t('common:actions.cancel'), role: 'cancel' },
      ],
    });

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const startPress = (e: React.PointerEvent) => {
    if (selecting || (e.pointerType === 'mouse' && e.button !== 0)) return;
    cancelPress();
    const state = { x: e.clientX, y: e.clientY, fired: false, timer: 0 };
    state.timer = window.setTimeout(() => {
      state.fired = true;
      navigator.vibrate?.(20);
      onSelect();
    }, LONG_PRESS_MS);
    press.current = state;
  };
  const movePress = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };
  const click = () => {
    if (press.current?.fired) {
      press.current = undefined; // the click that ends a long press
      return;
    }
    if (selecting) onSelect();
    else onOpen();
  };

  return (
    <IonItemSliding disabled={selecting}>
      <IonItem className={`score-item${selected ? ' score-selected' : ''}`}>
        <button
          type="button"
          className="item-open"
          onClick={click}
          onPointerDown={startPress}
          onPointerMove={movePress}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={selecting ? !!selected : undefined}
          data-testid="score-open"
        >
          {selecting && <IonIcon className="select-mark" icon={selected ? checkmarkCircle : ellipseOutline} color={selected ? 'primary' : 'medium'} aria-hidden="true" />}
          <IonThumbnail className="score-thumb">
            {thumbnail ? <img src={thumbnail} alt="" /> : <IonIcon icon={musicalNotesOutline} aria-hidden="true" />}
          </IonThumbnail>
          <IonLabel>
            <h2>{score.title}</h2>
            <p aria-hidden="true">{details}</p>
            {path && <p className="item-path" data-testid="score-path">{t('folders.inFolder', { path })}</p>}
            <span className="sr-only">{label}</span>
          </IonLabel>
        </button>
        {!selecting && (
          <IonButton slot="end" fill="clear" color="medium" className="item-more" onClick={more} aria-label={t('moreActions', { title: score.title })} data-testid="score-more">
            <IonIcon slot="icon-only" icon={ellipsisVertical} aria-hidden="true" />
          </IonButton>
        )}
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption color="medium" onClick={onInfo}>{t('info.button')}</IonItemOption>
        <IonItemOption onClick={onRename}>{t('common:actions.rename')}</IonItemOption>
        <IonItemOption color="tertiary" onClick={onMove}>{t('folders.move')}</IonItemOption>
        <IonItemOption color="danger" onClick={onDelete}>{t('common:actions.delete')}</IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
}
