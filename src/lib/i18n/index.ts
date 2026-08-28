import { browser } from '$app/environment';
import { init, register, locale } from 'svelte-i18n';

const LOCALE_KEY = 'gitops-locale';
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'es';

register('es', () => import('./locales/es.json'));
register('en', () => import('./locales/en.json'));

export function setupI18n() {
  const initialLocale = browser
    ? (localStorage.getItem(LOCALE_KEY) as SupportedLocale | null) ?? DEFAULT_LOCALE
    : DEFAULT_LOCALE;

  init({
    fallbackLocale: DEFAULT_LOCALE,
    initialLocale,
  });
}

export function setLocale(lang: SupportedLocale) {
  locale.set(lang);
  if (browser) {
    localStorage.setItem(LOCALE_KEY, lang);
  }
}

export { locale };
