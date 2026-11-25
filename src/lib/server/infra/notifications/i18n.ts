import * as messages from '#lib/paraglide/messages.js';

// `#lib/i18n` is client-oriented (stores, `$app/env`): server messages translate with paraglide
export type MailLocale = 'es' | 'en';
/** Language of a message when the recipient's is unknown. */
export const DEFAULT_MAIL_LOCALE: MailLocale = 'en';

type MessageFunction = (
  values?: Record<string, unknown>,
  options?: { locale?: MailLocale },
) => string;

export type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Server-side translation of an i18n key; unknown keys fall back to the key itself. */
export function translateKey(
  id: string,
  values: Record<string, unknown> = {},
  locale: MailLocale = DEFAULT_MAIL_LOCALE,
): string {
  const message = (messages as Record<string, unknown>)[id] as MessageFunction | undefined;
  return message ? message(values, { locale }) : id;
}

export function mailLocale(value: string | null | undefined): MailLocale {
  return value === 'es' || value === 'en' ? value : DEFAULT_MAIL_LOCALE;
}

/** `translateKey` bound to one locale. */
export function translator(locale: MailLocale): Translate {
  return (key, values) => translateKey(key, values, locale);
}
