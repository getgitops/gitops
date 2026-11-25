import * as env from '$app/env/private';

/**
 * Development-only relaxations of the generic webhook's anti-SSRF rules. Both default to `false`
 * and must stay so in production: a free URL is otherwise a way into the internal network.
 */
export type WebhookChannelConfig = {
  /** `NOTIFICATIONS_WEBHOOK_ALLOW_HTTP`: accept `http:` URLs. */
  allowHttp: boolean;
  /** `NOTIFICATIONS_WEBHOOK_ALLOW_PRIVATE_TARGETS`: let URLs reach private addresses. */
  allowPrivateTargets: boolean;
};

function flag(value: string | undefined): boolean {
  const raw = value
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function readWebhookChannelConfig(): WebhookChannelConfig {
  return {
    allowHttp: flag(env.NOTIFICATIONS_WEBHOOK_ALLOW_HTTP),
    allowPrivateTargets: flag(env.NOTIFICATIONS_WEBHOOK_ALLOW_PRIVATE_TARGETS),
  };
}
