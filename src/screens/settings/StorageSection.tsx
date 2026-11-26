// Settings → Storage: space used by the scores and by the render cache (ADR-025), which can be cleared.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IonItem, IonLabel, IonListHeader, IonNote, useIonToast } from '@ionic/react';
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
    </>
  );
}
