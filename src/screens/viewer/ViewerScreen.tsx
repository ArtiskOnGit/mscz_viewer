import { useTranslation } from 'react-i18next';
import { IonBackButton, IonButtons, IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { routes } from '../../app/routes';

export function ViewerScreen() {
  const { t } = useTranslation('viewer');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>
          <IonTitle>{t('title')}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>{t('notFound')}</p>
      </IonContent>
    </IonPage>
  );
}
