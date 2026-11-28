// Small dialog for a folder (ADR-029): "New folder" (name + colour, then Create) or "Color" of an existing folder
// (a tap on a swatch applies it and closes).
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IonButton, IonHeader, IonInput, IonModal, IonTitle, IonToolbar } from '@ionic/react';
import type { FolderColor } from '../../core/model/types';
import { FolderColorSwatches } from './FolderColorSwatches';
import './library.css';

export type FolderDialogRequest =
  | { kind: 'create'; then(name: string, color: FolderColor | undefined): void }
  | { kind: 'color'; name: string; color: FolderColor | undefined; then(color: FolderColor | undefined): void };

interface Props {
  /** undefined = closed. */
  request: FolderDialogRequest | undefined;
  onDismiss(): void;
}

export function FolderDialog({ request, onDismiss }: Props) {
  const { t } = useTranslation(['library', 'common']);
  const [name, setName] = useState('');
  const [color, setColor] = useState<FolderColor | undefined>();
  const input = useRef<HTMLIonInputElement>(null);
  // Kept while the dialog closes (its content must not change during the leave animation).
  const [shown, setShown] = useState(request);
  if (request && request !== shown) setShown(request);
  const r = request ?? shown;

  const create = () => {
    if (r?.kind !== 'create' || !name.trim()) return;
    r.then(name.trim(), color);
    onDismiss();
  };
  const pick = (c: FolderColor | undefined) => {
    if (r?.kind === 'create') return setColor(c);
    if (r?.kind === 'color') {
      if (c !== r.color) r.then(c);
      onDismiss();
    }
  };

  const title = r?.kind === 'color' ? t('folders.colorTitle', { name: r.name }) : t('folders.new');

  return (
    <IonModal
      isOpen={!!request}
      aria-label={title}
      className="folder-dialog"
      onWillPresent={() => {
        setName('');
        setColor(r?.kind === 'color' ? r.color : undefined);
      }}
      onDidPresent={() => void (r?.kind === 'create' && input.current?.setFocus())}
      onDidDismiss={onDismiss}
      data-testid="folder-dialog"
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <div className="folder-dialog-body">
        {r?.kind === 'create' && (
          <IonInput
            ref={input}
            label={t('folders.nameLabel')}
            labelPlacement="stacked"
            fill="outline"
            placeholder={t('folders.namePlaceholder')}
            enterkeyhint="done"
            autocapitalize="sentences"
            value={name}
            onIonInput={(e) => setName(String(e.detail.value ?? ''))}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            data-testid="folder-name-input"
          />
        )}
        {r?.kind === 'create' && <p className="folder-dialog-label" aria-hidden="true">{t('folders.colorLabel')}</p>}
        <FolderColorSwatches value={color} onChange={pick} />
        <div className="folder-dialog-buttons">
          <IonButton fill="clear" onClick={onDismiss} data-testid="folder-dialog-cancel">{t('common:actions.cancel')}</IonButton>
          {r?.kind === 'create' && (
            <IonButton onClick={create} disabled={!name.trim()} data-testid="folder-dialog-create">{t('folders.create')}</IonButton>
          )}
        </div>
      </div>
    </IonModal>
  );
}
