// Sound and mixer sheet (ADR-026): sound on/off, master volume, quick mixes ("My instrument" shortcuts), and per part
// volume, mute and solo, and a metronome row (volume; mute = metronome off; never silenced by a solo). Changes apply
// live (the sheet leaves the score visible while playing).
import { useTranslation } from 'react-i18next';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote, IonRange, IonSpinner,
  IonTitle, IonToggle, IonToolbar,
} from '@ionic/react';
import { volumeHighOutline, volumeMuteOutline } from 'ionicons/icons';
import type { MixerState, Part } from '../../core/model/types';
import { applyPreset, currentPreset, partMix, setPartMix, type MixPreset } from '../../core/audio/mixer';
import type { ScoreAudioStatus } from './useScoreAudio';

interface Props {
  isOpen: boolean;
  parts: Part[];
  soundOn: boolean;
  available: boolean;
  status: ScoreAudioStatus;
  mixer: MixerState | undefined;
  /** Master volume used when the mixer has none (settings). */
  defaultMaster: number;
  /** Parts matching "My instrument" in this score. */
  mine: string[];
  /** The "My instrument" profile is empty. */
  noProfile: boolean;
  inSetlist: boolean;
  /** Metronome on (auto-scroll), and its default volume (settings) when the mixer has none. */
  metronome: boolean;
  defaultMetronomeVolume: number;
  onMetronome(on: boolean): void;
  onSound(on: boolean): void;
  onChange(mixer: MixerState): void;
  onDismiss(): void;
}

const PRESETS: MixPreset[] = ['all', 'onlyMine', 'withoutMine'];

