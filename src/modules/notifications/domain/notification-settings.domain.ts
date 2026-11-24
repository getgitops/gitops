/** Upper bound of the allowed-domain list; it is curated by hand. */
export const MAX_ALLOWED_DOMAINS = 50;

export type NotificationSettings = {
  organizationId: string;
  /** `empresa.com` or `*.empresa.com`, normalized; empty = no external recipients. */
  allowedExternalEmailDomains: string[];
  updatedAt: string | null;
};

export function defaultNotificationSettings(organizationId: string): NotificationSettings {
  return { organizationId, allowedExternalEmailDomains: [], updatedAt: null };
}
