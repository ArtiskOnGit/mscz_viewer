import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IonBackButton, IonButton, IonButtons, IonChip, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote,
  IonPage, IonRange, IonSelect, IonSelectOption, IonTitle, IonToggle, IonToolbar,
} from '@ionic/react';
import { routes } from '../../app/routes';
import { SOURCE_URL, THIRD_PARTY } from '../../app/thirdPartyLicenses';
import { useSettings } from '../../state/settingsStore';
import type { AppTheme, ScoreTheme } from '../../core/settings';
import type { PartNamesMode } from '../../core/musicxml/prepareDisplay';
import type { LayoutMode } from '../../core/model/types';
import { COMMON_INSTRUMENTS, parseNames, type MyInstrumentProfile } from '../../core/profile/myInstrument';
import { noteName, TRANSPOSE_PRESETS, type NoteNamingSetting } from '../../core/music/keys';
import { supportedLanguages, type LanguageSetting } from '../../i18n';
import { useNoteNaming } from '../../state/useNoteNaming';
import { PedalKeysSection } from './PedalKeysSection';
import { StorageSection } from './StorageSection';

const APP_THEMES: AppTheme[] = ['system', 'light', 'dark'];
const SCORE_THEMES: ScoreTheme[] = ['light', 'sepia', 'dark', 'highContrast'];
const PART_NAMES: PartNamesMode[] = ['auto', 'full', 'hidden'];
const LAYOUT_MODES: LayoutMode[] = ['pages', 'continuous'];
const LANGUAGES: LanguageSetting[] = ['system', ...supportedLanguages];
const NOTE_NAMINGS: NoteNamingSetting[] = ['auto', 'english', 'latin', 'german'];

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
          <MyInstrumentSection />

          <IonListHeader>{t('sections.display')}</IonListHeader>
          <IonItem>
            <IonSelect label={t('appTheme.label')} interface="popover" value={settings.appTheme} onIonChange={(e) => set('appTheme', e.detail.value as AppTheme)}>
              {APP_THEMES.map((v) => <IonSelectOption key={v} value={v}>{t(`appTheme.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('scoreTheme.label')} interface="popover" data-testid="score-theme" value={settings.scoreTheme} onIonChange={(e) => set('scoreTheme', e.detail.value as ScoreTheme)}>
              {SCORE_THEMES.map((v) => <IonSelectOption key={v} value={v}>{t(`scoreTheme.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('partNames.label')} interface="popover" value={settings.partNames} onIonChange={(e) => set('partNames', e.detail.value as PartNamesMode)}>
              {PART_NAMES.map((v) => <IonSelectOption key={v} value={v}>{t(`partNames.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('language.label')} interface="popover" value={settings.language} data-testid="language" onIonChange={(e) => set('language', e.detail.value as LanguageSetting)}>
              {LANGUAGES.map((v) => <IonSelectOption key={v} value={v}>{t(`language.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem>
            <IonSelect label={t('noteNaming.label')} interface="popover" value={settings.noteNaming} data-testid="note-naming" onIonChange={(e) => set('noteNaming', e.detail.value as NoteNamingSetting)}>
              {NOTE_NAMINGS.map((v) => <IonSelectOption key={v} value={v}>{t(`noteNaming.${v}`)}</IonSelectOption>)}
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
          <IonItem>
            <IonSelect
              label={t('defaultLayoutMode.label')}
              interface="popover"
              value={settings.defaultLayoutMode}
              data-testid="default-layout"
              onIonChange={(e) => set('defaultLayoutMode', e.detail.value as LayoutMode)}
            >
              {LAYOUT_MODES.map((v) => <IonSelectOption key={v} value={v}>{t(`defaultLayoutMode.${v}`)}</IonSelectOption>)}
            </IonSelect>
          </IonItem>
          <IonItem><IonToggle checked={settings.tapZones} onIonChange={(e) => set('tapZones', e.detail.checked)}>{t('tapZones.label')}</IonToggle></IonItem>
          <IonItem><IonToggle checked={settings.swipe} onIonChange={(e) => set('swipe', e.detail.checked)}>{t('swipe.label')}</IonToggle></IonItem>
          <IonItem>
            <IonToggle checked={settings.halfPageTurn} onIonChange={(e) => set('halfPageTurn', e.detail.checked)} data-testid="half-page-toggle">
              <IonLabel>{t('halfPageTurn.label')}<IonNote className="ion-text-wrap" style={{ display: 'block' }}>{t('halfPageTurn.hint')}</IonNote></IonLabel>
            </IonToggle>
          </IonItem>

          <PedalKeysSection keys={settings.pedalKeys} onChange={(keys) => set('pedalKeys', keys)} />

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
          <IonItem>
            <IonRange
              label={t('readingLine.label', { percent: Math.round(settings.readingLine * 100) })}
              labelPlacement="stacked"
              min={10}
              max={60}
              step={5}
              snaps
              pin
              value={Math.round(settings.readingLine * 100)}
              data-testid="reading-line"
              onIonChange={(e) => set('readingLine', Number(e.detail.value) / 100)}
            />
          </IonItem>
          <IonItem><IonToggle checked={settings.highlightMeasure} onIonChange={(e) => set('highlightMeasure', e.detail.checked)}>{t('highlightMeasure.label')}</IonToggle></IonItem>
          <IonItem><IonToggle checked={settings.tapPauses} onIonChange={(e) => set('tapPauses', e.detail.checked)}>{t('tapPauses.label')}</IonToggle></IonItem>

          <IonListHeader>{t('sections.system')}</IonListHeader>
          <IonItem><IonToggle checked={settings.keepAwake} onIonChange={(e) => set('keepAwake', e.detail.checked)}>{t('keepAwake.label')}</IonToggle></IonItem>
          <IonItem button detail={false} onClick={reset}><IonLabel color="danger">{t('reset')}</IonLabel></IonItem>

          <StorageSection />

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

type QuickPick = (typeof COMMON_INSTRUMENTS)[number];
const lower = (names: readonly string[]) => new Set(names.map((n) => n.toLowerCase()));
/** A quick pick is selected while its first name is in the profile. */
const isPicked = (p: QuickPick, names: readonly string[]) => lower(names).has(p.names[0].toLowerCase());
/** Instrument ids follow the quick picks still present in the names. */
const idsFor = (names: readonly string[]) => COMMON_INSTRUMENTS.filter((p) => isPicked(p, names)).flatMap((p) => p.instrumentIds);

/** "My instrument" profile: names (free text + quick picks) and default transposition (§3.4). */
function MyInstrumentSection() {
  const { t } = useTranslation(['settings', 'viewer']);
  const { settings, set } = useSettings();
  const naming = useNoteNaming();
  const profile = settings.myInstrument;
  const [text, setText] = useState(profile.names.join(', '));
  // Names changed elsewhere (quick pick, reset): show them in the text field.
  const [shownNames, setShownNames] = useState(profile.names);
  if (shownNames !== profile.names) {
    setShownNames(profile.names);
    setText(profile.names.join(', '));
  }

  const save = (names: string[]) => set('myInstrument', { names, instrumentIds: idsFor(names) } satisfies MyInstrumentProfile);
  const toggle = (p: QuickPick) => {
    const own = lower(p.names);
    save(isPicked(p, profile.names) ? profile.names.filter((n) => !own.has(n.toLowerCase())) : parseNames([...profile.names, ...p.names].join(',')));
  };

  return (
    <>
      <IonListHeader>{t('sections.profile')}</IonListHeader>
      <IonItem>
        <IonInput
          label={t('myInstrument.names')}
          labelPlacement="stacked"
          placeholder={t('myInstrument.placeholder')}
          helperText={t('myInstrument.hint')}
          value={text}
          data-testid="my-instrument-names"
          onIonInput={(e) => setText(String(e.detail.value ?? ''))}
          onIonChange={(e) => save(parseNames(String(e.detail.value ?? '')))}
        />
      </IonItem>
      <IonItem lines="none"><IonLabel><IonNote>{t('myInstrument.quickPicks')}</IonNote></IonLabel></IonItem>
      <div className="ion-padding-horizontal" data-testid="my-instrument-picks">
        {COMMON_INSTRUMENTS.map((p) => (
          <IonChip key={p.id} outline={!isPicked(p, profile.names)} onClick={() => toggle(p)} data-testid={`pick-${p.id}`}>
            {t(`myInstrument.instruments.${p.id}`)}
          </IonChip>
        ))}
      </div>
      <IonItem>
        <IonSelect
          label={t('defaultTranspose.label')}
          interface="popover"
          value={settings.defaultTranspose}
          data-testid="default-transpose"
          onIonChange={(e) => set('defaultTranspose', Number(e.detail.value))}
        >
          {TRANSPOSE_PRESETS.map((p) => <IonSelectOption key={p.id} value={p.semitones}>{t(`viewer:transpose.preset.${p.id}`, { note: noteName(p.note, naming) })}</IonSelectOption>)}
        </IonSelect>
      </IonItem>
    </>
  );
}
