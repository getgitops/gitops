import type { WebhookUrlRule } from '../../http/webhook-request';
import type { FetchLike } from '../../http/guarded-fetch';
import { createFixedHostChatTransport } from '../chat-webhook.transport';
import type { ChatTransport } from '../chat-notification';
import { buildSlackPayload } from './slack-blocks';

export const SLACK_WEBHOOK_RULE: WebhookUrlRule = {
  hosts: ['hooks.slack.com'],
  pathPrefix: '/services/',
};

export function createSlackTransport(options: { fetch?: FetchLike } = {}): ChatTransport {
  return createFixedHostChatTransport({
    rule: SLACK_WEBHOOK_RULE,
    format: buildSlackPayload,
    fetch: options.fetch,
  });
}
