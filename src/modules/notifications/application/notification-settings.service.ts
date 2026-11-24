import { normalizeDomainPattern } from '../domain/email-address';
import { NotificationSettingsValidationError } from '../domain/external-recipient.domain';
import {
  MAX_ALLOWED_DOMAINS,
  type NotificationSettings,
} from '../domain/notification-settings.domain';
import type { NotificationSettingsRepositoryPort } from '../infrastructure/repositories/notification-settings.repository';
import type { ExternalRecipientService } from './external-recipient.service';

export type AllowedDomainsUpdate = {
  settings: NotificationSettings;
  /** External recipients blocked because their domain was removed. */
  blocked: number;
  /** Blocked recipients restored because their domain is allowed again. */
  restored: number;
};

/** A list, or text with one domain per line / separated by commas (the settings form). */
function splitDomains(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    return input
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return input === undefined || input === null ? [] : null;
}

/** Organization-wide notification settings (`/org/<org>/settings/notifications`). */
export class NotificationSettingsService {
  constructor(
    private readonly repository: NotificationSettingsRepositoryPort,
    private readonly recipients: Pick<ExternalRecipientService, 'applyDomainPolicy'>,
  ) {}

  get(organizationId: string): Promise<NotificationSettings> {
    return this.repository.get(organizationId);
  }

  /**
   * Replaces the allowed external email domains (normalized, exact match, `*.` for subdomains)
   * and blocks or restores the organization's external recipients accordingly.
   */
  async setAllowedDomains(organizationId: string, input: unknown): Promise<AllowedDomainsUpdate> {
    const items = splitDomains(input);
    const errors: Record<string, string> = {};
    const domains: string[] = [];
    if (!items) {
      errors.allowedExternalEmailDomains = 'invalid';
    } else {
      items.forEach((item, index) => {
        const domain = normalizeDomainPattern(item);
        if (!domain) errors[`allowedExternalEmailDomains.${index}`] = 'invalid_domain';
        else if (!domains.includes(domain)) domains.push(domain);
      });
      if (domains.length > MAX_ALLOWED_DOMAINS) errors.allowedExternalEmailDomains = 'too_many';
    }
    if (Object.keys(errors).length > 0) throw new NotificationSettingsValidationError(errors);

    const settings = await this.repository.setAllowedDomains(organizationId, domains);
    const { blocked, restored } = await this.recipients.applyDomainPolicy(organizationId, domains);
    return { settings, blocked, restored };
  }
}
