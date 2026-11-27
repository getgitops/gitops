import crypto from 'node:crypto';

/** Requests older than this are refused, so a captured request can't be replayed later. */
export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

/**
 * Checks a request from Slack (slash command, interaction): `X-Slack-Signature` is
 * `v0=` + HMAC-SHA256(signing secret, `v0:<X-Slack-Request-Timestamp>:<raw body>`).
 * `body` must be the raw body exactly as received, before any parsing.
 */
export function verifySlackSignature(input: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): boolean {
  const { timestamp, signature } = input;
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > SLACK_SIGNATURE_MAX_AGE_SECONDS) return false;

  const expected = Buffer.from(
    `v0=${crypto
      .createHmac('sha256', input.signingSecret)
      .update(`v0:${timestamp}:${input.body}`)
      .digest('hex')}`,
  );
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** Signs like Slack does: for tests and local tooling. */
export function signSlackRequest(signingSecret: string, timestamp: string, body: string): string {
  return `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`;
}
