import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  IonBackButton, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonFabList, IonFooter, IonHeader, IonIcon, IonLabel, IonList,
  IonPage, IonSearchbar, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar, useIonAlert, useIonToast,
} from '@ionic/react';
import { add, documentAttachOutline, folderOutline, settingsOutline } from 'ionicons/icons';
import { routes } from '../../app/routes';
import type { Folder, FolderId, Score, ScoreId } from '../../core/model/types';
import { childFolders, folderPath, isInside, itemCount } from '../../core/model/folders';
import { FolderCycleError } from '../../core/storage/libraryRepository';
import { pickScoreFiles } from '../../core/import/filePicker';
import type { ImportInput } from '../../core/import/importScore';
import { useLibrary } from '../../state/libraryStore';
import { ScoreItem } from './ScoreItem';
import { FolderItem } from './FolderItem';
import { FolderPickerModal } from './FolderPickerModal';
import { SetlistsTab } from '../setlists/SetlistsTab';
import { useSetlists } from '../../state/setlistStore';
import { ScoreInfoModal } from './ScoreInfoModal';
import { useImportReport } from './useImportReport';

type Tab = 'scores' | 'setlists';
type SortKey = 'recent' | 'title' | 'composer' | 'imported';
/** What "Move to…" moves: scores (one or a selection) or a folder. */
type Moving = { kind: 'scores'; ids: ScoreId[] } | { kind: 'folder'; folder: Folder };

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const SORTERS: Record<SortKey, (a: Score, b: Score) => number> = {
  recent: (a, b) => (b.lastOpenedAt ?? b.importedAt).localeCompare(a.lastOpenedAt ?? a.importedAt),
  title: (a, b) => collator.compare(a.title, b.title),
  composer: (a, b) => collator.compare(a.composer ?? '￿', b.composer ?? '￿') || collator.compare(a.title, b.title),
  imported: (a, b) => b.importedAt.localeCompare(a.importedAt),
};

/**
 * The library: /library is the root, /library/folder/:folderId a folder (ADR-029). Each folder is its own page in the
 * Ionic stack, so the header back button and the Android back button go up one level.
 */
