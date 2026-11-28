import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonNote, IonTitle, IonToolbar } from '@ionic/react';
import { addOutline, libraryOutline } from 'ionicons/icons';
import type { Folder, FolderId } from '../../core/model/types';
import { folderTree } from '../../core/model/folders';
import { FolderIcon } from './FolderIcon';

interface Props {
  isOpen: boolean;
  folders: readonly Folder[];
  /** Where the moved items are now (undefined = the root, null = several places): shown, not selectable. */
  current: FolderId | null | undefined;
  /** Folders that cannot receive the items (a moved folder and its sub-folders). */
  excluded?: ReadonlySet<FolderId>;
  onPick(folderId: FolderId | undefined): void;
  /** "New folder…": asks a name and a colour, creates the folder and moves there. */
  onCreate(): void;
  onDismiss(): void;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** "Move to…": the folder tree, the root of the library first. */
export function FolderPickerModal({ isOpen, folders, current, excluded, onPick, onCreate, onDismiss }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const tree = useMemo(() => folderTree(folders, collator.compare), [folders]);
  const note = <IonNote slot="end">{t('folders.current')}</IonNote>;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss} data-testid="folder-picker">
      <IonHeader>
        <IonToolbar>
          <IonTitle>{t('folders.moveTitle')}</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onDismiss}>{t('common:actions.cancel')}</IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem button detail={false} onClick={onCreate} data-testid="picker-new-folder">
            <IonIcon slot="start" icon={addOutline} color="primary" aria-hidden="true" />
            <IonLabel color="primary">{t('folders.new')}</IonLabel>
          </IonItem>
          <IonItem button detail={false} disabled={current === undefined} onClick={() => onPick(undefined)} data-testid="picker-root">
            <IonIcon slot="start" icon={libraryOutline} aria-hidden="true" />
            <IonLabel>{t('folders.rootEntry')}</IonLabel>
            {current === undefined && note}
          </IonItem>
          {tree.map(({ folder, depth }) => (
            <IonItem
              key={folder.id}
              button
              detail={false}
              disabled={folder.id === current || excluded?.has(folder.id)}
              onClick={() => onPick(folder.id)}
              data-testid="picker-folder"
              data-folder={folder.name}
              style={{ '--padding-start': `${16 + 24 * (depth + 1)}px` }}
            >
              <FolderIcon slot="start" color={folder.color} />
              <IonLabel>{folder.name}</IonLabel>
              {folder.id === current && note}
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonModal>
  );
}
