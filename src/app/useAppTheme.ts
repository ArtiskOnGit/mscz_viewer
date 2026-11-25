import { useEffect } from 'react';
import type { AppTheme } from '../core/settings';

/** Ionic dark palette (class mode): follow the system or force light/dark. */
export function useAppTheme(theme: AppTheme): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('ion-palette-dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
