import crypto from 'crypto';
import { ProjectRepository } from '../infrastructure/repositories/project.repostitory';
import { DEFAULT_PROJECT_MODULES, type ProjectModules } from '../domain/project.domain';

export type ProjectStatusValue = 'active' | 'inactive';

export interface OrganizationLookup {
  getOrganization(id: string): Promise<unknown>;
}

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly organizationLookup: OrganizationLookup,
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
    });

    const created = await this.repository.findBySlug(slug);
    if (!created) {
      throw new Error('Failed to create project');
    }

    return created.toJson();
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
    },
  ) {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }

    const patch: {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: ProjectModules;
      organizationId?: string;
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

    await this.repository.update(id, patch);

    const updated = await this.repository.findById(id);
    if (!updated) {
      throw new Error('Failed to update project');
    }

    return updated.toJson();
  }

  async deleteProject(id: string) {
    const project = await this.repository.findById(id);
    if (!project) {
      throw new Error('Project not found');
    }

    await this.repository.deleteById(id);
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
    };
  }
}