export function MixerModal(p: Props) {
  const { t } = useTranslation(['viewer', 'common']);
  const master = Math.round((p.mixer?.master ?? p.defaultMaster) * 100);
  const preset = currentPreset(p.parts, p.mixer, p.mine);
  const anySolo = p.parts.some((part) => partMix(p.mixer, part.musicXmlId).solo);
  // Only parts that have sound in the MIDI file.
  const parts = p.parts.filter((part) => part.midiChannels?.length);
  const metronomePercent = Math.round((p.mixer?.metronome ?? p.defaultMetronomeVolume) * 100);
  const metronomeName = t('sound.metronome');

  return (
    <IonModal isOpen={p.isOpen} onDidDismiss={p.onDismiss} breakpoints={[0, 0.75, 1]} initialBreakpoint={0.75} expandToScroll={false} className="mixer-modal" data-testid="mixer-modal">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('sound.title')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={p.onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem>
            <IonToggle checked={p.soundOn && p.available} disabled={!p.available} onIonChange={(e) => p.onSound(e.detail.checked)} data-testid="sound-toggle">
              <IonLabel>
                {t('sound.toggle')}
                <IonNote className="ion-text-wrap" style={{ display: 'block' }}>{p.available ? t('sound.toggleHint') : t('sound.unavailable')}</IonNote>
              </IonLabel>
            </IonToggle>
          </IonItem>
          {p.soundOn && p.status === 'loading' && (
            <IonItem lines="none" data-testid="sound-loading"><IonSpinner slot="start" name="dots" /><IonLabel>{t('sound.loading')}</IonLabel></IonItem>
          )}
          {p.soundOn && p.status === 'error' && (
            <IonItem lines="none"><IonNote color="danger" className="ion-text-wrap">{t('sound.error')}</IonNote></IonItem>
          )}
          <IonItem>
            <IonRange
              label={t('sound.master', { percent: master })}
              labelPlacement="stacked"
              min={0}
              max={100}
              step={5}
              value={master}
              disabled={!p.available}
              onIonChange={(e) => p.onChange({ ...(p.mixer ?? { parts: {} }), master: Number(e.detail.value) / 100 })}
              data-testid="master-volume"
            />
          </IonItem>
          {p.inSetlist && <IonItem lines="none"><IonNote className="ion-text-wrap">{t('sound.setlistNote')}</IonNote></IonItem>}
        </IonList>

        {/* Not an IonList (role list): buttons are not list items. */}
        <section className="mixer-section">
          <IonListHeader>{t('sound.presets')}</IonListHeader>
          <div className="mixer-presets" role="group" aria-label={t('sound.presets')}>
            {PRESETS.map((id) => (
              <button
                key={id}
                type="button"
                className={preset === id ? 'mixer-btn mixer-preset on' : 'mixer-btn mixer-preset'}
                disabled={!p.available || (id !== 'all' && !p.mine.length)}
                aria-pressed={preset === id}
                onClick={() => p.onChange(applyPreset(p.parts, p.mixer, id, p.mine))}
                data-testid={`mix-${id}`}
              >
                {t(`sound.${id}`)}
              </button>
            ))}
          </div>
          {!p.mine.length && <IonNote className="ion-text-wrap mixer-note">{p.noProfile ? t('sound.noProfile') : t('sound.noMatch')}</IonNote>}
        </section>

        <IonList>
          <IonListHeader>{t('sound.parts')}</IonListHeader>
          {/* Metronome: works with or without the sound (synth or Web Audio click); no solo button, never silenced by one. */}
          <IonItem className="mixer-part" data-testid="mixer-metronome" data-silent={String(!p.metronome)}>
            <div className="mixer-part-body">
              <div className="mixer-part-head">
                <span className={p.metronome ? 'mixer-part-name' : 'mixer-part-name silent'}>{metronomeName}</span>
                <button
                  type="button"
                  className={p.metronome ? 'mixer-btn mixer-mute' : 'mixer-btn mixer-mute on'}
                  aria-label={t('sound.mute', { name: metronomeName })}
                  aria-pressed={!p.metronome}
                  onClick={() => p.onMetronome(!p.metronome)}
                  data-testid="mixer-mute"
                >
                  <IonIcon icon={p.metronome ? volumeHighOutline : volumeMuteOutline} aria-hidden="true" />
                </button>
              </div>
              <IonRange
                aria-label={t('sound.volume', { name: metronomeName, percent: metronomePercent })}
                min={0}
                max={100}
                step={5}
                value={metronomePercent}
                onIonChange={(e) => p.onChange({ ...(p.mixer ?? { parts: {} }), metronome: Number(e.detail.value) / 100 })}
                data-testid="mixer-volume"
              />
              <IonNote className="ion-text-wrap mixer-note">{t('sound.metronomeHint')}</IonNote>
            </div>
          </IonItem>
          {parts.map((part) => {
            const m = partMix(p.mixer, part.musicXmlId);
            const percent = Math.round(m.volume * 100);
            const silent = m.muted || (anySolo && !m.solo);
            const set = (patch: Partial<typeof m>) => p.onChange(setPartMix(p.mixer, part.musicXmlId, patch));
            return (
              <IonItem key={part.musicXmlId} className="mixer-part" data-testid="mixer-part" data-part={part.musicXmlId} data-silent={String(silent)}>
                <div className="mixer-part-body">
                  <div className="mixer-part-head">
                    <span className={silent ? 'mixer-part-name silent' : 'mixer-part-name'}>{part.name}</span>
                    {/* Native toggle buttons: their aria-pressed state is announced reliably. */}
                    <button
                      type="button"
                      className={m.muted ? 'mixer-btn mixer-mute on' : 'mixer-btn mixer-mute'}
                      disabled={!p.available}
                      aria-label={t('sound.mute', { name: part.name })}
                      aria-pressed={m.muted}
                      onClick={() => set({ muted: !m.muted })}
                      data-testid="mixer-mute"
                    >
                      <IonIcon icon={m.muted ? volumeMuteOutline : volumeHighOutline} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={m.solo ? 'mixer-btn mixer-solo on' : 'mixer-btn mixer-solo'}
                      disabled={!p.available}
                      aria-label={t('sound.solo', { name: part.name })}
                      aria-pressed={m.solo}
                      onClick={() => set({ solo: !m.solo })}
                      data-testid="mixer-solo"
                    >
                      <span aria-hidden="true">{t('sound.soloShort')}</span>
                    </button>
                  </div>
                  <IonRange
                    aria-label={t('sound.volume', { name: part.name, percent })}
                    min={0}
                    max={100}
                    step={5}
                    value={percent}
                    disabled={!p.available}
                    onIonChange={(e) => set({ volume: Number(e.detail.value) / 100 })}
                    data-testid="mixer-volume"
                  />
                </div>
              </IonItem>
            );
          })}
        </IonList>
      </IonContent>
    </IonModal>
  );
}
