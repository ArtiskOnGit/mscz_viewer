// "New version available — Reload" (PWA build, ADR-027): shown once the service worker has downloaded a new version.
import { IonToast } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { applyUpdate, usePwa } from '../pwa/pwa';

export function UpdatePrompt() {
  const { t } = useTranslation('common');
  const updateReady = usePwa((s) => s.updateReady);
  if (!__PWA__) return null;
  return (
    <IonToast
      isOpen={updateReady}
      message={t('pwa.updateAvailable')}
      position="bottom"
      data-testid="update-toast"
      buttons={[{ text: t('pwa.reload'), handler: applyUpdate }]}
    />
  );
}
