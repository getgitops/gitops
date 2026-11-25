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
