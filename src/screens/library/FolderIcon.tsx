import { IonIcon } from '@ionic/react';
import { folder as folderFilled } from 'ionicons/icons';
import type { FolderColor } from '../../core/model/types';
import { folderColorStyle } from './folderColors';
import './library.css';

interface Props {
  color: FolderColor | undefined;
  slot?: string;
}

/** The folder icon, filled with the folder colour (decorative: the folder name is read instead). */
export function FolderIcon({ color, slot }: Props) {
  return <IonIcon icon={folderFilled} slot={slot} className="folder-icon" style={folderColorStyle(color)} data-color={color ?? 'default'} aria-hidden="true" />;
}
