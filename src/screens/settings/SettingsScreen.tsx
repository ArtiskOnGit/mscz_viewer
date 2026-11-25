import { useTranslation } from 'react-i18next';
import {
  IonBackButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonPage,
  IonTitle, IonToolbar,
} from '@ionic/react';
import { routes } from '../../app/routes';

export function SettingsScreen() {
  const { t } = useTranslation(['settings', 'common']);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>
          <IonTitle>{t('title')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonListHeader>{t('sections.display')}</IonListHeader>
          <IonItem><IonLabel color="medium">{t('common:comingSoon')}</IonLabel></IonItem>
          <IonListHeader>{t('sections.about')}</IonListHeader>
          <IonItem><IonLabel className="ion-text-wrap">{t('about.license')}</IonLabel></IonItem>
          <IonItem><IonLabel className="ion-text-wrap">{t('about.credits')}</IonLabel></IonItem>
        </IonList>
      </IonContent>
    </IonPage>
  );
}
