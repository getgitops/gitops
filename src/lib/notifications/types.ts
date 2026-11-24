/** What the public verify / unsubscribe pages show. The token itself is never echoed. */
export type NotificationLinkState =
  | { state: 'ready' | 'done'; email: string; organization: string }
  | { state: 'invalid' | 'expired' };

/** A notification channel as the pages show it: the destination only masked. */
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
  /** Organization channels the project's alerts can also use (project pages only). */
  inherited: ChannelView[];
  /** Types that can be created now. */
  availableTypes: string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
};

/** What the channel form actions return. */
export type ChannelsFormResult = {
  channelForm?: string;
  channelDraft?: { type: string; name: string };
  channelError?: string;
  channelErrors?: Record<string, string>;
  channelSaved?: string;
  channelDeleted?: string;
  channelTest?: { channelId: string; sent: boolean; error: string | null };
} | null;
