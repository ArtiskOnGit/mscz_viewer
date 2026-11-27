// Settings → Storage: space used by the scores and by the render cache (ADR-025), which can be cleared. In the web app
// (PWA build, ADR-027): offline availability (download progress) and persistent storage.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IonItem, IonLabel, IonListHeader, IonNote, IonProgressBar, useIonToast } from '@ionic/react';
import { requestPersistence, retryOffline, usePwa } from '../../pwa/pwa';
import { renderCache } from '../../core/services';
import { directorySize } from '../../core/storage/fileStore';
import { formatBytes } from '../../ui/format';

export function StorageSection() {
  const { t, i18n } = useTranslation('settings');
  const [toast] = useIonToast();
  const [sizes, setSizes] = useState<{ scores?: number; cache?: number }>({});
  const [version, setVersion] = useState(0); // measured again after a clear

  useEffect(() => {
    let cancelled = false;
    void Promise.all([directorySize('scores').catch(() => undefined), renderCache.size().catch(() => undefined)]).then(
      ([scores, cache]) => !cancelled && setSizes({ scores, cache }),
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

  const clear = async () => {
    await renderCache.clear();
    setVersion((v) => v + 1);
    void toast({ message: t('storage.cleared'), duration: 1500, position: 'bottom' });
  };
  const size = (bytes: number | undefined) => (bytes === undefined ? '' : formatBytes(bytes, i18n.language));

  return (
    <>
      <IonListHeader>{t('sections.storage')}</IonListHeader>
      <IonItem>
        <IonLabel>{t('storage.scores')}</IonLabel>
        <IonNote slot="end" data-testid="storage-scores">{size(sizes.scores)}</IonNote>
      </IonItem>
      <IonItem>
        <IonLabel className="ion-text-wrap">
          {t('storage.renderCache')}
          <IonNote style={{ display: 'block' }}>{t('storage.renderCacheHint')}</IonNote>
        </IonLabel>
        <IonNote slot="end" data-testid="storage-render-cache">{size(sizes.cache)}</IonNote>
      </IonItem>
      <IonItem button detail={false} onClick={() => void clear()} data-testid="clear-render-cache">
        <IonLabel color="primary">{t('storage.clearCache')}</IonLabel>
      </IonItem>
      {__PWA__ && <OfflineItems />}
    </>
  );
}

/** Web app only: everything the app needs offline (downloaded at the first visit) and storage persistence. */
function OfflineItems() {
  const { t, i18n } = useTranslation('settings');
  const { offline, done, total, update, persisted } = usePwa();
  const size = (bytes: number) => formatBytes(bytes, i18n.language);
  const progress = offline === 'downloading' ? { done, total } : update;
  const note =
    offline === 'ready' ? t('storage.offline.ready', { size: size(total) })
    : offline === 'downloading' ? t('storage.offline.downloading', { done: size(done), total: size(total) })
    : offline === 'error' ? t('storage.offline.error')
    : offline === 'checking' ? t('storage.offline.checking')
    : t('storage.offline.unsupported');
  return (
    <>
      <IonItem data-testid="offline-status" data-state={offline}>
        <IonLabel className="ion-text-wrap">
          {t('storage.offline.label')}
          <IonNote style={{ display: 'block' }}>{note}</IonNote>
          {update && <IonNote style={{ display: 'block' }}>{t('storage.offline.update', { done: size(update.done), total: size(update.total) })}</IonNote>}
          {progress && progress.total > 0 && <IonProgressBar value={progress.done / progress.total} aria-hidden="true" />}
        </IonLabel>
      </IonItem>
      {offline === 'error' && (
        <IonItem button detail={false} onClick={retryOffline} data-testid="offline-retry">
          <IonLabel color="primary">{t('storage.offline.retry')}</IonLabel>
        </IonItem>
      )}
      {persisted !== undefined && (
        <IonItem data-testid="storage-persisted" data-persisted={String(persisted)}>
          <IonLabel className="ion-text-wrap">
            {t('storage.persistent.label')}
            <IonNote style={{ display: 'block' }}>{persisted ? t('storage.persistent.granted') : t('storage.persistent.denied')}</IonNote>
          </IonLabel>
        </IonItem>
      )}
      {persisted === false && (
        <IonItem button detail={false} onClick={() => void requestPersistence()}>
          <IonLabel color="primary">{t('storage.persistent.request')}</IonLabel>
        </IonItem>
      )}
    </>
  );
}
