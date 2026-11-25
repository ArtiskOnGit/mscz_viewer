import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonLabel, IonPage,
  IonSegment, IonSegmentButton, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { add, settingsOutline } from 'ionicons/icons';
import { routes } from '../../app/routes';

type Tab = 'scores' | 'setlists';

export function LibraryScreen() {
  const { t } = useTranslation('library');
  const [tab, setTab] = useState<Tab>('scores');

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink={routes.settings} aria-label={t('settings')}>
              <IonIcon slot="icon-only" icon={settingsOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
            <IonSegmentButton value="scores"><IonLabel>{t('tabs.scores')}</IonLabel></IonSegmentButton>
            <IonSegmentButton value="setlists"><IonLabel>{t('tabs.setlists')}</IonLabel></IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {tab === 'scores' ? (
          <IonText color="medium">
            <h2>{t('empty.title')}</h2>
            <p>{t('empty.body')}</p>
          </IonText>
        ) : (
          <IonText color="medium"><p>{t('setlists.empty')}</p></IonText>
        )}
        {tab === 'scores' && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton aria-label={t('import.button')}>
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
      </IonContent>
    </IonPage>
  );
}
