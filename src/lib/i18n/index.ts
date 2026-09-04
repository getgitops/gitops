import { browser } from '$app/environment';
import { writable, type Readable } from 'svelte/store';
import * as messages from '$lib/paraglide/messages.js';
import { setLocale as paraglideSetLocale } from '$lib/paraglide/runtime.js';

const LOCALE_KEY = 'gitops-locale';
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'es';

type TranslationValues = Record<string, unknown>;
type TranslationOptions = { values?: TranslationValues };
type MessageFunction = (values?: TranslationValues) => string;

function translate(id: string, options: TranslationOptions = {}): string {
  const message = (messages as Record<string, unknown>)[id] as MessageFunction | undefined;

  if (!message) {
    console.warn(`[i18n] Missing translation: ${id}`);
    return id;
  }

  return message(options.values);
}

export const locale = writable<SupportedLocale>(DEFAULT_LOCALE) as Readable<SupportedLocale> & {
  set: (value: SupportedLocale) => void;
};
export const _ = writable<typeof translate>(translate);

export function setupI18n() {
  const initialLocale = browser
    ? (localStorage.getItem(LOCALE_KEY) as SupportedLocale | null) ?? DEFAULT_LOCALE
    : DEFAULT_LOCALE;

  setLocale(initialLocale);
}

export function setLocale(lang: SupportedLocale) {
  paraglideSetLocale(lang, { reload: false });
  locale.set(lang);
  _.set(translate);
  if (browser) {
    localStorage.setItem(LOCALE_KEY, lang);
  }
}
