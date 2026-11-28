import { useTranslation } from 'react-i18next';
import { IonButton, IonIcon, IonItem, IonItemOption, IonItemOptions, IonItemSliding, IonLabel, IonThumbnail, useIonActionSheet } from '@ionic/react';
import { ellipsisVertical } from 'ionicons/icons';
import type { Folder } from '../../core/model/types';
import { FolderIcon } from './FolderIcon';
import './library.css';

interface Props {
  folder: Folder;
  /** Sub-folders + scores directly inside. */
  count: number;
  /** Folder path, shown in search results. */
  path?: string;
  onOpen(): void;
  onRename(): void;
  /** "Color…": the colour picker. */
  onColor(): void;
  onMove(): void;
  onDelete(): void;
}

// Same layout as ScoreItem: an "open" button, a "more actions" button beside it, the same actions on swipe.
export function FolderItem({ folder, count, path, onOpen, onRename, onColor, onMove, onDelete }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const [presentActions] = useIonActionSheet();
  const items = t('folders.items', { count });
  const more = () =>
    void presentActions({
      header: folder.name,
      buttons: [
        { text: t('common:actions.rename'), handler: onRename },
        { text: t('folders.color'), handler: onColor },
        { text: t('folders.move'), handler: onMove },
        { text: t('common:actions.delete'), role: 'destructive', handler: onDelete },
        { text: t('common:actions.cancel'), role: 'cancel' },
      ],
    });

  return (
    <IonItemSliding className="folder-sliding">
      <IonItem className="folder-item">
        <button type="button" className="item-open" onClick={onOpen} data-testid="folder-open" data-folder={folder.name}>
          <IonThumbnail className="folder-thumb">
            <FolderIcon color={folder.color} />
          </IonThumbnail>
          <IonLabel>
            <h2>{folder.name}</h2>
            <p>{items}</p>
            {path && <p className="item-path">{t('folders.inFolder', { path })}</p>}
          </IonLabel>
        </button>
        <IonButton slot="end" fill="clear" color="medium" className="item-more" onClick={more} aria-label={t('folders.moreActions', { name: folder.name })} data-testid="folder-more">
          <IonIcon slot="icon-only" icon={ellipsisVertical} aria-hidden="true" />
        </IonButton>
      </IonItem>
      <IonItemOptions side="end">
        <IonItemOption onClick={onRename}>{t('common:actions.rename')}</IonItemOption>
        <IonItemOption color="medium" onClick={onMove}>{t('folders.move')}</IonItemOption>
        <IonItemOption color="danger" onClick={onDelete}>{t('common:actions.delete')}</IonItemOption>
      </IonItemOptions>
    </IonItemSliding>
  );
}
