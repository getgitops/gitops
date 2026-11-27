import { StateBackendDomain, type StateBackendRow } from '../../domain/state-backend.domain';
import { StateBindingDomain, type StateBindingRow } from '../../domain/state-binding.domain';
import type { StateBackendChanges, StateBackendRepositoryPort } from './state-backend.repository';
import type { StateBindingChanges, StateBindingRepositoryPort } from './state-binding.repository';

/** In-memory fakes for unit tests; they store copies so callers can't mutate the stored rows. */
export class InMemoryStateBackendRepository implements StateBackendRepositoryPort {
  rows: StateBackendRow[] = [];

  async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);
    return row ? new StateBackendDomain(structuredClone(row)) : null;
  }

  async listByOrganization(organizationId: string) {
    return this.rows
      .filter((row) => row.organizationId === organizationId)
      .map((row) => new StateBackendDomain(structuredClone(row)));
  }

  async create(row: StateBackendRow) {
    this.rows.push(structuredClone(row));
  }

  async update(id: string, changes: StateBackendChanges) {
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

export class InMemoryStateBindingRepository implements StateBindingRepositoryPort {
  rows: StateBindingRow[] = [];

  private copies(filter: (row: StateBindingRow) => boolean) {
    return this.rows.filter(filter).map((row) => new StateBindingDomain(structuredClone(row)));
  }

  async findById(id: string) {
    return this.copies((row) => row.id === id)[0] ?? null;
  }

  async listByBackend(backendId: string) {
    return this.copies((row) => row.backendId === backendId);
  }

  async listByOrganization(organizationId: string) {
    return this.copies((row) => row.organizationId === organizationId);
  }

  async listByProject(projectId: string) {
    return this.copies((row) => row.projectId === projectId);
  }

  async create(row: StateBindingRow) {
    this.rows.push(structuredClone(row));
  }

  async update(id: string, changes: StateBindingChanges) {
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
