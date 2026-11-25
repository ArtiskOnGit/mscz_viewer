import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LibraryScreen } from '../screens/library/LibraryScreen';
import { ViewerScreen } from '../screens/viewer/ViewerScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { routes } from './routes';

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Routes>
            <Route path={routes.library} element={<LibraryScreen />} />
            <Route path={routes.viewerPattern} element={<ViewerScreen />} />
            <Route path={routes.settings} element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to={routes.library} replace />} />
          </Routes>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
