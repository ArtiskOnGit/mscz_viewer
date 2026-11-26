import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  IonButton, IonFab, IonFabButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonText, useIonActionSheet, useIonAlert,
} from '@ionic/react';
import { add, chevronForward, ellipsisVertical, listOutline } from 'ionicons/icons';
import { routes } from '../../app/routes';
import type { Setlist } from '../../core/model/types';
import { useLibrary } from '../../state/libraryStore';
import { useSetlists } from '../../state/setlistStore';
import { formatDuration } from '../../ui/format';

export function SetlistsTab() {
  const { t, i18n } = useTranslation(['setlists', 'common']);
  const navigate = useNavigate();
  const { setlists, loaded, load, create, rename, duplicate, remove } = useSetlists();
  const scores = useLibrary((s) => s.scores);
  const [presentAlert] = useIonAlert();
  const [presentActions] = useIonActionSheet();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const durationById = useMemo(() => new Map(scores.map((s) => [s.id, s.durationSec ?? 0])), [scores]);
  const sorted = useMemo(() => [...setlists].sort((a, b) => (b.date ?? b.updatedAt).localeCompare(a.date ?? a.updatedAt)), [setlists]);

  const details = (s: Setlist) => {
    const total = s.items.reduce((sum, it) => sum + (durationById.get(it.scoreId) ?? 0), 0);
    const date = s.date ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(s.date)) : undefined;
    return [date, t('pieces', { count: s.items.length }), total ? formatDuration(total) : undefined].filter(Boolean).join(' · ');
  };

  const askCreate = () =>
    void presentAlert({
      header: t('new'),
      inputs: [{ name: 'name', placeholder: t('name') }],
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        {
          text: t('create'),
          handler: (v: { name: string }) => {
            void create(v.name.trim() || t('untitled')).then((s) => navigate(routes.setlist(s.id)));
          },
        },
      ],
    });

  const askRename = (s: Setlist) =>
    void presentAlert({
      header: t('rename'),
      inputs: [{ name: 'name', value: s.name, placeholder: t('name') }],
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.rename'), handler: (v: { name: string }) => void rename(s.id, v.name) },
      ],
    });

  const askDelete = (s: Setlist) =>
    void presentAlert({
      header: t('delete.title'),
      message: t('delete.message', { name: s.name }),
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.delete'), role: 'destructive', handler: () => void remove(s.id) },
      ],
    });

  // Same actions as the swipe options, for screen readers and keyboards (they cannot swipe).
  const more = (s: Setlist) =>
    void presentActions({
      header: s.name,
      buttons: [
        { text: t('duplicate'), handler: () => void duplicate(s.id, t('copyName', { name: s.name })) },
        { text: t('common:actions.rename'), handler: () => askRename(s) },
        { text: t('common:actions.delete'), role: 'destructive', handler: () => askDelete(s) },
        { text: t('common:actions.cancel'), role: 'cancel' },
      ],
    });

  return (
    <>
      {loaded && setlists.length === 0 ? (
        <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('empty')}</p></IonText>
      ) : (
        <IonList>
          {sorted.map((s) => (
            <IonItemSliding key={s.id}>
              <IonItem>
                <button type="button" className="item-open" onClick={() => navigate(routes.setlist(s.id))} data-testid="setlist-open">
                  <IonIcon icon={listOutline} aria-hidden="true" className="item-open-icon" />
                  <IonLabel>
                    <h2>{s.name}</h2>
                    <p>{details(s)}</p>
                  </IonLabel>
                  <IonIcon icon={chevronForward} aria-hidden="true" className="item-open-detail" />
                </button>
                <IonButton slot="end" fill="clear" color="medium" className="item-more" onClick={() => more(s)} aria-label={t('moreActions', { name: s.name })}>
                  <IonIcon slot="icon-only" icon={ellipsisVertical} aria-hidden="true" />
                </IonButton>
              </IonItem>
              <IonItemOptions side="end">
                <IonItemOption color="medium" onClick={() => void duplicate(s.id, t('copyName', { name: s.name }))}>{t('duplicate')}</IonItemOption>
                <IonItemOption onClick={() => askRename(s)}>{t('common:actions.rename')}</IonItemOption>
                <IonItemOption color="danger" onClick={() => askDelete(s)}>{t('common:actions.delete')}</IonItemOption>
              </IonItemOptions>
            </IonItemSliding>
          ))}
        </IonList>
      )}
      <IonFab slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton aria-label={t('new')} data-testid="new-setlist" onClick={askCreate}>
          <IonIcon icon={add} aria-hidden="true" />
        </IonFabButton>
      </IonFab>
    </>
  );
}
