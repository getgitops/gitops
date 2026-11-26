import * as env from '$app/env/private';

/** Credentials of the Slack app behind "Add to Slack" (`SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`). */
export type SlackAppConfig = { clientId: string; clientSecret: string };

export class SlackAppConfigError extends Error {}

function value(raw: string | undefined): string | null {
  return (
    raw
      ?.trim()
      .replace(/^["']|["']$/g, '')
      .trim() || null
  );
}

/**
 * Read on every call so config reloads and tests see fresh values. `null` when "Add to Slack" is
 * not configured (channels are then created by pasting the webhook URL); throws when only one of
 * the two values is set.
 */
export function readSlackAppConfig(): SlackAppConfig | null {
  const clientId = value(env.SLACK_CLIENT_ID);
  const clientSecret = value(env.SLACK_CLIENT_SECRET);
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    throw new SlackAppConfigError('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set together');
  }
  return { clientId, clientSecret };
}
