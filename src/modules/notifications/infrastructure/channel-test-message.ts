import type { ChannelMessage } from '#lib/server/infra/notifications';
import { DEFAULT_MAIL_LOCALE, translator } from '#lib/server/infra/notifications/i18n';

/**
 * The message of "Send test message": says it is a test and where it was sent from, nothing about
 * any real event. In the default language: a channel is shared by people with different ones.
 */
export function buildChannelTestMessage(input: {
  channelName: string;
  where: string;
  /** Absolute link to the channel settings, when `ORIGIN` is known. */
  link: string | null;
}): ChannelMessage {
  const t = translator(DEFAULT_MAIL_LOCALE);
  const summary = t('notifications.channels.testMessage.summary', { where: input.where });
  return {
    title: t('notifications.channels.testMessage.title', { channel: input.channelName }),
    summary,
    eventLabel: t('notifications.channels.testMessage.event'),
    fields: [{ label: t('notifications.channels.testMessage.channel'), value: input.channelName }],
    link: input.link
      ? { url: input.link, label: t('notifications.channels.testMessage.open') }
      : null,
    suppressed: 0,
    text: `${t('notifications.channels.testMessage.title', { channel: input.channelName })}: ${summary}`,
    test: true,
  };
}
