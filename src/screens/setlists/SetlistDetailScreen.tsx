import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IonBackButton, IonBadge, IonButton, IonButtons, IonCheckbox, IonContent, IonFab, IonFabButton, IonFooter, IonHeader, IonIcon, IonItem,
  IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonList, IonModal, IonNote, IonPage, IonReorder, IonReorderGroup, IonText,
  IonTitle, IonToolbar, useIonAlert,
} from '@ionic/react';
import { add, play } from 'ionicons/icons';
import { routes } from '../../app/routes';
import { defaultPartIds, type ScoreViewState, type SetlistItem } from '../../core/model/types';
import { viewStateRepository } from '../../core/services';
import { effectiveViewState, hasTransposeOverride, transposeBadgeValue, transposeOverride } from '../../core/setlists/effectiveView';
import { TransposeModal } from '../viewer/TransposeModal';
import { useLibrary } from '../../state/libraryStore';
import { useSetlists } from '../../state/setlistStore';
import { PartsModal } from '../viewer/PartsModal';
import { formatDuration } from '../../ui/format';
import './setlists.css';

export function SetlistDetailScreen() {
  const { t } = useTranslation(['setlists', 'common', 'viewer']);
  const navigate = useNavigate();
  const { setlistId = '' } = useParams<{ setlistId: string }>();
  const { setlists, loaded, load, addScores, removeItem, moveItem, setNote, setOverride } = useSetlists();
  const { scores, loaded: libraryLoaded, load: loadLibrary } = useLibrary();
  const [presentAlert] = useIonAlert();
  const [adding, setAdding] = useState(false);
  const [partsItem, setPartsItem] = useState<SetlistItem>();
  // Transposition of a piece: edited over the score's own settings (`base`).
  const [transposeItem, setTransposeItem] = useState<{ item: SetlistItem; base: ScoreViewState }>();
  const transposeShown = transposeItem ? effectiveViewState(transposeItem.base, transposeItem.item.override) : undefined;

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  useEffect(() => {
    if (!libraryLoaded) void loadLibrary();
  }, [libraryLoaded, loadLibrary]);

  const setlist = setlists.find((s) => s.id === setlistId);
  const scoreById = useMemo(() => new Map(scores.map((s) => [s.id, s])), [scores]);
  const partsScore = partsItem ? scoreById.get(partsItem.scoreId) : undefined;

  const playFrom = (item: SetlistItem | undefined) => {
    if (setlist && item && scoreById.has(item.scoreId)) navigate(routes.viewerInSetlist(item.scoreId, setlist.id, item.id));
  };

  const openTranspose = (item: SetlistItem) =>
    void viewStateRepository.get(item.scoreId).then((base) => setTransposeItem({ item, base }));

  const askNote = (item: SetlistItem) =>
    void presentAlert({
      header: t('note.title'),
      inputs: [{ name: 'note', type: 'textarea', value: item.note ?? '', placeholder: t('note.placeholder') }],
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.ok'), handler: (v: { note: string }) => void setNote(setlistId, item.id, v.note) },
      ],
    });

  if (loaded && !setlist) {
    return (
      <IonPage>
        <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding"><p>{t('notFound')}</p></IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref={routes.library} /></IonButtons>
          <IonTitle>{setlist?.name}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => playFrom(setlist?.items.find((it) => scoreById.has(it.scoreId)))} disabled={!setlist?.items.length}>
              <IonIcon slot="start" icon={play} />
              {t('play')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {setlist && setlist.items.length === 0 && (
          <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('emptyItems')}</p></IonText>
        )}
        {setlist && setlist.items.length > 0 && (
          <IonList>
            <IonReorderGroup
              disabled={false}
              onIonItemReorder={(e) => {
                const { from, to } = e.detail;
                e.detail.complete(false); // React re-renders the new order from the store
                void moveItem(setlistId, from, to);
              }}
            >
              {setlist.items.map((item, index) => {
                const score = scoreById.get(item.scoreId);
                const custom = item.override?.selectedParts?.length;
                const info = [
                  score?.composer,
                  custom && score ? t('partsCustom', { count: custom, total: score.parts.length }) : undefined,
                  formatDuration(score?.durationSec),
                ].filter(Boolean).join(' · ');
                const shownTranspose = hasTransposeOverride(item.override)
                  ? t('viewer:transpose.badge', { value: transposeBadgeValue({ transposeSemitones: 0, transposeOctave: 0, concertPitch: false, ...item.override }) || ' 0' })
                  : undefined;
                return (
                  <IonItemSliding key={item.id}>
                    <IonItem button={!!score} detail={false} onClick={() => playFrom(item)}>
                      <IonNote slot="start" className="setlist-index">{index + 1}</IonNote>
                      <IonLabel>
                        <h2>{score?.title ?? t('missingScore')}</h2>
                        {info && <p>{info}</p>}
                        {item.note && <p><em>{item.note}</em></p>}
                      </IonLabel>
                      {item.override && (
                        <IonBadge slot="end" color="medium" data-testid="override-badge">{shownTranspose ?? t('overrideBadge')}</IonBadge>
                      )}
                      <IonReorder slot="end" aria-label={t('reorder')} />
                    </IonItem>
                    <IonItemOptions side="end">
                      <IonItemOption color="medium" onClick={() => askNote(item)}>{t('note.button')}</IonItemOption>
                      {score && score.parts.length > 1 && <IonItemOption onClick={() => setPartsItem(item)}>{t('parts')}</IonItemOption>}
                      {score && <IonItemOption color="secondary" onClick={() => openTranspose(item)} data-testid="item-transpose">{t('transpose')}</IonItemOption>}
                      <IonItemOption color="danger" onClick={() => void removeItem(setlistId, item.id)}>{t('remove')}</IonItemOption>
                    </IonItemOptions>
                  </IonItemSliding>
                );
              })}
            </IonReorderGroup>
          </IonList>
        )}
        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton aria-label={t('addScores')} data-testid="add-scores" onClick={() => setAdding(true)}>
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
        <AddScoresModal
          isOpen={adding}
          onDismiss={() => setAdding(false)}
          onAdd={(ids) => {
            setAdding(false);
            void addScores(setlistId, ids);
          }}
        />
        <PartsModal
          isOpen={!!partsItem && !!partsScore}
          parts={partsScore?.parts ?? []}
          selected={partsItem?.override?.selectedParts?.length ? partsItem.override.selectedParts : defaultPartIds(partsScore?.parts ?? [])}
          defaults={defaultPartIds(partsScore?.parts ?? [])}
          onDismiss={() => setPartsItem(undefined)}
          onApply={(selectedParts) => {
            if (partsItem) void setOverride(setlistId, partsItem.id, { selectedParts: selectedParts.length ? selectedParts : undefined });
            setPartsItem(undefined);
          }}
        />
        <TransposeModal
          isOpen={!!transposeShown}
          keySig={undefined}
          value={{
            transposeSemitones: transposeShown?.transposeSemitones ?? 0,
            transposeOctave: transposeShown?.transposeOctave ?? 0,
            concertPitch: transposeShown?.concertPitch ?? false,
          }}
          onDismiss={() => setTransposeItem(undefined)}
          onApply={(value) => {
            if (transposeItem) void setOverride(setlistId, transposeItem.item.id, transposeOverride(value, transposeItem.base));
            setTransposeItem(undefined);
          }}
        />
      </IonContent>
    </IonPage>
  );
}

function AddScoresModal({ isOpen, onDismiss, onAdd }: { isOpen: boolean; onDismiss(): void; onAdd(ids: string[]): void }) {
  const { t } = useTranslation(['setlists', 'common']);
  const scores = useLibrary((s) => s.scores);
  const [checked, setChecked] = useState<string[]>([]);
  const sorted = useMemo(() => [...scores].sort((a, b) => a.title.localeCompare(b.title)), [scores]);

  return (
    <IonModal isOpen={isOpen} onWillPresent={() => setChecked([])} onDidDismiss={onDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('addScores')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.close')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {sorted.length === 0 ? (
          <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('noScores')}</p></IonText>
        ) : (
          <IonList>
            {sorted.map((s) => (
              <IonItem key={s.id}>
                <IonCheckbox
                  checked={checked.includes(s.id)}
                  onIonChange={(e) => setChecked((prev) => (e.detail.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                >
                  {s.title}
                </IonCheckbox>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
      <IonFooter>
        <IonToolbar>
          <IonButton expand="block" disabled={checked.length === 0} onClick={() => onAdd(checked)}>
            {t('addSelected', { count: checked.length })}
          </IonButton>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
}
