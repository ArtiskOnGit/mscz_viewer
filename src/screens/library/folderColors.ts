// Folder icon colours (ADR-029): stored by name, one shade per app theme. Each shade keeps a contrast of at least 3:1
// (WCAG 1.4.11, graphical objects) against the list and modal backgrounds of its theme: white in light, #121212 to
// #2a2a2a in dark. "default" is the app primary colour (the look of folders without a colour).
import type { CSSProperties } from 'react';
import type { FolderColor } from '../../core/model/types';
import { FOLDER_COLORS } from '../../core/model/folders';

export type FolderColorChoice = FolderColor | 'default';

export const FOLDER_PALETTE: Record<FolderColorChoice, { light: string; dark: string }> = {
  default: { light: 'var(--ion-color-primary)', dark: 'var(--ion-color-primary)' }, // #3b5bdb / #91a7ff
  blue: { light: '#1971c2', dark: '#74c0fc' },
  green: { light: '#2b8a3e', dark: '#69db7c' },
  yellow: { light: '#b08800', dark: '#ffd43b' },
  orange: { light: '#d9480f', dark: '#ffa94d' },
  red: { light: '#c92a2a', dark: '#ff8787' },
  pink: { light: '#c2255c', dark: '#f783ac' },
  purple: { light: '#7048e8', dark: '#b197fc' },
  brown: { light: '#8d5524', dark: '#d2a679' },
  grey: { light: '#495057', dark: '#adb5bd' },
};

/** The choices of the colour picker, the default colour first. */
export const FOLDER_COLOR_CHOICES: readonly FolderColorChoice[] = ['default', ...FOLDER_COLORS];

/** CSS variables read by `.folder-icon` / `.folder-swatch` (library.css), which picks the shade of the app theme. */
export function folderColorStyle(color: FolderColor | undefined): CSSProperties {
  const { light, dark } = FOLDER_PALETTE[color ?? 'default'];
  return { '--folder-light': light, '--folder-dark': dark } as CSSProperties;
}
