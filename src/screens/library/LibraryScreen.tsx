import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonLabel, IonList, IonLoading,
  IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar,
  useIonAlert, useIonToast,
} from '@ionic/react';
import { add, settingsOutline } from 'ionicons/icons';
import { routes } from '../../app/routes';
import type { Score } from '../../core/model/types';
import { onRestoredPick, pickScoreFiles } from '../../core/import/filePicker';
import { onOpenWith } from '../../core/import/openWith';
import type { ImportInput } from '../../core/import/importScore';
import { useLibrary, type ImportReport } from '../../state/libraryStore';
import { ScoreItem } from './ScoreItem';
import { SetlistsTab } from '../setlists/SetlistsTab';
import { useSetlists } from '../../state/setlistStore';
import { ScoreInfoModal } from './ScoreInfoModal';

type Tab = 'scores' | 'setlists';
type SortKey = 'recent' | 'title' | 'composer' | 'imported';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const SORTERS: Record<SortKey, (a: Score, b: Score) => number> = {
  recent: (a, b) => (b.lastOpenedAt ?? b.importedAt).localeCompare(a.lastOpenedAt ?? a.importedAt),
  title: (a, b) => collator.compare(a.title, b.title),
  composer: (a, b) => collator.compare(a.composer ?? '￿', b.composer ?? '￿') || collator.compare(a.title, b.title),
  imported: (a, b) => b.importedAt.localeCompare(a.importedAt),
};

export function LibraryScreen() {
  const { t } = useTranslation(['library', 'common', 'setlists']);
  const navigate = useNavigate();
  const { scores, loaded, importing, upgrading, load, importFiles, rename, remove, markOpened } = useLibrary();
  const [tab, setTab] = useState<Tab>('scores');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [info, setInfo] = useState<Score>();
  const [presentAlert] = useIonAlert();
  const setlists = useSetlists((s) => s.setlists);
  const [presentToast] = useIonToast();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const reportImport = (report: ImportReport) => {
    const parts = [
      report.imported.length && t('import.result.imported', { count: report.imported.length }),
      report.duplicates.length && t('import.result.duplicates', { count: report.duplicates.length }),
      report.failed.length && t('import.result.failed', { count: report.failed.length }),
    ].filter(Boolean);
    const errors = report.failed.map((f) => t(`import.errors.${f.code}`, { name: f.name }));
    if (errors.length) {
      void presentAlert({ header: parts.join(' · '), message: errors.join('\n\n'), buttons: [t('common:actions.ok')] });
    } else if (parts.length) {
      void presentToast({ message: parts.join(' · '), duration: 2500, position: 'bottom' });
    }
  };

  const runImport = async (inputs: ImportInput[]) => {
    if (inputs.length) reportImport(await importFiles(inputs));
  };

  // Files picked right before Android restarted the app (see filePicker.ts).
  useEffect(() => onRestoredPick((inputs) => void runImport(inputs)), []); // eslint-disable-line react-hooks/exhaustive-deps

  // "Open with…" from another app: import, then open the score.
  useEffect(
    () =>
      onOpenWith((input) =>
        void importFiles([input]).then((report) => {
          const score = report.imported[0] ?? report.duplicates[0];
          if (score) navigate(routes.viewer(score.id));
          else reportImport(report);
        }),
      ),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const filtered = q ? scores.filter((s) => `${s.title} ${s.composer ?? ''}`.toLocaleLowerCase().includes(q)) : scores;
    return [...filtered].sort(SORTERS[sort]);
  }, [scores, query, sort]);

  const open = (score: Score) => {
    void markOpened(score.id);
    navigate(routes.viewer(score.id));
  };

  const askRename = (score: Score) =>
    void presentAlert({
      header: t('rename.title'),
      inputs: [{ name: 'title', value: score.title, placeholder: t('rename.placeholder') }],
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.rename'), handler: (v: { title: string }) => void rename(score.id, v.title) },
      ],
    });

  const askDelete = (score: Score) => {
    // Mention the setlists that contain this score: it will be removed from them too.
    const inSetlists = setlists.filter((s) => s.items.some((it) => it.scoreId === score.id)).map((s) => s.name);
    const message = [t('delete.message', { title: score.title }), inSetlists.length ? t('setlists:deletedFrom', { names: inSetlists.join(', ') }) : '']
      .filter(Boolean)
      .join(' ');
    return void presentAlert({
      header: t('delete.title'),
      message,
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.delete'), role: 'destructive', handler: () => void remove(score.id) },
      ],
    });
  };

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
        {tab === 'scores' && scores.length > 0 && (
          <IonToolbar>
            <IonSearchbar value={query} placeholder={t('search')} onIonInput={(e) => setQuery(e.detail.value ?? '')} />
            <IonButtons slot="end">
              <IonSelect aria-label={t('sort.label')} interface="popover" value={sort} onIonChange={(e) => setSort(e.detail.value as SortKey)}>
                {(Object.keys(SORTERS) as SortKey[]).map((k) => (
                  <IonSelectOption key={k} value={k}>{t(`sort.${k}`)}</IonSelectOption>
                ))}
              </IonSelect>
            </IonButtons>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent>
        {tab === 'scores' ? (
          scores.length === 0 ? (
            loaded && (
              <IonText color="medium" className="ion-padding" style={{ display: 'block' }}>
                <h2>{t('empty.title')}</h2>
                <p>{t('empty.body')}</p>
              </IonText>
            )
          ) : visible.length === 0 ? (
            <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('noMatch', { query })}</p></IonText>
          ) : (
            <IonList>
              {visible.map((s) => (
                <ScoreItem key={s.id} score={s} onOpen={() => open(s)} onRename={() => askRename(s)} onInfo={() => setInfo(s)} onDelete={() => askDelete(s)} />
              ))}
            </IonList>
          )
        ) : (
          <SetlistsTab />
        )}
        {tab === 'scores' && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end">
            <IonFabButton aria-label={t('import.button')} disabled={!!importing} onClick={() => void pickScoreFiles().then(runImport)}>
              <IonIcon icon={add} />
            </IonFabButton>
          </IonFab>
        )}
        <ScoreInfoModal score={info} onDismiss={() => setInfo(undefined)} />
        <IonLoading isOpen={!!upgrading && !importing} message={upgrading ? t('upgrade', { done: upgrading.done + 1, total: upgrading.total }) : ''} />
        <IonLoading
          isOpen={!!importing}
          message={importing ? t('import.progress', { current: importing.current ?? '', done: importing.done + 1, total: importing.total }) : ''}
        />
      </IonContent>
    </IonPage>
  );
}
