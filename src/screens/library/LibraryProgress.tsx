import { useTranslation } from 'react-i18next';
import { IonLoading } from '@ionic/react';
import { useLibrary } from '../../state/libraryStore';

/** Import and upgrade progress, shown once for the whole app (several library pages may be stacked). */
export function LibraryProgress() {
  const { t } = useTranslation('library');
  const importing = useLibrary((s) => s.importing);
  const upgrading = useLibrary((s) => s.upgrading);
  return (
    <>
      <IonLoading isOpen={!!upgrading && !importing} message={upgrading ? t('upgrade', { done: upgrading.done + 1, total: upgrading.total }) : ''} />
      <IonLoading
        isOpen={!!importing}
        message={importing ? t('import.progress', { current: importing.current ?? '', done: importing.done + 1, total: importing.total }) : ''}
      />
    </>
  );
}
