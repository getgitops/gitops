import {
  ExternalRecipientDomain,
  type ExternalRecipientRow,
} from '../../domain/external-recipient.domain';
import {
  defaultNotificationSettings,
  type NotificationSettings,
} from '../../domain/notification-settings.domain';
import type {
  ExternalRecipientChanges,
  ExternalRecipientRepositoryPort,
} from './external-recipient.repository';
import type { NotificationSettingsRepositoryPort } from './notification-settings.repository';

/** In-memory fakes for unit tests; they store copies so callers can't mutate the stored rows. */
export class InMemoryNotificationSettingsRepository implements NotificationSettingsRepositoryPort {
  settings = new Map<string, NotificationSettings>();

  async get(organizationId: string) {
    const stored = this.settings.get(organizationId);
    return stored ? structuredClone(stored) : defaultNotificationSettings(organizationId);
  }

  async setAllowedDomains(organizationId: string, domains: string[]) {
    const settings = {
      organizationId,
      allowedExternalEmailDomains: [...domains],
      updatedAt: new Date().toISOString(),
    };
    this.settings.set(organizationId, settings);
    return structuredClone(settings);
  }
}

export class InMemoryExternalRecipientRepository implements ExternalRecipientRepositoryPort {
  rows: ExternalRecipientRow[] = [];

  private copy(row: ExternalRecipientRow | undefined) {
    return row ? new ExternalRecipientDomain(structuredClone(row)) : null;
  }

  async findById(id: string) {
    return this.copy(this.rows.find((row) => row.id === id));
  }

  async findByEmail(organizationId: string, email: string) {
    return this.copy(
      this.rows.find((row) => row.organizationId === organizationId && row.email === email),
    );
  }

  async findByVerificationTokenHash(hash: string) {
    return this.copy(this.rows.find((row) => row.verificationTokenHash === hash));
  }

  async listByOrganization(organizationId: string) {
    return this.rows
      .filter((row) => row.organizationId === organizationId)
      .map((row) => this.copy(row)!);
  }

  async create(row: ExternalRecipientRow) {
    this.rows.push(structuredClone(row));
  }

  async update(id: string, changes: ExternalRecipientChanges) {
    this.rows = this.rows.map((row) =>
      row.id === id
        ? { ...row, ...structuredClone(changes), updatedAt: new Date().toISOString() }
        : row,
    );
  }
}
