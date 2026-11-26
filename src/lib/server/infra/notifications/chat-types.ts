/** Channel types that post a message to a destination URL (`notification_channels.type`). */
export const CHAT_CHANNEL_TYPES = ['webhook', 'slack', 'google-chat'] as const;
export type ChatChannelType = (typeof CHAT_CHANNEL_TYPES)[number];

export const CHANNEL_LOCALES = ['es', 'en'] as const;
export type ChannelLocale = (typeof CHANNEL_LOCALES)[number];
export const DEFAULT_CHANNEL_LOCALE: ChannelLocale = 'en';

export function isChannelLocale(value: unknown): value is ChannelLocale {
  return (CHANNEL_LOCALES as readonly unknown[]).includes(value);
}

export function isChatChannelType(value: unknown): value is ChatChannelType {
  return (CHAT_CHANNEL_TYPES as readonly unknown[]).includes(value);
}
