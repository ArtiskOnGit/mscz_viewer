import { useTranslation } from 'react-i18next';
import { IonIcon } from '@ionic/react';
import { checkmark } from 'ionicons/icons';
import type { FolderColor } from '../../core/model/types';
import { FOLDER_COLOR_CHOICES, folderColorStyle } from './folderColors';
import './library.css';

interface Props {
  /** undefined = the default colour. */
  value: FolderColor | undefined;
  onChange(color: FolderColor | undefined): void;
}

/** Grid of colour swatches: native 48 px buttons named by their colour, the current one pressed and checked. */
export function FolderColorSwatches({ value, onChange }: Props) {
  const { t } = useTranslation('library');
  return (
    <div role="group" aria-label={t('folders.colorLabel')} className="folder-swatches" data-testid="folder-swatches">
      {FOLDER_COLOR_CHOICES.map((choice) => {
        const color = choice === 'default' ? undefined : choice;
        const selected = color === value;
        const name = t(`folders.colors.${choice}`);
        return (
          <button
            key={choice}
            type="button"
            className="folder-swatch"
            style={folderColorStyle(color)}
            aria-pressed={selected}
            aria-label={name}
            title={name}
            data-testid="folder-swatch"
            data-color={choice}
            onClick={() => onChange(color)}
          >
            {selected && <IonIcon icon={checkmark} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
