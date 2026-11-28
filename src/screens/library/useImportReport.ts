import { useTranslation } from 'react-i18next';
import { useIonAlert, useIonToast } from '@ionic/react';
import type { ImportReport } from '../../state/libraryStore';

/** Shows the outcome of an import: a toast, or an alert listing the files that failed. */
export function useImportReport(): (report: ImportReport) => void {
  const { t } = useTranslation(['library', 'common']);
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  return (report) => {
    const parts = [
      report.imported.length && t('import.result.imported', { count: report.imported.length }),
      report.duplicates.length && t('import.result.duplicates', { count: report.duplicates.length }),
      report.failed.length && t('import.result.failed', { count: report.failed.length }),
    ].filter(Boolean);
    const errors = report.failed.map((f) => t(`import.errors.${f.code}`, { name: f.name }));
    if (errors.length) {
      void presentAlert({ header: parts.join(' · '), message: errors.join('\n\n'), buttons: [t('common:actions.ok')] });
    } else if (parts.length) {
      void presentToast({ message: parts.join(' · '), duration: 2500, position: 'bottom' });
    }
  };
}
