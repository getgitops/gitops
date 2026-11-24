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
import {
  NotificationChannelDomain,
  type NotificationChannelRow,
} from '../../domain/notification-channel.domain';
import type {
  NotificationChannelChanges,
  NotificationChannelRepositoryPort,
} from './notification-channel.repository';

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

export class InMemoryNotificationChannelRepository implements NotificationChannelRepositoryPort {
  rows: NotificationChannelRow[] = [];
  /** Every write, to assert what reached "GitDB". */
  writes: Array<{ id: string; changes: Record<string, unknown> }> = [];

  async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? new NotificationChannelDomain(structuredClone(row)) : null;
  }

  async listByOrganization(organizationId: string) {
    return this.rows
      .filter((row) => row.organizationId === organizationId)
      .map((row) => new NotificationChannelDomain(structuredClone(row)));
  }

  async create(row: NotificationChannelRow) {
    this.rows.push(structuredClone(row));
    this.writes.push({ id: row.id, changes: { ...row } });
  }

  async update(id: string, changes: NotificationChannelChanges) {
    this.writes.push({ id, changes: { ...changes } });
    this.rows = this.rows.map((row) =>
      row.id === id
        ? { ...row, ...structuredClone(changes), updatedAt: new Date().toISOString() }
        : row,
    );
  }

  async delete(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}
