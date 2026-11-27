import crypto from 'crypto';
import { ProjectRepository } from '../infrastructure/repositories/project.repostitory';
import {
  DEFAULT_PROJECT_MODULES,
  DEFAULT_PROJECT_SETTINGS,
  type ProjectModules,
  type ProjectSettings,
} from '../domain/project.domain';
import type { EventBus } from '#lib/server/events';
import type { DomainEventMap, ProjectChangedField } from '#lib/events/domain-events';
import { createLogger } from '#lib/server/logger';

const log = createLogger('projects');

export type ProjectStatusValue = 'active' | 'inactive';

export interface OrganizationLookup {
  getOrganization(id: string): Promise<unknown>;
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly organizationLookup: OrganizationLookup,
    private readonly events?: Pick<EventBus, 'publish'>,
  ) {}

  async listProjects() {
    const projects = await this.repository.findAll();
    return projects.map((project) => project.toJson());
  }

  async listProjectsByOrganization(organizationId: string) {
    const projects = await this.repository.findByOrganizationId(organizationId);
    return projects.map((project) => project.toJson());
  }

  async getProject(id: string) {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }
    return project.toJson();
  }

  async getProjectBySlug(slug: string) {
    const project = await this.repository.findBySlug(slug);
    if (!project) {
      throw new Error('Project not found');
    }
    return project.toJson();
  }

  // non-throwing variant, for callers that should degrade gracefully (e.g. hooks.server.ts)
  async tryFindBySlug(slug: string) {
    const project = await this.repository.findBySlug(slug);
    return project ? project.toJson() : null;
  }

  async createProject(input: {
    organizationId: string;
    name: string;
    slug?: string;
    description?: string;
    status?: string;
    modules?: Partial<ProjectModules>;
  }) {
    const organizationId = input.organizationId?.trim();
    if (!organizationId) {
      throw new Error('Organization is required');
    }
    await this.organizationLookup.getOrganization(organizationId);

    const name = input.name.trim();
    if (!name) {
      throw new Error('Project name is required');
    }

    const slug = this.normalizeSlug(input.slug || name);
    if (!slug) {
      throw new Error('Project slug is required');
    }

    const existing = await this.repository.findBySlug(slug);
    if (existing) {
      throw new Error('A project with this slug already exists');
    }

    await this.repository.create({
      id: crypto.randomUUID(),
      organizationId,
      slug,
      name,
      description: input.description?.trim() || undefined,
      status: this.sanitizeStatus(input.status),
      modules: this.sanitizeModules(input.modules),
      settings: DEFAULT_PROJECT_SETTINGS,
    });

    const created = await this.repository.findBySlug(slug);
    if (!created) {
      throw new Error('Failed to create project');
    }

    const json = created.toJson();
    this.publish('project.created', json, () => ({
      projectId: json.id,
      name: json.name,
      slug: json.slug ?? slug,
    }));
    return json;
  }

  async updateProject(
    id: string,
    changes: {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: Partial<ProjectModules>;
      organizationId?: string;
      settings?: ProjectSettings;
    },
  ) {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }
    // deep copy: the stored row may be the same object the repository mutates on update
    const before = JSON.parse(JSON.stringify(project.toJson())) as ReturnType<
      typeof project.toJson
    >;

    const patch: {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: ProjectModules;
      organizationId?: string;
      settings?: ProjectSettings;
    } = {};

    if (changes.organizationId !== undefined) {
      const organizationId = changes.organizationId.trim();
      if (!organizationId) {
        throw new Error('Organization is required');
      }
      await this.organizationLookup.getOrganization(organizationId);
      patch.organizationId = organizationId;
    }

    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (!name) {
        throw new Error('Project name is required');
      }
      patch.name = name;
    }

    if (changes.slug !== undefined) {
      const slug = this.normalizeSlug(changes.slug);
      if (!slug) {
        throw new Error('Project slug is required');
      }

      const existing = await this.repository.findBySlug(slug);
      if (existing && existing.id !== id) {
        throw new Error('A project with this slug already exists');
      }
      patch.slug = slug;
    }

    if (changes.description !== undefined) {
      patch.description = changes.description.trim();
    }

    if (changes.status !== undefined) {
      patch.status = this.sanitizeStatus(changes.status);
    }

    if (changes.modules !== undefined) {
      patch.modules = this.sanitizeModules({ ...project.modules, ...changes.modules });
    }

    if (changes.settings !== undefined) {
      patch.settings = changes.settings;
    }

    await this.repository.update(id, patch);

    const updated = await this.repository.findById(id);
    if (!updated) {
      throw new Error('Failed to update project');
    }

    const after = updated.toJson();
    this.publish('project.updated', after, () => ({
      projectId: after.id,
      name: after.name,
      slug: after.slug ?? '',
      changedFields: this.changedFields(before, after),
    }));
    return after;
  }

  async deleteProject(id: string) {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }

    await this.repository.deleteById(id);

    const json = project.toJson();
    this.publish('project.deleted', json, () => ({
      projectId: json.id,
      name: json.name,
      slug: json.slug ?? '',
    }));
  }

  // events never break the write that already succeeded: failures are only logged
  private publish<K extends 'project.created' | 'project.updated' | 'project.deleted'>(
    type: K,
    project: { id: string; organization?: { id: string } | null },
    buildPayload: () => DomainEventMap[K],
  ) {
    if (!this.events) return;
    try {
      this.events.publish(type, buildPayload(), {
        scope: { organizationId: project.organization?.id ?? null, projectId: project.id },
      });
    } catch (error) {
      log.error({ err: error, eventType: type, projectId: project.id }, 'failed to publish event');
    }
  }

  private changedFields(
    before: { [key: string]: unknown; organization?: { id: string } | null },
    after: { [key: string]: unknown; organization?: { id: string } | null },
  ): ProjectChangedField[] {
    const same = (left: unknown, right: unknown) =>
      JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    const fields: ProjectChangedField[] = [];
    for (const field of ['name', 'slug', 'description', 'status', 'modules', 'settings'] as const) {
      if (!same(before[field], after[field])) fields.push(field);
    }
    if ((before.organization?.id ?? null) !== (after.organization?.id ?? null)) {
      fields.push('organization');
    }
    return fields;
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private sanitizeStatus(status?: string): ProjectStatusValue {
    return status === 'inactive' ? 'inactive' : 'active';
  }

  private sanitizeModules(modules?: Partial<ProjectModules>): ProjectModules {
    return {
      vault: modules?.vault ?? DEFAULT_PROJECT_MODULES.vault,
      codereport: modules?.codereport ?? DEFAULT_PROJECT_MODULES.codereport,
      stateiac: modules?.stateiac ?? DEFAULT_PROJECT_MODULES.stateiac,
      monitoring: modules?.monitoring ?? DEFAULT_PROJECT_MODULES.monitoring,
    };
  }
}
