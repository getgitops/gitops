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

/**
 * A type in the "new channel" picker: `available` can be created now, `coming_soon` is not built
 * yet. Types that are built but switched off (Slack without its app configured) are left out.
 */
export type ChannelTypeOption = { type: string; status: 'available' | 'coming_soon' };

/** The notification settings of an organization: its integrations and its channels. */
export type ChannelsSectionData = {
  channels: ChannelView[];
  /** Types that can be created now. */
  availableTypes: string[];
  /** What the "new channel" picker offers, in display order. */
  channelTypes: ChannelTypeOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** "Add to Slack" is available (Slack app configured and the caller can create channels). */
  slackConnect: boolean;
  /** Integrations with chat providers (the GitOps Slack app and, later, others): one card each. */
  apps: AppCardData[];
};

/** Providers with an integration card; the ones without an implementation show as coming soon. */
export const APP_PROVIDERS = ['slack', 'google-chat'] as const;
export type AppProvider = (typeof APP_PROVIDERS)[number];

/**
 * - `installed`: connected to at least one workspace;
 * - `available`: configured, not connected yet;
 * - `disabled`: the installation lacks its configuration (`SLACK_*` variables);
 * - `coming_soon`: not built yet.
 */
export type AppStatus = 'installed' | 'available' | 'disabled' | 'coming_soon';

export type AppCardData = {
  provider: AppProvider;
  status: AppStatus;
  canInstall: boolean;
  canRemove: boolean;
  /** Where it is installed (Slack workspaces); still listed, and removable, while disabled. */
  installations: { id: string; name: string }[];
  /** Shown to GitOps admins while the integration is disabled; `null` for everyone else. */
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
