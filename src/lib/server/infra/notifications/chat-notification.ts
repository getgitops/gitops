import { Notification } from './notification';
import type { NotificationTransport } from './transport';
import { registerTransport } from './notify';
import type { WebhookUrlError } from '../http/webhook-request';

import { CHAT_CHANNEL_TYPES, type ChatChannelType } from './chat-types';

export { CHAT_CHANNEL_TYPES, isChatChannelType, type ChatChannelType } from './chat-types';

/**
 * Provider-neutral content of a channel message; each transport turns it into its own format
 * (Block Kit, Cards v2, signed JSON). Texts are already translated and plain: transports escape
 * them for their format.
 */
export type ChannelMessage = {
  /** The alert's name, or the channel's for a test message. */
  title: string;
  /** One line: `3 critical, 5 high` or the event label. */
  summary: string;
  /** Translated event label (`Analysis completed`). */
  eventLabel: string;
  /** Catalog fields as label/value, sensitive ones left out. */
  fields: Array<{ label: string; value: string }>;
  /** Absolute link to the resource in GitOps (`ORIGIN`), when there is one. */
  link: { url: string; label: string } | null;
  /** Matching events skipped by the throttle since the previous message. */
  suppressed: number;
  /** Plain-text fallback (mobile notifications, clients without rich formatting). */
  text: string;
  /** A test from the UI, not a real event. */
  test: boolean;
  /** Raw event data for formats that carry it (generic webhooks); absent for test messages. */
  event?: { id: string; type: string; occurredAt: string; scope: Record<string, unknown> };
  alert?: { id: string; name: string };
};

export type ChatNotificationInput = {
  channel: ChatChannelType;
  /** Destination URL in clear: only ever held in memory, right before sending. */
  destination: string;
  message: ChannelMessage;
};

export class ChatNotification extends Notification {
  readonly channel: ChatChannelType;
  readonly destination: string;
  readonly message: ChannelMessage;

  constructor(input: ChatNotificationInput) {
    super();
    this.channel = input.channel;
    this.destination = input.destination;
    this.message = input.message;
  }

  validate(): void {
    if (!this.destination) throw new Error('ChatNotification requires a destination');
    if (!this.message.title.trim()) throw new Error('ChatNotification requires a title');
  }
}

/**
 * Transport of one chat channel type. `validateDestination` is the anti-SSRF check of the
 * provider's URL, run before saving a channel and again before every send.
 */
export interface ChatTransport extends NotificationTransport<ChatNotification> {
  validateDestination(raw: unknown): { ok: true; url: URL } | { ok: false; error: WebhookUrlError };
}

const CHAT_TRANSPORTS_KEY = Symbol.for('gitops.notifications.chat-transports');
type GlobalWithChatTransports = typeof globalThis & {
  [CHAT_TRANSPORTS_KEY]?: Map<ChatChannelType, ChatTransport>;
};

function registry(): Map<ChatChannelType, ChatTransport> {
  return ((globalThis as GlobalWithChatTransports)[CHAT_TRANSPORTS_KEY] ??= new Map());
}

/**
 * Activates a channel type: its channels can then be created and receive messages. Each
 * transport sub-task (#96 webhook, #97 Slack, #98 Google Chat) registers its own.
 */
export function registerChatTransport(type: ChatChannelType, transport: ChatTransport): void {
  registry().set(type, transport);
  registerTransport(type, transport as NotificationTransport<never>);
}

export function getChatTransport(type: ChatChannelType): ChatTransport | null {
  return registry().get(type) ?? null;
}

/** Channel types with a registered transport, in catalog order. */
export function availableChatTypes(): ChatChannelType[] {
  return CHAT_CHANNEL_TYPES.filter((type) => registry().has(type));
}

export function resetChatTransports(): void {
  registry().clear();
}
