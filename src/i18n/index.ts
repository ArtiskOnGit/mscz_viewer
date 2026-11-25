// ADR-009: English is the reference language; other locales are translations of locales/en.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import enLibrary from './locales/en/library.json';
import enViewer from './locales/en/viewer.json';
import enSettings from './locales/en/settings.json';
import enSetlists from './locales/en/setlists.json';
import frCommon from './locales/fr/common.json';
import frLibrary from './locales/fr/library.json';
import frViewer from './locales/fr/viewer.json';
import frSettings from './locales/fr/settings.json';
import frSetlists from './locales/fr/setlists.json';

export const defaultNS = 'common';
export const resources = {
  en: { common: enCommon, library: enLibrary, viewer: enViewer, settings: enSettings, setlists: enSetlists },
  // A language is only registered once it is COMPLETE (checked by i18n.test.ts), otherwise the UI would mix languages.
  fr: { common: frCommon, library: frLibrary, viewer: frViewer, settings: frSettings, setlists: frSetlists },
} as const;
export type SupportedLanguage = keyof typeof resources;
export const supportedLanguages = Object.keys(resources) as SupportedLanguage[];
/** Language setting: "system" follows the device language when it is supported, else English. */
export type LanguageSetting = 'system' | SupportedLanguage;

const deviceLanguages = (): readonly string[] =>
  typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];

/** First supported language among the device languages (navigator.languages), else English. */
export function detectLanguage(candidates: readonly string[] = deviceLanguages()): SupportedLanguage {
  for (const tag of candidates) {
    const base = tag?.toLowerCase().split('-')[0];
    if (base && (supportedLanguages as string[]).includes(base)) return base as SupportedLanguage;
  }
  return 'en';
}

export function resolveLanguage(setting: LanguageSetting, candidates?: readonly string[]): SupportedLanguage {
  return setting === 'system' ? detectLanguage(candidates) : setting;
}

const setHtmlLang = (lng: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
};

/** Switches the interface language at runtime, and the html lang attribute (screen readers, hyphenation). */
export async function applyLanguage(setting: LanguageSetting): Promise<void> {
  const lng = resolveLanguage(setting);
  setHtmlLang(lng);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
}

const initial = detectLanguage();
setHtmlLang(initial);
void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  defaultNS,
  ns: ['common', 'library', 'viewer', 'settings', 'setlists'],
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

export default i18n;
