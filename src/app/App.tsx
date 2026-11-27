import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { ViewerScreen } from '../screens/viewer/ViewerScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { SetlistDetailScreen } from '../screens/setlists/SetlistDetailScreen';
import { routes } from './routes';
import { useEffect } from 'react';
import { useSettings } from '../state/settingsStore';
import { useAppTheme } from './useAppTheme';
import { useOrientationLock } from './useOrientationLock';
import { applyLanguage } from '../i18n';
import { UpdatePrompt } from './UpdatePrompt';

/** The PWA is served under /mscz_viewer/ (GitHub Pages, ADR-027); the Android app and the dev server under /. */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined;

export function App() {
  const { settings, loaded, load } = useSettings();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useAppTheme(settings.appTheme);
  useOrientationLock(settings.orientation, loaded);
  useEffect(() => {
    if (loaded) void applyLanguage(settings.language);
  }, [loaded, settings.language]);

  return (
    <IonApp>
      <IonReactRouter basename={basename}>
        <IonRouterOutlet>
          <Routes>
            <Route path={routes.library} element={<LibraryScreen />} />
            <Route path={routes.viewerPattern} element={<ViewerScreen />} />
            <Route path={routes.settings} element={<SettingsScreen />} />
            <Route path={routes.setlistPattern} element={<SetlistDetailScreen />} />
            <Route path="*" element={<Navigate to={routes.library} replace />} />
          </Routes>
        </IonRouterOutlet>
      </IonReactRouter>
      <UpdatePrompt />
    </IonApp>
  );
}
