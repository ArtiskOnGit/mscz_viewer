import { useTranslation } from 'react-i18next';
import { resolveNoteNaming, type NoteNaming } from '../core/music/keys';
import { useSettings } from './settingsStore';

/** Note naming to display (setting, or "auto" resolved from the current interface language). */
export function useNoteNaming(): NoteNaming {
  const { i18n } = useTranslation();
  const setting = useSettings((s) => s.settings.noteNaming);
  return resolveNoteNaming(setting, i18n.language);
}
