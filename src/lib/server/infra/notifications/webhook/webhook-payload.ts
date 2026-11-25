import type { ChannelMessage } from '../chat-notification';

/** Event type of the "Send test message" delivery (no real event behind it). */
export const WEBHOOK_TEST_EVENT = 'channel.test';
export const WEBHOOK_PAYLOAD_VERSION = 1;

/**
 * Body of a generic webhook delivery. Versioned: fields may be added within a version, never
 * removed or renamed. Values are the catalog's raw ones (no labels, templates nor HTML), and
 * fields marked `sensitive` are never included.
 */
export type WebhookPayload = {
  version: typeof WEBHOOK_PAYLOAD_VERSION;
  deliveryId: string;
  /** `true` for "Send test message" and alert test sends. */
  test: boolean;
  alert: { id: string; name: string } | null;
  event: {
    id: string | null;
    type: string;
    occurredAt: string;
    scope: Record<string, unknown>;
    fields: Record<string, unknown>;
  };
  /** Absolute link to the resource in GitOps, `null` without `ORIGIN`. */
  link: string | null;
};

export function buildWebhookPayload(
  message: ChannelMessage,
  deliveryId: string,
  now: () => Date = () => new Date(),
): WebhookPayload {
  const event = message.event;
  return {
    version: WEBHOOK_PAYLOAD_VERSION,
    deliveryId,
    test: message.test,
    alert: message.alert ? { id: message.alert.id, name: message.alert.name } : null,
    event: event
      ? {
          id: event.id,
          type: event.type,
          occurredAt: event.occurredAt,
          scope: { ...event.scope },
          fields: { ...event.fields },
        }
      : {
          id: null,
          type: WEBHOOK_TEST_EVENT,
          occurredAt: now().toISOString(),
          scope: {},
          fields: {},
        },
    link: message.link?.url ?? null,
  };
}
