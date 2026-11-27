import type { Logger } from 'pino';
import { publishAfterWrite, type EventPublisher } from '#lib/server/events/publish';
import { StateIacValidationError, type StateBackendDomain } from '../domain/state-backend.domain';
import {
  MAX_PULUMI_NAME_LENGTH,
  StateBindingDomain,
  type StateBindingRow,
} from '../domain/state-binding.domain';
import type { FieldErrors } from '../domain/state-backend.validation';
import type { StateBindingRepositoryPort } from '../infrastructure/repositories/state-binding.repository';

/** Finds a GitOps project and its organization. */
export type ProjectLookup = {
  getProject(id: string): Promise<{ id: string; organizationId: string | null } | null>;
};

export type BindingInput = { projectId?: unknown; stacks?: unknown };

export type StateBindingServiceOptions = {
  now?: () => Date;
  generateId?: () => string;
  events?: EventPublisher;
  logger?: Pick<Logger, 'error'>;
};

// Pulumi project and stack names: letters, digits, `-`, `_` and `.`
const PULUMI_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_STACKS = 200;

const silentLogger = { error: () => {} } as unknown as Pick<Logger, 'error'>;

/**
 * Assignments of the Pulumi projects of a backend to GitOps projects. A Pulumi project has at
 * most one assignment (`set` replaces it), always to a project of the backend's organization.
 */
export class StateBindingService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly log: Pick<Logger, 'error'>;

  constructor(
    private readonly repository: StateBindingRepositoryPort,
    private readonly projects: ProjectLookup,
    private readonly options: StateBindingServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
    this.log = options.logger ?? silentLogger;
  }

  listByBackend(backendId: string): Promise<StateBindingDomain[]> {
    return this.repository.listByBackend(backendId);
  }

  listByProject(projectId: string): Promise<StateBindingDomain[]> {
    return this.repository.listByProject(projectId);
  }

  /** Assigns (or reassigns) `pulumiProject` of `backend`; `stacks` empty = all of them. */
  async set(
    backend: StateBackendDomain,
    pulumiProject: unknown,
    input: BindingInput,
  ): Promise<StateBindingDomain> {
    const errors: FieldErrors = {};
    const name = this.validatePulumiName(pulumiProject, 'pulumiProject', errors);
    const stacks = this.validateStacks(input.stacks, errors);
    const projectId = typeof input.projectId === 'string' ? input.projectId.trim() : '';
    if (!projectId) errors.projectId = 'required';
    else {
      const project = await this.projects.getProject(projectId).catch(() => null);
      if (!project) errors.projectId = 'project_not_found';
      // another organization's project is not even revealed to exist
      else if (project.organizationId !== backend.organizationId) {
        errors.projectId = 'project_not_found';
      }
    }
    if (Object.keys(errors).length > 0) throw new StateIacValidationError(errors);

    const existing = (await this.repository.listByBackend(backend.id)).find(
      (binding) => binding.pulumiProject === name,
    );
    if (existing) {
      if (existing.projectId === projectId && sameStacks(existing.stacks, stacks)) return existing;
      await this.repository.update(existing.id, { projectId, stacks });
      const updated = new StateBindingDomain({ ...existing.toJson(), projectId, stacks });
      await this.publish(backend, updated.pulumiProject, projectId, existing.projectId, stacks);
      return updated;
    }

    const timestamp = this.now().toISOString();
    const row: StateBindingRow = {
      id: this.generateId(),
      organizationId: backend.organizationId,
      backendId: backend.id,
      pulumiProject: name,
      stacks,
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.repository.create(row);
    await this.publish(backend, name, projectId, null, stacks);
    return new StateBindingDomain(row);
  }

  /** Leaves `pulumiProject` unassigned (only the organization sees it). `false` if it wasn't. */
  async remove(backend: StateBackendDomain, pulumiProject: string): Promise<boolean> {
    const existing = (await this.repository.listByBackend(backend.id)).find(
      (binding) => binding.pulumiProject === pulumiProject,
    );
    if (!existing) return false;
    await this.repository.delete(existing.id);
    await this.publish(backend, pulumiProject, null, existing.projectId, []);
    return true;
  }

  /** A deleted GitOps project takes its assignments with it. */
  async removeForProject(projectId: string): Promise<number> {
    const bindings = await this.repository.listByProject(projectId);
    for (const binding of bindings) await this.repository.delete(binding.id);
    return bindings.length;
  }

  private validatePulumiName(value: unknown, field: string, errors: FieldErrors): string {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) errors[field] = 'required';
    else if (name.length > MAX_PULUMI_NAME_LENGTH || !PULUMI_NAME.test(name)) {
      errors[field] = 'invalid_pulumi_name';
    }
    return name;
  }

  private validateStacks(value: unknown, errors: FieldErrors): string[] {
    if (value === undefined || value === null || value === '') return [];
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
    if (!list) {
      errors.stacks = 'invalid_stacks';
      return [];
    }
    const stacks = [
      ...new Set(
        list.map((stack) => (typeof stack === 'string' ? stack.trim() : '')).filter(Boolean),
      ),
    ].sort();
    if (stacks.length > MAX_STACKS || stacks.some((stack) => !PULUMI_NAME.test(stack))) {
      errors.stacks = 'invalid_stacks';
    }
    return stacks;
  }

  private async publish(
    backend: StateBackendDomain,
    pulumiProject: string,
    projectId: string | null,
    previousProjectId: string | null,
    stacks: string[],
  ) {
    await publishAfterWrite(
      this.options.events,
      this.log,
      'state_iac.binding.updated',
      {
        backendId: backend.id,
        backendName: backend.name,
        pulumiProject,
        projectId,
        previousProjectId,
        stacks,
      },
      { organizationId: backend.organizationId, projectId: null },
    );
  }
}

function sameStacks(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((stack, i) => stack === [...b].sort()[i]);
}
