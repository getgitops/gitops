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
};

export type ChannelsSectionData = {
  scope: 'organization' | 'project';
  channels: ChannelView[];
  inherited: ChannelView[];
  availableTypes: string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

export type ChannelsFormResult = {
  channelForm?: string;
  channelDraft?: { type: string; name: string };
  channelError?: string;
  channelErrors?: Record<string, string>;
  channelSaved?: string;
  channelDeleted?: string;
  channelTest?: { channelId: string; sent: boolean; error: string | null };
} | null;
