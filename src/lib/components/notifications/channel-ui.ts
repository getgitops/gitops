import { Hash, MessageSquare, Webhook } from '@lucide/svelte';
import type { AppProvider } from '#lib/notifications/types';

/** Icon of each channel type and integration provider. */
export const typeIcons: Record<string, typeof Hash> = {
  slack: Hash,
  'google-chat': MessageSquare,
  webhook: Webhook,
};

export function typeIcon(type: string): typeof Hash {
  return typeIcons[type] ?? Webhook;
}

/** Description of each type in the "new channel" picker (i18n keys). */
export const typeDescriptions: Record<string, string> = {
  webhook: 'alerts.wizard.webhookDescription',
  slack: 'alerts.wizard.slackDescription',
  'google-chat': 'alerts.wizard.googleChatDescription',
};

/** Form actions of each integration (`channels-page.ts`); `null` while the provider has none. */
export const APP_INSTALL_ACTIONS: Record<AppProvider, string | null> = {
  slack: 'installSlack',
  'google-chat': null,
};
export const APP_REMOVE_ACTIONS: Record<AppProvider, string | null> = {
  slack: 'removeSlackWorkspace',
  'google-chat': null,
};

/** `notifications.errors.<code>`, or the generic failure when the code has no translation. */
export function errorMessage(translate: (key: string) => string, code: string | undefined) {
  const key = `notifications.errors.${code ?? ''}`;
  const text = code ? translate(key) : key;
  return text === key ? translate('alerts.wizard.failed') : text;
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

/**
 * `?slack=<outcome>` after a Slack OAuth flow (`/notifications/slack/callback`): which settings
 * tab it belongs to. Installing the app is an integration; everything else creates a channel.
 */
export function slackOutcomeTab(outcome: string): 'integrations' | 'channels' {
  return outcome === 'installed' || outcome === 'slack_workspace_taken'
    ? 'integrations'
    : 'channels';
}
