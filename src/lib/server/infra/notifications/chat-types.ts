/** Channel types that post a message to a destination URL (`notification_channels.type`). */
export const CHAT_CHANNEL_TYPES = ['webhook', 'slack', 'google-chat'] as const;
export type ChatChannelType = (typeof CHAT_CHANNEL_TYPES)[number];

export function isChatChannelType(value: unknown): value is ChatChannelType {
  return (CHAT_CHANNEL_TYPES as readonly unknown[]).includes(value);
}
