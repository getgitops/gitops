import { describe, expect, it, beforeEach } from 'vitest';
import { ProjectService } from './project.service';
import { ProjectDomain } from '../domain/project.domain';

const DEFAULT_ORGANIZATION_ID = 'org-1';

class FakeProjectRepository {
  rows: ProjectDomain[] = [];

  async findAll() {
    return [...this.rows];
  }

  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.rows.find((p) => p.slug === slug) ?? null;
  }

  async create(input: {
    id: string;
    organizationId: string;
    slug: string;
    name: string;
    description?: string;
    status: string;
    modules: { vault: boolean; openreport: boolean; stateiac: boolean };
  }) {
    this.rows.push(
      new ProjectDomain({
        id: input.id,
        organization: { id: input.organizationId, name: 'Org', slug: 'org' },
        slug: input.slug,
        name: input.name,
        description: input.description,
        status: input.status,
        modules: input.modules,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
  }

  async update(
    id: string,
    changes: {
      name?: string;
      slug?: string;
      description?: string;
      status?: string;
      modules?: { vault: boolean; openreport: boolean; stateiac: boolean };
      organizationId?: string;
    },
  ) {
    const project = this.rows.find((p) => p.id === id);
    if (!project) return;
    if (changes.name !== undefined) project.name = changes.name;
    if (changes.slug !== undefined) project.slug = changes.slug;
    if (changes.description !== undefined) project.description = changes.description;
    if (changes.status !== undefined) project.status = changes.status as 'active' | 'inactive';
    if (changes.modules !== undefined) project.modules = changes.modules;
    if (changes.organizationId !== undefined) {
      project.organization = { id: changes.organizationId, name: 'Org', slug: 'org' } as any;
    }
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((p) => p.id !== id);
  }
}

class FakeOrganizationLookup {
  async getOrganization(id: string) {
    return { id, name: 'Org', slug: 'org' };
  }
}

describe('ProjectService', () => {
  let repository: FakeProjectRepository;
  let service: ProjectService;

  beforeEach(() => {
    repository = new FakeProjectRepository();
    service = new ProjectService(repository as any, new FakeOrganizationLookup());
  });

  function withOrg(input: Record<string, unknown> = {}) {
    return { organizationId: DEFAULT_ORGANIZATION_ID, ...input };
  }

  function createProject(input: Record<string, unknown>) {
    return service.createProject(withOrg(input) as any);
  }

  describe('listProjects', () => {
    it('returns an empty list when there are no projects', async () => {
      expect(await service.listProjects()).toEqual([]);
    });

    it('lists created projects', async () => {
      await createProject({ name: 'Platform Core' });
      const projects = await service.listProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].slug).toBe('platform-core');
    });
  });

  describe('getProject / getProjectBySlug', () => {
    it('throws when the project does not exist', async () => {
      await expect(service.getProject('missing-id')).rejects.toThrow(/not found/);
      await expect(service.getProjectBySlug('missing-slug')).rejects.toThrow(/not found/);
    });

    it('returns the project by id and by slug', async () => {
      const created = await createProject({ name: 'Kettu Studio' });

      const byId = await service.getProject(created.id);
      expect(byId.slug).toBe('kettu-studio');

      const bySlug = await service.getProjectBySlug('kettu-studio');
      expect(bySlug.id).toBe(created.id);
    });
  });

  describe('createProject', () => {
    it('requires a non-empty name', async () => {
      await expect(createProject({ name: '   ' })).rejects.toThrow(/name is required/);
    });

    it('auto-generates a normalized slug from the name when none is provided', async () => {
      const project = await createProject({ name: 'Kettu Studio!!' });
      expect(project.slug).toBe('kettu-studio');
    });

    it('uses the provided slug, normalized', async () => {
      const project = await createProject({ name: 'Kettu Studio', slug: 'Custom Slug' });
      expect(project.slug).toBe('custom-slug');
    });

    it('rejects creating a project with a duplicate slug', async () => {
      await createProject({ name: 'Kettu Studio' });
      await expect(createProject({ name: 'Kettu Studio' })).rejects.toThrow(/already exists/);
    });

    it('defaults status to active for missing or invalid values', async () => {
      const project = await createProject({ name: 'Project A' });
      expect(project.status).toBe('active');
    });

    it('accepts an explicit inactive status', async () => {
      const project = await createProject({ name: 'Project B', status: 'inactive' });
      expect(project.status).toBe('inactive');
    });

    it('defaults all modules to enabled when none are provided', async () => {
      const project = await createProject({ name: 'Project C' });
      expect(project.modules).toEqual({ vault: true, openreport: true, stateiac: true });
    });

    it('accepts a partial modules override, defaulting the rest to enabled', async () => {
      const project = await createProject({
        name: 'Project D',
        modules: { vault: false },
      });
      expect(project.modules).toEqual({ vault: false, openreport: true, stateiac: true });
    });
  });

  describe('updateProject', () => {
    it('throws when the project does not exist', async () => {
      await expect(service.updateProject('missing-id', { name: 'X' })).rejects.toThrow(/not found/);
    });

    it('updates only the fields provided', async () => {
      const created = await createProject({ name: 'Original Name' });

      const updated = await service.updateProject(created.id, { description: 'New description' });
      expect(updated.name).toBe('Original Name');
      expect(updated.description).toBe('New description');
    });

    it('rejects clearing the name', async () => {
      const created = await createProject({ name: 'Original Name' });
      await expect(service.updateProject(created.id, { name: '   ' })).rejects.toThrow(
        /name is required/,
      );
    });

    it('normalizes the slug when updating it', async () => {
      const created = await createProject({ name: 'Original Name' });
      const updated = await service.updateProject(created.id, { slug: 'New Slug!!' });
      expect(updated.slug).toBe('new-slug');
    });

    it('rejects updating to a slug already used by another project', async () => {
      await createProject({ name: 'Project A', slug: 'taken' });
      const created = await createProject({ name: 'Project B' });

      await expect(service.updateProject(created.id, { slug: 'taken' })).rejects.toThrow(
        /already exists/,
      );
    });

    it('allows keeping the same slug on the same project', async () => {
      const created = await createProject({ name: 'Project A', slug: 'same-slug' });
      const updated = await service.updateProject(created.id, { slug: 'same-slug' });
      expect(updated.slug).toBe('same-slug');
    });

    it('merges partial module updates with the existing modules', async () => {
      const created = await createProject({ name: 'Project A' });

      const updated = await service.updateProject(created.id, { modules: { vault: false } });
      expect(updated.modules).toEqual({ vault: false, openreport: true, stateiac: true });

      const updatedAgain = await service.updateProject(created.id, {
        modules: { openreport: false },
      });
      expect(updatedAgain.modules).toEqual({ vault: false, openreport: false, stateiac: true });
    });

    it('updates the status', async () => {
      const created = await createProject({ name: 'Project A' });
      const updated = await service.updateProject(created.id, { status: 'inactive' });
      expect(updated.status).toBe('inactive');
    });
  });

  describe('deleteProject', () => {
    it('throws when the project does not exist', async () => {
      await expect(service.deleteProject('missing-id')).rejects.toThrow(/not found/);
    });

    it('deletes an existing project', async () => {
      const created = await createProject({ name: 'Project A' });

      await service.deleteProject(created.id);

      const projects = await service.listProjects();
      expect(projects.find((p) => p.id === created.id)).toBeUndefined();
    });
  });
});
