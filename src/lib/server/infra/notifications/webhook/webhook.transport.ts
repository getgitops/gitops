import {
  postRawJson,
  validateOpenWebhookUrl,
  type OpenWebhookUrlOptions,
} from '../../http/webhook-request';
import { createGuardedFetch, type FetchLike } from '../../http/guarded-fetch';
import type { ChatNotification, ChatTransport } from '../chat-notification';
import { buildWebhookPayload } from './webhook-payload';
import { SIGNATURE_HEADER, signatureHeader } from './webhook-signature';

export const WEBHOOK_USER_AGENT = 'GitOps-Webhooks/1';
export const EVENT_HEADER = 'X-GitOps-Event';
export const DELIVERY_HEADER = 'X-GitOps-Delivery';

export type WebhookTransportOptions = OpenWebhookUrlOptions & {
  /** Defaults to `createGuardedFetch` with the same address rules. */
  fetch?: FetchLike;
  now?: () => Date;
};

/** A signed transport was asked to send without a secret (a channel created before #96). */
export class MissingSigningSecretError extends Error {
  constructor() {
    super('Webhook channel has no signing secret');
    this.name = 'MissingSigningSecret';
  }
}

/**
 * Generic webhook: a signed JSON `POST` to any public `https` URL.
 *
 * - Body: `WebhookPayload` (versioned, catalog values only).
 * - Headers: `X-GitOps-Event`, `X-GitOps-Delivery` (same on retries), `X-GitOps-Signature`
 *   (`t=<unix>,v1=<hex>`, one `v1` per active secret) and `User-Agent: GitOps-Webhooks/1`.
 * - Anti-SSRF: the URL is resolved and checked when saved and before every send, and the request
 *   connects only to checked addresses (`createGuardedFetch`). No redirects.
 */
export function createWebhookTransport(options: WebhookTransportOptions = {}): ChatTransport {
  const now = options.now ?? (() => new Date());
  const fetch =
    options.fetch ??
    createGuardedFetch({
      allowHttp: options.allowHttp,
      allowPrivateTargets: options.allowPrivateTargets,
      resolve: options.resolve,
    });

  return {
    signed: true,
    validateDestination: (raw) => validateOpenWebhookUrl(raw, options),
    async send(notification: ChatNotification) {
      if (notification.signingSecrets.length === 0) throw new MissingSigningSecretError();
      const payload = buildWebhookPayload(notification.message, notification.deliveryId, now);
      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(now().getTime() / 1000);
      await postRawJson(notification.destination, rawBody, {
        fetch,
        headers: {
          'User-Agent': WEBHOOK_USER_AGENT,
          [EVENT_HEADER]: payload.event.type,
          [DELIVERY_HEADER]: notification.deliveryId,
          [SIGNATURE_HEADER]: signatureHeader(notification.signingSecrets, timestamp, rawBody),
        },
      });
    },
  };
}
