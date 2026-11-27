import type { ExternalRecipientView } from '#modules/notifications/domain/external-recipient.domain';

/** Alert settings of an organization (allowed domains and external recipients), as the page and
 * the alert list's modal show them. */
export type NotificationSettingsPage = {
  allowedDomains: string[];
  /** `null` when the caller can't read them (`organization:notifications:read`). */
  recipients: ExternalRecipientView[] | null;
  canEditDomains: boolean;
  canManageRecipients: boolean;
  mailConfigured: boolean;
  originConfigured: boolean;
};

/** What the public verify / unsubscribe pages show. The token itself is never echoed. */
export type NotificationLinkState =
  | { state: 'ready' | 'done'; email: string; organization: string }
  | { state: 'invalid' | 'expired' };

export type ChannelView = {
  id: string;
  type: string;
  name: string;
  locale: string;
  scope: 'organization' | 'project';
  organizationId: string;
  projectId: string | null;
  enabled: boolean;
  destinationMasked: string;
  available: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  lastDeliveryAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  /** `failures` when the platform disabled it. */
  disabledReason: string | null;
  /** Signs its deliveries (webhook): has a rotatable secret. */
  signed: boolean;
  /** End of a rotation's grace period, while the previous secret still signs. */
  rotationEndsAt: string | null;
};

export type ChannelsSectionData = {
  scope: 'organization' | 'project';
  channels: ChannelView[];
  inherited: ChannelView[];
  availableTypes: string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** "Add to Slack" is available (Slack app configured and the caller can create channels). */
  slackConnect: boolean;
  /** Where a GitOps admin sets up "Add to Slack" while it is not configured; `null` otherwise. */
  slackSetupPath: string | null;
  /**
   * Apps installed in the organization (the GitOps Slack app and, later, other providers): one card
   * each. `null` on project pages: apps belong to organizations.
   */
  apps: AppCardData[] | null;
};

/** Providers with an app card; the ones without an implementation show as coming soon. */
export const APP_PROVIDERS = ['slack', 'google-chat'] as const;
export type AppProvider = (typeof APP_PROVIDERS)[number];

export type AppCardData = {
  provider: AppProvider;
  /** Not built yet: the card only says "coming soon". */
  comingSoon: boolean;
  /** The installation has the app configured (credentials set by a GitOps admin). */
  configured: boolean;
  canInstall: boolean;
  canRemove: boolean;
  /** Where it is installed (Slack workspaces); empty = not installed. */
  installations: { id: string; name: string }[];
  /** Shown to GitOps admins while the app is not configured. */
  setupPath: string | null;
};

export type ChannelsFormResult = {
  channelForm?: string;
  channelDraft?: { type: string; name: string; locale?: string };
  channelError?: string;
  channelErrors?: Record<string, string>;
  channelSaved?: string;
  channelDeleted?: string;
  channelTest?: { channelId: string; sent: boolean; error: string | null };
  /** Signing secret just created or rotated: shown once, never readable again. */
  channelSecret?: { channelId: string; secret: string; rotated?: boolean };
} | null;
