import { useTranslation } from 'react-i18next';
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/react';
import { playSkipBack, playSkipForward } from 'ionicons/icons';
import type { SetlistPlayback } from './useSetlistPlayback';
import './setlists.css';

/** Footer line of the viewer in setlist mode: "2/6 · Next: <title>" with previous/next piece buttons. */
export function SetlistBar({ sp }: { sp: SetlistPlayback }) {
  const { t } = useTranslation('setlists');
  if (!sp.active) return null;
  return (
    <IonToolbar color="light" className="setlist-bar">
      <IonButtons slot="start">
        <IonButton onClick={sp.goPrev} disabled={!sp.hasPrev} aria-label={t('previousPiece')} data-testid="previous-piece"><IonIcon slot="icon-only" icon={playSkipBack} /></IonButton>
      </IonButtons>
      <div className="setlist-bar-text" data-testid="setlist-bar">
        {t('position', { index: sp.index, count: sp.count })} · {sp.nextTitle ? t('next', { title: sp.nextTitle }) : t('last')}
      </div>
      <IonButtons slot="end">
        <IonButton onClick={sp.goNext} disabled={!sp.hasNext} aria-label={t('nextPiece')} data-testid="next-piece"><IonIcon slot="icon-only" icon={playSkipForward} /></IonButton>
      </IonButtons>
    </IonToolbar>
  );
}