export function LibraryScreen() {
  const { t } = useTranslation(['library', 'common', 'setlists']);
  const navigate = useNavigate();
  const { folderId } = useParams<{ folderId?: string }>();
  const inFolder = folderId !== undefined;
  const {
    scores, folders, loaded, importing, load, importFiles, rename, remove, markOpened, createFolder, renameFolder, deleteFolder, moveScores, moveFolder,
  } = useLibrary();
  const [tab, setTab] = useState<Tab>('scores');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [info, setInfo] = useState<Score>();
  const [moving, setMoving] = useState<Moving>();
  const [selected, setSelected] = useState<ScoreId[]>();
  const [presentAlert] = useIonAlert();
  const [presentToast] = useIonToast();
  const setlists = useSetlists((s) => s.setlists);
  const reportImport = useImportReport();

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const folder = folders.find((f) => f.id === folderId);
  const missing = inFolder && loaded && !folder;
  const path = useMemo(() => folderPath(folders, folderId), [folders, folderId]);
  const parentHref = routes.libraryFolder(path.at(-2)?.id);
  const pathText = (id: FolderId | undefined) => [t('folders.root'), ...folderPath(folders, id).map((f) => f.name)].join(' › ');
  const nameOf = (id: FolderId | undefined) => (id ? (folders.find((f) => f.id === id)?.name ?? '') : t('folders.root'));
  const showScores = !inFolder ? tab === 'scores' : !missing;

  const q = query.trim().toLocaleLowerCase();
  const searching = q.length > 0;
  const visibleFolders = useMemo(() => {
    const list = searching ? folders.filter((f) => f.name.toLocaleLowerCase().includes(q)) : childFolders(folders, folderId);
    return [...list].sort((a, b) => collator.compare(a.name, b.name));
  }, [folders, folderId, q, searching]);
  // Sorting applies within the folder; a search covers the whole library.
  const visibleScores = useMemo(() => {
    const list = searching
      ? scores.filter((s) => `${s.title} ${s.composer ?? ''}`.toLocaleLowerCase().includes(q))
      : scores.filter((s) => s.folderId === folderId);
    return [...list].sort(SORTERS[sort]);
  }, [scores, folderId, q, searching, sort]);

  // Selection mode: the Android back button leaves it first.
  useEffect(() => {
    if (!selected) return;
    const onBack = (e: Event) =>
      (e as CustomEvent<{ register(priority: number, handler: () => void): void }>).detail.register(150, () => setSelected(undefined));
    document.addEventListener('ionBackButton', onBack);
    return () => document.removeEventListener('ionBackButton', onBack);
  }, [selected]);

  const runImport = async (inputs: ImportInput[]) => {
    if (inputs.length) reportImport(await importFiles(inputs, folder?.id));
  };

  const open = (score: Score) => {
    void markOpened(score.id);
    navigate(routes.viewer(score.id));
  };

  const toggleSelect = (id: ScoreId) =>
    setSelected((cur) => {
      if (!cur) return [id];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return next.length ? next : undefined;
    });

  const askName = (header: string, value: string, confirm: string, then: (name: string) => void) =>
    void presentAlert({
      header,
      inputs: [{ name: 'name', value, placeholder: t('folders.namePlaceholder'), attributes: { 'data-testid': 'folder-name-input' } }],
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: confirm, handler: (v: { name: string }) => void (v.name.trim() && then(v.name)) },
      ],
    });

  const askNewFolder = () => askName(t('folders.new'), '', t('folders.create'), (name) => void createFolder(name, folder?.id));

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

  const askRenameFolder = (f: Folder) => askName(t('folders.rename'), f.name, t('common:actions.rename'), (name) => void renameFolder(f.id, name));

  const askDeleteFolder = (f: Folder) =>
    void presentAlert({
      header: t('folders.deleteTitle'),
      message: t('folders.deleteMessage', { name: f.name, parent: nameOf(f.parentId) }),
      buttons: [
        { text: t('common:actions.cancel'), role: 'cancel' },
        { text: t('common:actions.delete'), role: 'destructive', handler: () => void deleteFolder(f.id) },
      ],
    });

  // --- Move to… ---
  const movingFrom = (m: Moving): FolderId | null | undefined => {
    if (m.kind === 'folder') return m.folder.parentId;
    const places = new Set(m.ids.map((id) => scores.find((s) => s.id === id)?.folderId));
    return places.size === 1 ? [...places][0] : null;
  };
  const excluded = useMemo(
    () => (moving?.kind === 'folder' ? new Set(folders.filter((f) => isInside(folders, f.id, moving.folder.id)).map((f) => f.id)) : undefined),
    [moving, folders],
  );
  const moveTo = async (target: FolderId | undefined) => {
    const m = moving;
    setMoving(undefined);
    if (!m) return;
    try {
      if (m.kind === 'folder') await moveFolder(m.folder.id, target);
      else await moveScores(m.ids, target);
    } catch (e) {
      if (e instanceof FolderCycleError) void presentToast({ message: t('folders.cycle'), duration: 2500 });
      else throw e;
      return;
    }
    setSelected(undefined);
    const count = m.kind === 'folder' ? 1 : m.ids.length;
    // Read the folders from the store: the target may have just been created ("New folder" in the picker).
    const name = target ? (useLibrary.getState().folders.find((f) => f.id === target)?.name ?? '') : t('folders.root');
    void presentToast({ message: t('folders.moved', { count, name }), duration: 2000, position: 'bottom' });
  };
  // "New folder" in the picker: created in the folder shown here, then the items move into it.
  const createAndMove = () =>
    askName(t('folders.new'), '', t('folders.create'), (name) => void createFolder(name, folder?.id).then((f) => moveTo(f.id)));

  const scoreItems = visibleScores.map((s) => (
    <ScoreItem
      key={s.id}
      score={s}
      path={searching ? pathText(s.folderId) : undefined}
      onOpen={() => open(s)}
      onRename={() => askRename(s)}
      onInfo={() => setInfo(s)}
      onMove={() => setMoving({ kind: 'scores', ids: [s.id] })}
      onDelete={() => askDelete(s)}
      onSelect={() => toggleSelect(s.id)}
      selecting={!!selected}
      selected={selected?.includes(s.id)}
    />
  ));
  const folderItems = visibleFolders.map((f) => (
    <FolderItem
      key={f.id}
      folder={f}
      count={itemCount(folders, scores, f.id)}
      path={searching ? pathText(f.parentId) : undefined}
      onOpen={() => navigate(routes.libraryFolder(f.id))}
      onRename={() => askRenameFolder(f)}
      onMove={() => setMoving({ kind: 'folder', folder: f })}
      onDelete={() => askDeleteFolder(f)}
    />
  ));
  const libraryEmpty = scores.length === 0 && folders.length === 0;

  return (
    <IonPage data-testid={inFolder ? 'library-folder-page' : 'library-page'}>
      <IonHeader>
        <IonToolbar>
          {inFolder && (
            <IonButtons slot="start"><IonBackButton defaultHref={parentHref} data-testid="folder-back" /></IonButtons>
          )}
          <IonTitle>{inFolder ? (folder?.name ?? '') : t('title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton routerLink={routes.settings} aria-label={t('settings')}>
              <IonIcon slot="icon-only" icon={settingsOutline} aria-hidden="true" />
            </IonButton>
          </IonButtons>
        </IonToolbar>
        {!inFolder && (
          <IonToolbar>
            <IonSegment value={tab} onIonChange={(e) => setTab(e.detail.value as Tab)}>
              <IonSegmentButton value="scores"><IonLabel>{t('tabs.scores')}</IonLabel></IonSegmentButton>
              <IonSegmentButton value="setlists"><IonLabel>{t('tabs.setlists')}</IonLabel></IonSegmentButton>
            </IonSegment>
          </IonToolbar>
        )}
        {showScores && !libraryEmpty && (
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
        {inFolder && folder && !searching && (
          <nav className="folder-breadcrumb" aria-label={t('folders.breadcrumb')} data-testid="folder-breadcrumb">
            {[t('folders.root'), ...path.map((f) => f.name)].join(' › ')}
          </nav>
        )}
        {missing ? (
          <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('folders.notFound')}</p></IonText>
        ) : !showScores ? (
          <SetlistsTab />
        ) : libraryEmpty ? (
          loaded && (
            <IonText color="medium" className="ion-padding" style={{ display: 'block' }}>
              <h2>{t('empty.title')}</h2>
              <p>{t('empty.body')}</p>
            </IonText>
          )
        ) : searching && !folderItems.length && !scoreItems.length ? (
          <IonText color="medium" className="ion-padding" style={{ display: 'block' }}><p>{t('noMatch', { query })}</p></IonText>
        ) : !folderItems.length && !scoreItems.length ? (
          <IonText color="medium" className="ion-padding" style={{ display: 'block' }} data-testid="folder-empty"><p>{t('folders.empty')}</p></IonText>
        ) : (
          <IonList>
            {folderItems}
            {scoreItems}
          </IonList>
        )}
        {showScores && !selected && (
          <IonFab slot="fixed" vertical="bottom" horizontal="end" className="library-fab">
            <IonFabButton aria-label={t('add')} disabled={!!importing} data-testid="fab-add">
              <IonIcon icon={add} aria-hidden="true" />
            </IonFabButton>
            <IonFabList side="top">
              <IonFabButton aria-label={t('import.button')} title={t('import.button')} data-testid="fab-import" onClick={() => void pickScoreFiles().then(runImport)}>
                <IonIcon icon={documentAttachOutline} aria-hidden="true" />
              </IonFabButton>
              <IonFabButton aria-label={t('folders.new')} title={t('folders.new')} data-testid="fab-new-folder" onClick={askNewFolder}>
                <IonIcon icon={folderOutline} aria-hidden="true" />
              </IonFabButton>
            </IonFabList>
          </IonFab>
        )}
        <ScoreInfoModal score={info} onDismiss={() => setInfo(undefined)} />
        <FolderPickerModal
          isOpen={!!moving}
          folders={folders}
          current={moving ? movingFrom(moving) : null}
          excluded={excluded}
          onPick={(target) => void moveTo(target)}
          onCreate={createAndMove}
          onDismiss={() => setMoving(undefined)}
        />
      </IonContent>
      {selected && (
        <IonFooter>
          <IonToolbar>
            <IonTitle size="small" data-testid="selection-count">{t('select.count', { count: selected.length })}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setSelected(undefined)} data-testid="selection-done">{t('select.done')}</IonButton>
              <IonButton fill="solid" color="primary" onClick={() => setMoving({ kind: 'scores', ids: selected })} data-testid="selection-move">
                {t('select.move')}
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonFooter>
      )}
    </IonPage>
  );
}
