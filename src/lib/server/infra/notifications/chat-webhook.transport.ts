import { postJson, validateWebhookUrl, type WebhookUrlRule } from '../http/webhook-request';
import { createGuardedFetch, type FetchLike } from '../http/guarded-fetch';
import type { ChannelMessage, ChatNotification, ChatTransport } from './chat-notification';

export type FixedHostChatTransportOptions = {
  rule: WebhookUrlRule;
  format: (message: ChannelMessage) => unknown;
  fetch?: FetchLike;
};

export function createFixedHostChatTransport(
  options: FixedHostChatTransportOptions,
): ChatTransport {
  const fetch = options.fetch ?? createGuardedFetch();
  return {
    validateDestination: (raw) => validateWebhookUrl(raw, options.rule),
    async send(notification: ChatNotification) {
      await postJson(notification.destination, options.format(notification.message), { fetch });
    },
  };
}
