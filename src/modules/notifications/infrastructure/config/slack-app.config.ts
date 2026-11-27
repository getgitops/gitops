import * as env from '$app/env/private';

/**
 * Credentials of the GitOps Slack app: `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` for "Add to
 * Slack", and `SLACK_SIGNING_SECRET` for the `/gitops` command (`null` while it is not set).
 */
export type SlackAppConfig = {
  clientId: string;
  clientSecret: string;
  signingSecret: string | null;
};

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
 * not configured (no Slack channel can be created then); throws when only one of the two values is
 * set.
 */
export function readSlackAppConfig(): SlackAppConfig | null {
  const clientId = value(env.SLACK_CLIENT_ID);
  const clientSecret = value(env.SLACK_CLIENT_SECRET);
  if (!clientId && !clientSecret) return null;
  if (!clientId || !clientSecret) {
    throw new SlackAppConfigError('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set together');
  }
  return { clientId, clientSecret, signingSecret: value(env.SLACK_SIGNING_SECRET) };
}
