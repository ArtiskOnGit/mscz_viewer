// ADR-009: English is the reference language; other locales are translations of locales/en.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enLibrary from './locales/en/library.json';
import enViewer from './locales/en/viewer.json';
import enSettings from './locales/en/settings.json';
import enSetlists from './locales/en/setlists.json';

export const defaultNS = 'common';
export const resources = {
  en: { common: enCommon, library: enLibrary, viewer: enViewer, settings: enSettings, setlists: enSetlists },
  // A language is only registered once it is COMPLETE (checked by i18n.test.ts), otherwise the UI would mix
  // languages. French is planned as the first translation (phase 3).
} as const;
export const supportedLanguages = Object.keys(resources) as (keyof typeof resources)[];

function detectLanguage(): string {
  const candidates = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const tag of candidates) {
    const base = tag.toLowerCase().split('-')[0];
    if (base && (supportedLanguages as string[]).includes(base)) return base;
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  defaultNS,
  ns: ['common', 'library', 'viewer', 'settings', 'setlists'],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export default i18n;
