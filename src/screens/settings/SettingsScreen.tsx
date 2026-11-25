import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonRange, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar,
} from '@ionic/react';
import { routes } from '../../app/routes';
import { SOURCE_URL, THIRD_PARTY } from '../../app/thirdPartyLicenses';
import { useSettings } from '../../state/settingsStore';
import type { AppTheme, ScoreTheme } from '../../core/settings';
import type { PartNamesMode } from '../../core/musicxml/prepareDisplay';

const APP_THEMES: AppTheme[] = ['system', 'light', 'dark'];
const SCORE_THEMES: ScoreTheme[] = ['light', 'sepia', 'dark', 'highContrast'];
const PART_NAMES: PartNamesMode[] = ['auto', 'full', 'hidden'];

export function SettingsScreen() {
  const { t } = useTranslation(['settings', 'common']);
  const { settings, set, reset } = useSettings();
  const [licensesOpen, setLicensesOpen] = useState(false);

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
          <IonItem>
            <IonSelect label={t('appTheme.label')} interface="popover" value={settings.appTheme} onIonChange={(e) => set('appTheme', e.detail.value as AppTheme)}>
              {APP_THEMES.map((v) => <IonSelectOption key={v} value={v}>{t(`appTheme.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('scoreTheme.label')} interface="popover" value={settings.scoreTheme} onIonChange={(e) => set('scoreTheme', e.detail.value as ScoreTheme)}>
              {SCORE_THEMES.map((v) => <IonSelectOption key={v} value={v}>{t(`scoreTheme.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('partNames.label')} interface="popover" value={settings.partNames} onIonChange={(e) => set('partNames', e.detail.value as PartNamesMode)}>
              {PART_NAMES.map((v) => <IonSelectOption key={v} value={v}>{t(`partNames.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonToggle checked={settings.multiRests} onIonChange={(e) => set('multiRests', e.detail.checked)}>
              <IonLabel>{t('multiRests.label')}<IonNote className="ion-text-wrap" style={{ display: 'block' }}>{t('multiRests.hint')}</IonNote></IonLabel>
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonRange
              label={t('defaultZoom.label', { percent: Math.round(settings.defaultZoom * 100) })}
              labelPlacement="stacked"
              min={50}
              max={200}
              step={10}
              snaps
              pin
              value={Math.round(settings.defaultZoom * 100)}
              onIonChange={(e) => set('defaultZoom', Number(e.detail.value) / 100)}
            />
          </IonItem>

          <IonListHeader>{t('sections.navigation')}</IonListHeader>
          <IonItem><IonToggle checked={settings.tapZones} onIonChange={(e) => set('tapZones', e.detail.checked)}>{t('tapZones.label')}</IonToggle></IonItem>
          <IonItem><IonToggle checked={settings.swipe} onIonChange={(e) => set('swipe', e.detail.checked)}>{t('swipe.label')}</IonToggle></IonItem>

          <IonListHeader>{t('sections.playback')}</IonListHeader>
          <IonItem>
            <IonSelect label={t('countIn.label')} interface="popover" value={settings.countInMeasures} onIonChange={(e) => set('countInMeasures', e.detail.value as 0 | 1 | 2)}>
              <IonSelectOption value={0}>{t('countIn.none')}</IonSelectOption>
              <IonSelectOption value={1}>{t('countIn.one')}</IonSelectOption>
              <IonSelectOption value={2}>{t('countIn.two')}</IonSelectOption>
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonToggle checked={settings.countInSound} onIonChange={(e) => set('countInSound', e.detail.checked)}>
              <IonLabel>{t('countInSound.label')}<IonNote className="ion-text-wrap" style={{ display: 'block' }}>{t('countInSound.hint')}</IonNote></IonLabel>
            </IonToggle>
          </IonItem>
          <IonItem>
            <IonRange
              label={t('metronomeVolume.label', { percent: Math.round(settings.metronomeVolume * 100) })}
              labelPlacement="stacked"
              min={0}
              max={100}
              step={10}
              value={Math.round(settings.metronomeVolume * 100)}
              onIonChange={(e) => set('metronomeVolume', Number(e.detail.value) / 100)}
            />
          </IonItem>
          <IonItem><IonToggle checked={settings.highlightMeasure} onIonChange={(e) => set('highlightMeasure', e.detail.checked)}>{t('highlightMeasure.label')}</IonToggle></IonItem>
          <IonItem><IonToggle checked={settings.tapPauses} onIonChange={(e) => set('tapPauses', e.detail.checked)}>{t('tapPauses.label')}</IonToggle></IonItem>

          <IonListHeader>{t('sections.system')}</IonListHeader>
          <IonItem><IonToggle checked={settings.keepAwake} onIonChange={(e) => set('keepAwake', e.detail.checked)}>{t('keepAwake.label')}</IonToggle></IonItem>
          <IonItem button detail={false} onClick={reset}><IonLabel color="danger">{t('reset')}</IonLabel></IonItem>

          <IonListHeader>{t('sections.about')}</IonListHeader>
          <IonItem><IonLabel>{t('common:appName')}<IonNote style={{ display: 'block' }}>{t('about.version', { version: __APP_VERSION__ })}</IonNote></IonLabel></IonItem>
          <IonItem><IonLabel className="ion-text-wrap">{t('about.license')}</IonLabel></IonItem>
          <IonItem href={SOURCE_URL} target="_blank" detail><IonLabel>{t('about.source')}</IonLabel></IonItem>
          <IonItem button detail onClick={() => setLicensesOpen(true)}><IonLabel>{t('about.licenses')}</IonLabel></IonItem>
          <IonItem><IonLabel className="ion-text-wrap"><IonNote>{t('about.credits')} {t('about.trademark')}</IonNote></IonLabel></IonItem>
        </IonList>

        <IonModal isOpen={licensesOpen} onDidDismiss={() => setLicensesOpen(false)}>
          <IonHeader>
            <IonToolbar>
              <IonTitle>{t('licenses.title')}</IonTitle>
              <IonButtons slot="end"><IonButton onClick={() => setLicensesOpen(false)}>{t('common:actions.close')}</IonButton></IonButtons>
            </IonToolbar>
          </IonHeader>
          <IonContent>
            <IonList>
              {THIRD_PARTY.map((c) => (
                <IonItem key={c.name} href={c.url} target="_blank">
                  <IonLabel>{c.name}<IonNote style={{ display: 'block' }}>{c.license}</IonNote></IonLabel>
                </IonItem>
              ))}
            </IonList>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
}
