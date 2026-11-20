import { AlertDomain, type AlertFields, type AlertRow } from '../../domain/alert.domain';
import type { AlertRepositoryPort } from './alert.repository';

/** In-memory fake for unit tests; stores copies so callers can't mutate the stored rows. */
export class InMemoryAlertRepository implements AlertRepositoryPort {
  rows: AlertRow[] = [];
  failWrites = false;

  private copy(row: AlertRow): AlertDomain {
    return new AlertDomain(structuredClone(row));
  }

  async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? this.copy(row) : null;
  }

  async listByOrganization(organizationId: string) {
    return this.rows
      .filter((row) => row.organizationId === organizationId)
      .map((row) => this.copy(row));
  }

  async listByProject(projectId: string) {
    return this.rows.filter((row) => row.projectId === projectId).map((row) => this.copy(row));
  }

  async listEnabledByEventType(eventType: string) {
    return this.rows
      .filter((row) => row.eventType === eventType && row.enabled)
      .map((row) => this.copy(row));
  }

  async create(row: AlertRow) {
    if (this.failWrites) throw new Error('GitDB write failed');
    this.rows.push(structuredClone(row));
  }

  async update(id: string, changes: Partial<AlertFields>) {
    if (this.failWrites) throw new Error('GitDB write failed');
    this.rows = this.rows.map((row) =>
      row.id === id
        ? { ...row, ...structuredClone(changes), updatedAt: new Date().toISOString() }
        : row,
    );
  }

  async delete(id: string) {
    if (this.failWrites) throw new Error('GitDB write failed');
    this.rows = this.rows.filter((row) => row.id !== id);
  }
}
