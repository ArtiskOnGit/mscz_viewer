import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { routes } from '../../app/routes';
import { onRestoredPick } from '../../core/import/filePicker';
import { onOpenWith, onShareReceived } from '../../core/import/openWith';
import type { ImportInput } from '../../core/import/importScore';
import { folderIdOfPath } from '../../core/model/folders';
import { useLibrary } from '../../state/libraryStore';
import { useImportReport } from './useImportReport';

/**
 * Files arriving from outside the library screen's import button, mounted once for the whole app (ADR-029):
 * "Open with…" / "Share to" from another app, and files picked right before Android restarted the app
 * (see filePicker.ts). They go into the folder shown by the library when a library page is on screen, else the root.
 */
export function ExternalImports() {
  const navigate = useNavigate();
  const reportImport = useImportReport();

  useEffect(() => {
    const destination = () => {
      const id = folderIdOfPath(window.location.pathname);
      return id && useLibrary.getState().folders.some((f) => f.id === id) ? id : undefined;
    };
    const importFiles = (inputs: ImportInput[]) => useLibrary.getState().importFiles(inputs, destination());
    // A single file opens in the viewer; several are reported.
    const importAndOpen = (inputs: ImportInput[]) =>
      void importFiles(inputs).then((report) => {
        const score = inputs.length === 1 ? (report.imported[0] ?? report.duplicates[0]) : undefined;
        if (score) navigate(routes.viewer(score.id));
        else reportImport(report);
      });
    const offRestored = onRestoredPick((inputs) => void importFiles(inputs).then(reportImport));
    const offOpen = onOpenWith((input) => importAndOpen([input]));
    const offShare = onShareReceived(importAndOpen);
    return () => {
      offRestored();
      offOpen();
      offShare();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
