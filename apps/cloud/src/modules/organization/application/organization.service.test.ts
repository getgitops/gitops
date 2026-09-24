import { describe, expect, it, beforeEach } from 'vitest';
import { OrganizationService } from './organization.service';
import { OrganizationDomain } from '../domain/organization.domain';

class FakeOrganizationRepository {
  rows: OrganizationDomain[] = [];

  async findAll() {
    return [...this.rows];
  }

  async findById(id: string) {
    return this.rows.find((o) => o.id === id) ?? null;
  }

  async findBySlug(slug: string) {
    return this.rows.find((o) => o.slug === slug) ?? null;
  }

  async create(input: { id: string; slug: string; name: string; description?: string }) {
    this.rows.push(
      new OrganizationDomain({
        id: input.id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }),
    );
  }

  async update(id: string, changes: { name?: string; slug?: string; description?: string }) {
    const organization = this.rows.find((o) => o.id === id);
    if (!organization) return;
    if (changes.name !== undefined) organization.name = changes.name;
    if (changes.slug !== undefined) organization.slug = changes.slug;
    if (changes.description !== undefined) organization.description = changes.description;
  }

  async deleteById(id: string) {
    this.rows = this.rows.filter((o) => o.id !== id);
  }
}

describe('OrganizationService', () => {
  let repository: FakeOrganizationRepository;
  let service: OrganizationService;

  beforeEach(() => {
    repository = new FakeOrganizationRepository();
    service = new OrganizationService(repository as any);
  });

  describe('listOrganizations', () => {
    it('returns an empty list when there are no organizations', async () => {
      expect(await service.listOrganizations()).toEqual([]);
    });

    it('lists created organizations', async () => {
      await service.createOrganization({ name: 'GitOps' });
      const organizations = await service.listOrganizations();
      expect(organizations).toHaveLength(1);
      expect(organizations[0].slug).toBe('gitops');
    });
  });

  describe('getOrganization / findBySlug', () => {
    it('throws when the organization does not exist', async () => {
      await expect(service.getOrganization('missing-id')).rejects.toThrow(/not found/);
      await expect(service.findBySlug('missing-slug')).rejects.toThrow(/not found/);
    });

    it('returns the organization by id and by slug', async () => {
      const created = await service.createOrganization({ name: 'Kettu' });

      const byId = await service.getOrganization(created.id);
      expect(byId.slug).toBe('kettu');

      const bySlug = await service.findBySlug('kettu');
      expect(bySlug.id).toBe(created.id);
    });
  });

  describe('createOrganization', () => {
    it('requires a non-empty name', async () => {
      await expect(service.createOrganization({ name: '   ' })).rejects.toThrow(
        /name is required/,
      );
    });

    it('auto-generates a normalized slug from the name when none is provided', async () => {
      const organization = await service.createOrganization({ name: 'Kettu Studio!!' });
      expect(organization.slug).toBe('kettu-studio');
    });

    it('uses the provided slug, normalized', async () => {
      const organization = await service.createOrganization({
        name: 'Kettu Studio',
        slug: 'Custom Slug',
      });
      expect(organization.slug).toBe('custom-slug');
    });

    it('rejects creating an organization with a duplicate slug', async () => {
      await service.createOrganization({ name: 'Kettu Studio' });
      await expect(service.createOrganization({ name: 'Kettu Studio' })).rejects.toThrow(
        /already exists/,
      );
    });

    it('trims the optional description', async () => {
      const organization = await service.createOrganization({
        name: 'Kettu Studio',
        description: '  A studio  ',
      });
      expect(organization.description).toBe('A studio');
    });
  });

  describe('updateOrganization', () => {
    it('throws when the organization does not exist', async () => {
      await expect(service.updateOrganization('missing-id', { name: 'X' })).rejects.toThrow(
        /not found/,
      );
    });

    it('updates only the fields provided', async () => {
      const created = await service.createOrganization({ name: 'Original Name' });

      const updated = await service.updateOrganization(created.id, {
        description: 'New description',
      });
      expect(updated.name).toBe('Original Name');
      expect(updated.description).toBe('New description');
    });

    it('rejects clearing the name', async () => {
      const created = await service.createOrganization({ name: 'Original Name' });
      await expect(service.updateOrganization(created.id, { name: '   ' })).rejects.toThrow(
        /name is required/,
      );
    });

    it('normalizes the slug when updating it', async () => {
      const created = await service.createOrganization({ name: 'Original Name' });
      const updated = await service.updateOrganization(created.id, { slug: 'New Slug!!' });
      expect(updated.slug).toBe('new-slug');
    });

    it('rejects updating to a slug already used by another organization', async () => {
      await service.createOrganization({ name: 'Organization A', slug: 'taken' });
      const created = await service.createOrganization({ name: 'Organization B' });

      await expect(service.updateOrganization(created.id, { slug: 'taken' })).rejects.toThrow(
        /already exists/,
      );
    });

    it('allows keeping the same slug on the same organization', async () => {
      const created = await service.createOrganization({
        name: 'Organization A',
        slug: 'same-slug',
      });
      const updated = await service.updateOrganization(created.id, { slug: 'same-slug' });
      expect(updated.slug).toBe('same-slug');
    });
  });

  describe('deleteOrganization', () => {
    it('throws when the organization does not exist', async () => {
      await expect(service.deleteOrganization('missing-id')).rejects.toThrow(/not found/);
    });

    it('removes the organization', async () => {
      const created = await service.createOrganization({ name: 'Organization A' });
      await service.deleteOrganization(created.id);
      await expect(service.getOrganization(created.id)).rejects.toThrow(/not found/);
    });
  });
});
